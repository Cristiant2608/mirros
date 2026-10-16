const http = require('node:http');

function attachControlProxy(server, getBackendPort) {
  server.on('upgrade', (req, socket, head) => {
    const host = `127.0.0.1:${server.address().port}`;
    if (req.url !== '/control' || req.method !== 'GET' || req.headers.host !== host ||
        (req.headers.origin && req.headers.origin !== `http://${host}`)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); return;
    }
    const port = getBackendPort();
    if (!port) { socket.end('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'); return; }
    const headers = {...req.headers, host: `127.0.0.1:${port}`};
    delete headers.origin;
    const upstream = http.request({hostname: '127.0.0.1', port, path: '/control', headers});
    let peer;
    const timer = setTimeout(() => { upstream.destroy(); socket.destroy(); }, 3000);
    const cleanup = () => { clearTimeout(timer); upstream.destroy(); peer?.destroy(); };
    socket.on('error', cleanup);
    socket.on('close', cleanup);
    upstream.on('error', () => { clearTimeout(timer); socket.destroy(); });
    upstream.on('response', response => {
      clearTimeout(timer);
      socket.end(`HTTP/1.1 ${response.statusCode} Control unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
      response.resume();
    });
    upstream.on('upgrade', (response, remote, remoteHead) => {
      clearTimeout(timer); peer = remote;
      if (socket.destroyed) { remote.destroy(); return; }
      remote.on('error', () => socket.destroy());
      remote.on('close', () => socket.destroy());
      const lines = [`HTTP/1.1 ${response.statusCode} ${response.statusMessage}`];
      for (let i = 0; i < response.rawHeaders.length; i += 2) lines.push(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}`);
      socket.write(lines.join('\r\n') + '\r\n\r\n');
      if (remoteHead.length) socket.write(remoteHead);
      if (head.length) remote.write(head);
      socket.pipe(remote).pipe(socket);
    });
    upstream.end();
  });
}
module.exports = {attachControlProxy};
