import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../frontend/src/orientation.js', import.meta.url), 'utf8');
const {frameRotation, devicePoint, rotateDevice, followOrientation} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('portrait buffers rotate, already landscape pixels do not rotate twice', () => {
  assert.equal(frameRotation('landscapeLeft',1264,2752),-90);
  assert.equal(frameRotation('landscapeRight',1264,2752),90);
  assert.equal(frameRotation('landscapeLeft',2752,1264),0);
  assert.equal(frameRotation('portraitUpsideDown',1264,2752),180);
  assert.equal(frameRotation('unknown',1264,2752),0);
});
test('touches and wheel paths inverse rotate into device coordinates', () => {
  for(const angle of [0,90,180,270,-90]) {
    const p={x:10000,y:50000};
    assert.deepEqual(devicePoint(devicePoint(p,angle),-angle),p);
  }
  assert.deepEqual(devicePoint({x:0,y:0},90),{x:0,y:65535});
  assert.deepEqual(devicePoint({x:0,y:0},-90),{x:65535,y:0});
});
test('rotate asks iOS to rotate, and does not pretend success on failure', async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>{assert.equal(url,'/rotate');assert.deepEqual(JSON.parse(options.body),{direction:'right'});return {ok:true,json:async()=>({currentDeviceOrientation:'landscapeRight'})};};
    assert.equal((await rotateDevice()).currentDeviceOrientation,'landscapeRight');
    globalThis.fetch=async()=>({ok:false});await assert.rejects(rotateDevice(),/No se pudo girar/);
  }finally{globalThis.fetch=original;}
});
test('orientation polling stops cleanly when the view closes', async()=>{
  const original=globalThis.fetch;const seen=[];let calls=0;
  try {
    globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({orientation:'landscapeLeft'})};};
    const stop=followOrientation(value=>seen.push(value));await new Promise(r=>setTimeout(r,20));stop();
    assert.deepEqual(seen,['landscapeLeft']);assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});
