import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../frontend/src/input.js', import.meta.url), 'utf8');
const {coordinates, edgeStart, wheelPath, createInput} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
globalThis.requestAnimationFrame = callback => setTimeout(callback, 1);
globalThis.cancelAnimationFrame = clearTimeout;
test('maps scaled canvas taps and clamps outside edges', () => {
  const rect = {left: 50, top: 100, width: 300, height: 650};
  assert.deepEqual(coordinates(200, 425, rect), {x: 32768, y: 32768});
  assert.deepEqual(coordinates(-100, 1000, rect), {x: 0, y: 65535});
});
test('wheel down moves the finger upward, with safe bounds', () => {
  const {start, end} = wheelPath({x: 100, y: 64000}, 120, 1);
  assert.ok(start.y > end.y); assert.ok(start.y <= 60535); assert.ok(end.y >= 5000); assert.equal(start.x, 6000);
  const up = wheelPath({x: 30000, y: 30000}, -120, 1);
  assert.ok(up.start.y < up.end.y);
});
test('rapid moves are coalesced and release is sent once after final contact', async () => {
  const sent = [];
  const input = createInput(async (_path, data) => { await new Promise(r => setTimeout(r, 2)); sent.push(data); });
  input.down(1, {x: 100, y: 100});
  for (let i = 0; i < 100; i++) input.move(1, {x: 200 + i, y: 300});
  input.release(1, {x: 500, y: 600}); input.release(1, {x: 500, y: 600});
  await input.idle();
  assert.deepEqual(sent.map(item => item.type), ['contact', 'contact', 'release']);
  assert.equal(sent.at(-1).x, 500); input.dispose();
});
test('blur releases the active touch instead of leaving a stuck finger', async () => {
  const sent = []; const input = createInput(async (_path, data) => sent.push(data));
  input.down(2, {x: 32000, y: 30000}); input.release(null); await input.idle();
  assert.equal(sent.at(-1).type, 'release'); input.dispose();
});
test('wheel is ignored while the mouse is dragging', async () => {
  const sent = []; const input = createInput(async (_path, data) => sent.push(data));
  input.down(3, {x: 32000, y: 30000}); input.wheel({x: 32000, y: 30000}, 120, 0, 600);
  await input.release(3); await new Promise(r => setTimeout(r, 200));
  assert.equal(sent.filter(item => item.type === 'contact').length, 1); input.dispose();
});

test('tiny pointer jitter remains a tap at the original pixel', async () => {
  const sent=[];const input=createInput(async(_,data)=>sent.push(data));
  input.down(1,{x:30000,y:30000});input.move(1,{x:30100,y:30100});await input.release(1,{x:30100,y:30100});
  assert.deepEqual(sent.map(e=>e.type),['contact','release']);assert.deepEqual(sent[1],{type:'release',x:30000,y:30000});input.dispose();
});
test('slow transport preserves a bounded swipe path, including its first move and release', async () => {
  const sent=[];let unblock;const blocked=new Promise(r=>unblock=r);
  const input=createInput(async(_,data)=>{sent.push(data);if(sent.length===1)await blocked;});
  input.down(1,{x:10000,y:10000});
  for(let i=0;i<30;i++){input.move(1,{x:10000+i*500,y:20000+i*500});await new Promise(r=>setTimeout(r,2));}
  const done=input.release(1,{x:50000,y:55000});unblock();await done;
  assert(sent.length>3 && sent.length<=26);
  assert.deepEqual(sent[1],{type:'contact',x:10000,y:20000});
  assert.deepEqual(sent.at(-2),{type:'contact',x:50000,y:55000});
  assert.deepEqual(sent.at(-1),{type:'release',x:50000,y:55000});input.dispose();
});

test('a delayed down preserves a stationary long press instead of replaying a tap', async () => {
  let unblock, downAt;
  const blocked = new Promise(resolve => { unblock = resolve; });
  const sent = [];
  const input = createInput(async (_, data) => {
    if (!sent.length) { await blocked; downAt = performance.now(); }
    sent.push({...data, at: performance.now()});
  });
  input.down(1, {x: 30000, y: 30000});
  await new Promise(resolve => setTimeout(resolve, 550));
  const released = input.release(1);
  unblock(); await released;
  assert.equal(sent.length, 2);
  assert(sent[1].at - downAt >= 520, 'the device must receive the hold duration after the delayed down');
  input.dispose();
});

test('edge swipes start at the device edge at any preview scale; interior taps stay exact', () => {
  for (const width of [200, 400]) {
    const size = {width, height: width * 2};
    assert.deepEqual(edgeStart({x: 60000, y: 4 / size.height * 65535}, size), {x: 60000, y: 0});
    assert.deepEqual(edgeStart({x: 32768, y: 65535 - 4 / size.height * 65535}, size), {x: 32768, y: 65535});
    assert.deepEqual(edgeStart({x: 32768, y: 32768}, size), {x: 32768, y: 32768});
  }
});

test('an initial transport delay still gives a programmatic swipe intermediate positions', async () => {
  const sent = [];
  const input = createInput(async (_, data) => {
    if (!sent.length) await new Promise(resolve => setTimeout(resolve, 220));
    sent.push(data);
  });
  await input.swipe('home');
  assert(sent.filter(data => data.type === 'contact').length > 4);
  assert.deepEqual(sent.at(-1), {type:'release', x:32768, y:25000});
  input.dispose();
});
test('wheel movement is proportional and supports horizontal scrolling',()=>{
  const tiny=wheelPath({x:30000,y:30000},1,1,650),large=wheelPath({x:30000,y:30000},120,1,650);
  assert(tiny.start.y-tiny.end.y<200);assert(large.start.y-large.end.y>10000);
  const horizontal=wheelPath({x:30000,y:30000},100,1,300,true);assert(horizontal.start.x>horizontal.end.x);assert.equal(horizontal.start.y,horizontal.end.y);
});
test('click interrupts scrolling and lifts the old finger first',async()=>{
  const sent=[];const input=createInput(async(_,data)=>sent.push(data));
  input.wheel({x:32000,y:32000},120,0,650);await new Promise(r=>setTimeout(r,35));
  assert(input.down(8,{x:22000,y:23000}));await input.release(8);
  const click=sent.findIndex(e=>e.type==='contact'&&e.x===22000&&e.y===23000);
  assert(click>0);assert.equal(sent[click-1].type,'release');assert.equal(sent.at(-1).type,'release');input.dispose();
});
test('zero-size canvas cannot produce invalid coordinates',()=>{assert.equal(coordinates(1,2,{left:0,top:0,width:0,height:0}),null);});

test('closing a controller discards waiting moves but still lifts the finger',async()=>{
  const sent=[];let unblock;const blocked=new Promise(r=>unblock=r);
  const input=createInput(async(_,data)=>{sent.push(data);if(sent.length===1)await blocked;});
  input.down(1,{x:10000,y:10000});await new Promise(r=>setTimeout(r,3));
  input.move(1,{x:50000,y:50000});await new Promise(r=>setTimeout(r,3));input.dispose();unblock();await input.idle();
  assert.deepEqual(sent.map(e=>e.type),['contact','release']);
});


test('returning from another window waits for keyboard detach before the first touch', async()=>{
  const events=[];let finishDetach;
  const input=createInput(async(_,data)=>events.push(data.type));
  input.down(1,{x:10000,y:10000});await input.release(1);
  input.enqueueAction(async()=>{events.push('detach-start');await new Promise(resolve=>{finishDetach=resolve;});events.push('detach-end');});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert(input.down(2,{x:20000,y:20000}));const released=input.release(2);
  assert.deepEqual(events,['contact','release','detach-start']);
  finishDetach();await released;
  assert.deepEqual(events,['contact','release','detach-start','detach-end','contact','release']);
  input.dispose();
});

test('swipe switcher sends gesture from bottom with pause before release', async () => {
  const sent = [];
  const input = createInput(async (_path, data) => sent.push(data));
  await input.swipe('switcher');
  assert.ok(sent.length >= 2);
  assert.equal(sent[0].type, 'contact');
  assert.equal(sent[0].x, 32768);
  assert.equal(sent[0].y, 64500);
  assert.equal(sent.at(-1).type, 'release');
  assert.equal(sent.at(-1).x, 32768);
  assert.equal(sent.at(-1).y, 38000);
  input.dispose();
});
