// Verify the proxy API used by electron-builder after the dependency override.
import http from 'node:http';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
const electronGet = builderRequire('@electron/get');
let requests = 0;
const proxy = http.createServer((request, response) => {
  assert.equal(request.url, 'http://mirros-proxy-test.invalid/');
  requests++;
  response.end('mirros-proxy-ok');
});
await new Promise((resolve, reject) => {
  proxy.once('error', reject);
  proxy.listen(0, '127.0.0.1', resolve);
});
try {
  // This script is a separate process: no proxy settings escape to other tests.
  process.env.GLOBAL_AGENT_HTTP_PROXY = `http://127.0.0.1:${proxy.address().port}`;
  process.env.GLOBAL_AGENT_NO_PROXY = '';
  electronGet.initializeProxy();
  const body = await new Promise((resolve, reject) => {
    const request = http.get('http://mirros-proxy-test.invalid/', response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {body += chunk;});
      response.on('end', () => resolve(body));
      response.on('error', reject);
    });
    request.setTimeout(5000, () => request.destroy(Error('Proxy request timed out')));
    request.on('error', reject);
  });
  assert.equal(body, 'mirros-proxy-ok');
  assert.equal(requests, 1);
  console.log('electron-builder proxy bootstrap and HTTP routing verified.');
} finally {
  proxy.closeAllConnections();
  await new Promise(resolve => proxy.close(resolve));
}
