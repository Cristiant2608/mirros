import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../frontend/public/audio-worklet.js', import.meta.url), 'utf8');
function player(rate = 48000) {
  let Player;
  const messages = [];
  vm.runInNewContext(code, {ArrayBuffer, DataView, Float32Array, sampleRate: rate,
    AudioWorkletProcessor: class { constructor() { this.port = {postMessage: message => messages.push(message)}; } },
    registerProcessor(_name, type) {Player = type;}});
  const p = new Player();
  const push = (frames, left = 8192, right = -8192) => {
    const data = new ArrayBuffer(frames * 4), pcm = new DataView(data);
    for (let i = 0; i < frames; i++) {pcm.setInt16(i * 4, left, true);pcm.setInt16(i * 4 + 2, right, true);}
    p.port.onmessage({data});
  };
  const render = (frames = 128) => {
    const output = [new Float32Array(frames), new Float32Array(frames)];
    assert.equal(p.process([], [output]), true); return output;
  };
  return {p, messages, push, render};
}
test('audio waits for a jitter reserve, then preserves stereo PCM order and level', () => {
  const {p, push, render, messages} = player();
  push(2880); assert.ok(render()[0].every(x => x === 0)); assert.equal(p.count, 2880);
  push(2880); render(); const [left, right] = render();
  assert.ok(left.every(x => x === .25)); assert.ok(right.every(x => x === -.25));
  assert.deepEqual(messages, ['playing']);
});
test('a 300 ms arrival burst plays sequentially without overlapping or resetting the cursor', () => {
  const {p, push, render} = player();
  push(14400);
  for (let i = 0; i < 100; i++) {
    const [left] = render(); assert.ok(left.every(x => x >= 0 && x <= .25));
  }
  assert.equal(p.count, 14400 - 12800); assert.equal(p.playing, true);
});
test('late packets cause adaptive rebuffering instead of repeated tiny gaps', () => {
  const {p, push, render, messages} = player(); push(5760);
  for (let i = 0; i < 46; i++) render();
  assert.equal(p.playing, false); assert.equal(p.target, 7680);
  push(5760); assert.ok(render()[0].every(x => x === 0));
  push(1920); render(); assert.equal(p.playing, true);
  assert.deepEqual(messages, ['playing', 'buffering', 'playing']);
  for (let n = 0; n < 5; n++) {while(p.playing) render(); push(p.target); render();}
  assert.equal(p.target, 11520);
});
test('excessive backlog is bounded and resumes with recent samples', () => {
  const {p, push, render} = player(); push(20000, 1000); push(6000, 10000);
  assert.equal(p.count, 6000); render();
  assert.ok(render()[0].every(x => x === 10000 / 32768));
  push(100000); assert.equal(p.count, p.capacity);
  p.port.onmessage({data: new ArrayBuffer(3)}); assert.equal(p.count, p.capacity);
});
test('48 kHz PCM keeps its duration on a 44.1 kHz output device', () => {
  const {p, push, render} = player(44100); push(24000);
  render(22049); assert.ok(p.count <= 2); assert.equal(p.playing, true);
  render(); assert.equal(p.playing, false);
});
const audioSource = fs.readFileSync(new URL('../frontend/src/audio.js', import.meta.url), 'utf8');
const {startAudio} = await import('data:text/javascript;base64,' + Buffer.from(audioSource).toString('base64'));
test('audio client reassembles split packets, deduplicates status and releases its reader on stop', async () => {
  const originals = {AudioContext:globalThis.AudioContext,AudioWorkletNode:globalThis.AudioWorkletNode,fetch:globalThis.fetch};
  let context, worker, pending, cancelled = false, released = false;
  const received = [], states = [];
  const packet = new Uint8Array(12);new DataView(packet.buffer).setUint32(0,8);packet.set([1,2,3,4,5,6,7,8],4);
  const chunks = [packet.slice(0,2),packet.slice(2,7),packet.slice(7),packet];
  globalThis.AudioContext = class {
    constructor() {context=this;this.audioWorklet={addModule:async url=>assert.equal(url,'/audio-worklet.js')};}
    createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
    async resume(){} async close(){this.closed=true;}
  };
  globalThis.AudioWorkletNode = class {
    constructor(){worker=this;this.port={postMessage:bytes=>{received.push(new Uint8Array(bytes));this.port.onmessage({data:'playing'});},close(){}};}
    connect(){} disconnect(){}
  };
  globalThis.fetch = async (_url,{signal}) => ({ok:true,body:{getReader:()=>({
    read:async()=>chunks.length?{value:chunks.shift(),done:false}:await new Promise(resolve=>{pending=resolve;signal.addEventListener('abort',()=>resolve({done:true}),{once:true});}),
    async cancel(){cancelled=true;pending?.({done:true});},releaseLock(){released=true;}
  })}});
  let audio;
  try {
    audio=startAudio({onStatus:state=>states.push(state)});
    for(let i=0;i<100&&received.length<2;i++) await new Promise(resolve=>setTimeout(resolve,2));
    assert.equal(received.length,2);assert.deepEqual(Array.from(received[0]),[1,2,3,4,5,6,7,8]);
    assert.equal(states.filter(x=>x==='Sonando en este PC').length,1);
    audio.stop();await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(context.closed,true);assert.equal(cancelled,true);assert.equal(released,true);
  } finally {audio?.stop();Object.assign(globalThis,originals);}
});
