const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {once} = require('node:events');
const {attachControlProxy} = require('../desktop/control-proxy.cjs');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
function upgrade(port, origin) {
  return http.request({hostname:'127.0.0.1', port, path:'/control', headers:{Connection:'Upgrade', Upgrade:'websocket', Origin:origin, 'Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version':'13', 'Sec-WebSocket-Protocol':'mirros-control-v1'}});
}
test('control proxy forwards upgrades and bytes, rewriting host and removing origin', async t => {
  const peers = [];
  const backend = http.createServer();
  backend.on('upgrade', (req, socket) => {
    assert.equal(req.headers.origin, undefined);
    assert.equal(req.headers.host, `127.0.0.1:${backend.address().port}`);
    assert.equal(req.headers['sec-websocket-protocol'], 'mirros-control-v1');
    peers.push(socket);
    socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    socket.on('data', data => socket.write(data));
  });
  await listen(backend);
  const proxy = http.createServer(); attachControlProxy(proxy, () => backend.address().port); await listen(proxy);
  t.after(() => { peers.forEach(p => p.destroy()); proxy.closeAllConnections(); backend.closeAllConnections(); proxy.close(); backend.close(); });
  const request = upgrade(proxy.address().port, `http://127.0.0.1:${proxy.address().port}`);
  const upgraded = once(request, 'upgrade'); request.end();
  const [, socket] = await upgraded; peers.push(socket);
  socket.write(Buffer.from([1, 2, 3, 4]));
  const [data] = await once(socket, 'data'); assert.deepEqual(data, Buffer.from([1, 2, 3, 4]));
  socket.destroy();
});
test('control proxy refuses foreign origins before connecting to the backend', async t => {
  let contacted = false;
  const proxy = http.createServer(); attachControlProxy(proxy, () => { contacted = true; return 1; }); await listen(proxy);
  t.after(() => { proxy.closeAllConnections(); proxy.close(); });
  const request = upgrade(proxy.address().port, 'https://untrusted.example');
  const response = once(request, 'response'); request.end();
  const [res] = await response; res.resume(); assert.equal(res.statusCode, 403); assert.equal(contacted, false);
});
