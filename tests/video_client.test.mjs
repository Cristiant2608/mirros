import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
let source=await fs.readFile(new URL('../frontend/src/video.js',import.meta.url),'utf8');
source=source.replace(/import \{iosScrcpyHevcDimensions\}[^;]+;/, 'const iosScrcpyHevcDimensions=()=>({codedWidth:16,codedHeight:16});');
source=source.replace(/import \{frameRotation\}[^;]+;/,'const frameRotation=()=>0;');
source=source.replace('./packets.mjs',new URL('../frontend/src/packets.mjs',import.meta.url).href);
const {startVideo}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const tick=()=>new Promise(r=>setTimeout(r,0));
test('forced compatible video sends the selected profile and backs off after EOF', async()=>{
  const original={fetch:globalThis.fetch};
  const requested=[], modes=[]; let canceled=0, released=0;
  globalThis.fetch=async url=>{
    requested.push(url);
    return {ok:true,body:{getReader:()=>({read:async()=>({done:true}),cancel:async()=>canceled++,releaseLock:()=>released++})}};
  };
  let stop;
  try {
    stop=startVideo({getContext:()=>({})},{onFrame(){},onStatus(){},onDimensions(){},onMode:mode=>modes.push(mode),quality:'economy',forceSoftware:true});
    for(let i=0;i<5;i++)await tick();
    assert.deepEqual(requested,['/frames.bin?quality=economy']);
    assert.deepEqual(modes,['software']);
    assert.equal(canceled,1);assert.equal(released,1);
  } finally {stop?.();Object.assign(globalThis,original);}
});
test('a late JPEG after disconnect is closed without drawing or scheduling a frame', async()=>{
  const original={fetch:globalThis.fetch,VideoDecoder:globalThis.VideoDecoder,createImageBitmap:globalThis.createImageBitmap,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  let finishBitmap,closed=0,canceled=0,released=0,draws=0,scheduled=0;
  globalThis.VideoDecoder=undefined;
  globalThis.requestAnimationFrame=()=>{scheduled++;return 1;};globalThis.cancelAnimationFrame=()=>{};
  globalThis.createImageBitmap=()=>new Promise(resolve=>{finishBitmap=resolve;});
  globalThis.fetch=async(url)=>url==='/codec'?{ok:true,json:async()=>({codec:'hev1',description:'AA=='})}:{ok:true,body:{getReader:()=>({read:async()=>({done:false,value:Uint8Array.from([0,0,0,1,7])}),cancel:async()=>canceled++,releaseLock:()=>released++})}};
  const canvas={getContext:()=>({drawImage:()=>draws++})};
  let stop;
  try{
    stop=startVideo(canvas,{onFrame(){},onStatus(){},onDimensions(){}});
    for(let i=0;i<20&&!finishBitmap;i++)await tick();
    assert(finishBitmap);stop();stop();
    finishBitmap({width:16,height:16,close:()=>closed++});
    for(let i=0;i<20&&!released;i++)await tick();
    assert.equal(closed,1);assert.equal(draws,0);assert.equal(scheduled,0);assert.equal(canceled,1);assert.equal(released,1);
  }finally{stop?.();Object.assign(globalThis,original);}
});
