// Exercise the packaged UI, including both window modes, without requiring USB.
import {spawn, execFile} from 'node:child_process';
import {promisify} from 'node:util';
import net from 'node:net';
import runtime from '../desktop/runtime.cjs';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const expectedVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const profile = await mkdtemp(path.join(os.tmpdir(), 'mirros-smoke-'));
const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {const selected = server.address().port; server.close(() => resolve(selected));});
});
const child = spawn(path.resolve(process.argv[2]), [], {windowsHide:true, detached:process.platform !== 'win32', stdio:['ignore','pipe','pipe'], env:{...process.env, MIRROS_TEST_PROFILE:profile, MIRROS_DEBUG_PORT:String(port)}});
child.mirrosProcessGroup = process.platform !== 'win32';
let logs = '', ws, pageId, sequence = 0;
const pending = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
child.stdout.on('data', data => {logs += data;});
child.stderr.on('data', data => {logs += data;});
child.on('error', error => {logs += error.message;});
async function evaluate(expression) {
  const id = ++sequence;
  const reply = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {pending.delete(id); reject(Error('Renderer evaluation timed out'));}, 15000);
    pending.set(id, message => {clearTimeout(timer); resolve(message);});
    ws.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression, returnByValue:true, awaitPromise:true}}));
  });
  if (reply.error || reply.result.exceptionDetails) throw Error(JSON.stringify(reply.error || reply.result.exceptionDetails));
  return reply.result.result.value;
}
async function attach(previousId) {
  let page;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error(`Desktop exited: ${logs.slice(-4000)}`);
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, {signal:AbortSignal.timeout(1500)})).json();
      page = pages.find(p => p.type === 'page' && p.url.startsWith('http://127.0.0.1:') && p.id !== previousId);
      if (page) break;
    } catch {}
    await pause(500);
  }
  assert(page, `Desktop did not start: ${logs.slice(-4000)}`);
  ws?.close();
  pageId = page.id;
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {const timer = setTimeout(() => reject(Error('Debugger connection timed out')), 5000); ws.onopen = () => {clearTimeout(timer); resolve();}; ws.onerror = error => {clearTimeout(timer); reject(error);};});
  ws.onmessage = event => {const message = JSON.parse(event.data); pending.get(message.id)?.(message); pending.delete(message.id);};
  let ready = false;
  for (let i = 0; i < 100; i++) {
    ready = await evaluate("Boolean(window.mirros && document.querySelector('canvas'))");
    if (ready) break;
    await pause(100);
  }
  assert(ready, `Preload and React did not become ready: ${logs.slice(-4000)}`);
}
try {
  await attach();
  assert.equal((await evaluate('window.mirros.state()')).version, expectedVersion);
  assert(await evaluate("document.querySelector('.studio') !== null && document.querySelector('.controls-tab') !== null"));
  await evaluate("window.mirros.action('mode','phone')");
  await attach(pageId);
  assert(await evaluate("document.querySelector('.floating-app') !== null && document.querySelector('.control-drag') !== null"));
  await evaluate("window.mirros.action('mode','studio')");
  await attach(pageId);
  assert(await evaluate("document.querySelector('.studio') !== null"));
  await evaluate("window.mirros.action('disconnect')");
  assert.equal((await evaluate('window.mirros.state()')).phase, 'pausado');
  await pause(5500); // A full background scan period must not reconnect a paused session.
  assert.equal((await evaluate('window.mirros.state()')).phase, 'pausado');
  const exited = new Promise(resolve => child.once('exit', resolve));
  await evaluate("setTimeout(()=>window.mirros.action('close'),100);true");
  let deadline;
  try {
    await Promise.race([exited, new Promise((_, reject) => {deadline = setTimeout(() => reject(Error('Desktop did not close safely')), 15000);})]);
  } finally {clearTimeout(deadline);}
  assert.equal(child.exitCode, 0);
  console.log('Packaged desktop rendered studio and floating windows, stayed paused and closed safely.');
} finally {
  ws?.close();
  if (child.exitCode === null) {
    // Release input even if CDP or a renderer failed. Logs belong to this test profile.
    const backendLog = await readFile(path.join(profile, 'mirros.log'), 'utf8').catch(() => '');
    const urls = [...backendLog.matchAll(/Open (http:\/\/127\.0\.0\.1:\d+)\//g)].map(match => match[1]);
    await Promise.allSettled(urls.map(url => fetch(url + '/session/end', {method:'POST', signal:AbortSignal.timeout(2000)})));
    if (process.platform !== 'win32') {
      // Detached USB workers have their own groups; include their PIDs in cleanup.
      const {stdout} = await promisify(execFile)('ps', ['-eo', 'pid=,ppid=']);
      const records = stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
      const owned = new Set([child.pid]);
      let previous;
      do {previous = owned.size; for (const [pid, parent] of records) if (owned.has(parent)) owned.add(pid);} while (owned.size !== previous);
      for (const pid of [...owned].reverse()) if (pid !== child.pid) {try {process.kill(pid, 'SIGTERM');} catch (error) {if (error.code !== 'ESRCH') throw error;}}
    }
    await runtime.stopProcess(child);
  }
  await rm(profile, {recursive:true, force:true, maxRetries:5, retryDelay:200});
}
