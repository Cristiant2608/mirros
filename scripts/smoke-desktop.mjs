import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const expectedVersion = JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8')).version;
const profile = await mkdtemp(path.join(os.tmpdir(),'mirros-smoke-'));
const port = 19338;
const child = spawn(path.resolve(process.argv[2]),[],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,MIRROS_TEST_PROFILE:profile,MIRROS_DEBUG_PORT:String(port)}});
let logs='',ws,sequence=0;
child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
child.on('error',error=>{logs+=error.message;});
try {
  let page;
  for(let i=0;i<120;i++) {
    if(child.exitCode!==null)throw new Error(`Desktop exited: ${logs.slice(-4000)}`);
    try { const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();page=pages.find(p=>p.type==='page'&&p.url.startsWith('http://127.0.0.1:'));if(page)break; } catch {}
    await new Promise(r=>setTimeout(r,500));
  }
  assert(page,`Desktop did not start: ${logs.slice(-4000)}`);
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);pending.get(m.id)?.(m);pending.delete(m.id);};
  const evaluate=async expression=>{const id=++sequence;const reply=await new Promise(r=>{pending.set(id,r);ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});if(reply.result.exceptionDetails)throw Error(JSON.stringify(reply.result.exceptionDetails));return reply.result.result.value;};
  const state=await evaluate('window.mirros.state()');assert(state.version===expectedVersion);
  assert(await evaluate("document.querySelector('canvas')!==null && document.querySelector('.controls-tab')!==null"));
  await evaluate("window.mirros.action('disconnect')");
  assert.equal((await evaluate('window.mirros.state()')).phase,'pausado');
  await evaluate("setTimeout(()=>window.mirros.action('close'),100);true");
  await Promise.race([new Promise(r=>child.once('exit',r)),new Promise((_,j)=>setTimeout(()=>j(Error('Desktop did not close safely')),15000))]);
  assert.equal(child.exitCode,0);console.log('Packaged desktop started, rendered, paused and closed safely.');
}finally{
  ws?.close();if(child.exitCode===null)child.kill();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
