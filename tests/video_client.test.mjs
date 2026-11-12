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
test('fallback render timer paints canvas when requestAnimationFrame is delayed', async () => {
  const original = {fetch: globalThis.fetch, VideoDecoder: globalThis.VideoDecoder, createImageBitmap: globalThis.createImageBitmap, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame};
  let draws = 0;
  globalThis.VideoDecoder = undefined;
  globalThis.requestAnimationFrame = () => 999;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.createImageBitmap = async () => ({width: 16, height: 16, close: () => {}});
  globalThis.fetch = async url => String(url).startsWith('/frames.bin') ? {
    ok: true,
    body: {
      getReader: () => {
        let sent = false;
        return {
          read: async () => {
            if (sent) return {done: true};
            sent = true;
            return {done: false, value: Uint8Array.from([0, 0, 0, 1, 7])};
          },
          cancel: async () => {},
          releaseLock: () => {}
        };
      }
    }
  } : {ok: false};

  const canvas = {
    getContext: () => ({setTransform: () => {}, translate: () => {}, rotate: () => {}, drawImage: () => { draws++; }}),
    width: 0,
    height: 0
  };
  let stop;
  try {
    stop = startVideo(canvas, {onFrame: () => {}, onStatus: () => {}, onDimensions: () => {}, forceSoftware: true});
    await new Promise(r => setTimeout(r, 60));
    assert(draws >= 1, 'draw should have been called via fallback timer even though RAF never fired');
  } finally {
    stop?.();
    Object.assign(globalThis, original);
  }
});
test('native video decodes transient queue backlog without dropping, and throttles PLI on overflow', async () => {
  const original = {fetch: globalThis.fetch, VideoDecoder: globalThis.VideoDecoder, EncodedVideoChunk: globalThis.EncodedVideoChunk};
  const decoded = [];
  const pliCalls = [];
  let decoderInstance = null;

  class MockDecoder {
    static async isConfigSupported() { return {supported: true}; }
    constructor(init) {
      this.init = init;
      this.state = 'unconfigured';
      this.decodeQueueSize = 0;
      decoderInstance = this;
    }
    configure() { this.state = 'configured'; }
    decode(chunk) { decoded.push(chunk); }
    close() { this.state = 'closed'; }
  }
  globalThis.VideoDecoder = MockDecoder;
  globalThis.EncodedVideoChunk = class {
    constructor(init) { Object.assign(this, init); }
  };

  const packetsToRead = [
    Uint8Array.from([0, 0, 0, 2, 0, 0xAA]),
    Uint8Array.from([0, 0, 0, 2, 1, 0xBB]),
    Uint8Array.from([0, 0, 0, 2, 1, 0xCC]),
  ];

  let readIdx = 0;
  globalThis.fetch = async (url, opts) => {
    if (url === '/codec') {
      return {ok: true, json: async () => ({codec: 'hev1.1.6.L150.B0', description: 'AA=='})};
    }
    if (url === '/stream.bin') {
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: async () => {
              if (readIdx < packetsToRead.length) {
                const val = packetsToRead[readIdx++];
                if (readIdx === 2 && decoderInstance) {
                  decoderInstance.decodeQueueSize = 12;
                } else if (readIdx === 3 && decoderInstance) {
                  decoderInstance.decodeQueueSize = 35;
                }
                return {done: false, value: val};
              }
              return {done: true};
            },
            cancel: async () => {},
            releaseLock: () => {}
          })
        }
      };
    }
    if (url === '/pli') {
      pliCalls.push(opts);
      return {ok: true};
    }
    return {ok: false};
  };

  const canvas = {
    getContext: () => ({setTransform: () => {}, translate: () => {}, rotate: () => {}, drawImage: () => {}}),
    width: 0,
    height: 0
  };
  let stop;
  try {
    stop = startVideo(canvas, {onFrame: () => {}, onStatus: () => {}, onDimensions: () => {}});
    for (let i = 0; i < 25 && decoded.length < 2; i++) await tick();
    assert.equal(decoded.length, 2);
    assert.equal(decoded[0].type, 'key');
    assert.equal(decoded[1].type, 'delta');
    for (let i = 0; i < 25 && pliCalls.length < 1; i++) await tick();
    assert.equal(pliCalls.length, 1);
  } finally {
    stop?.();
    Object.assign(globalThis, original);
  }
});
test('retries PLI while waiting for keyframe when deltas arrive after cooldown', async () => {
  const original = {fetch: globalThis.fetch, VideoDecoder: globalThis.VideoDecoder, performance: globalThis.performance};
  const pliCalls = [];
  let currentTime = 1000;
  const mockPerf = Object.create(performance);
  mockPerf.now = () => currentTime;
  globalThis.performance = mockPerf;

  class MockDecoder {
    static async isConfigSupported() { return {supported: true}; }
    constructor() { this.state = 'unconfigured'; }
    configure() { this.state = 'configured'; }
    decode() {}
    close() { this.state = 'closed'; }
  }
  globalThis.VideoDecoder = MockDecoder;

  const deltaPacket = Uint8Array.from([0, 0, 0, 2, 1, 0xBB]);
  let packetsSent = 0;
  globalThis.fetch = async (url, opts) => {
    if (url === '/codec') return {ok: true, json: async () => ({codec: 'hev1.1.6.L150.B0', description: 'AA=='})};
    if (url === '/stream.bin') return {
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (packetsSent < 1) {
              packetsSent++;
              return {done: false, value: deltaPacket};
            }
            if (packetsSent === 1 && currentTime > 3000 && packetsSent < 2) {
              packetsSent++;
              return {done: false, value: deltaPacket};
            }
            if (packetsSent >= 2) return {done: true};
            await new Promise(r => setTimeout(r, 10));
            return {done: false, value: deltaPacket};
          },
          cancel: async () => {},
          releaseLock: () => {}
        })
      }
    };
    if (url === '/pli') {
      pliCalls.push(opts);
      return {ok: true};
    }
    return {ok: false};
  };

  const canvas = {getContext: () => ({setTransform: () => {}, translate: () => {}, rotate: () => {}, drawImage: () => {}}), width: 0, height: 0};
  let stop;
  try {
    stop = startVideo(canvas, {onFrame: () => {}, onStatus: () => {}, onDimensions: () => {}});
    for (let i = 0; i < 20 && pliCalls.length < 1; i++) await tick();
    assert.equal(pliCalls.length, 1);
    currentTime = 4000;
    for (let i = 0; i < 30 && pliCalls.length < 2; i++) await tick();
    assert.equal(pliCalls.length, 2);
  } finally {
    stop?.();
    Object.assign(globalThis, original);
  }
});
test('stretches top-left encoder resolution collapse to fill the full canvas footprint', async () => {
  const original = {fetch: globalThis.fetch, VideoDecoder: globalThis.VideoDecoder, createImageBitmap: globalThis.createImageBitmap, document: globalThis.document};
  let drawArgs = null;
  globalThis.VideoDecoder = undefined;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: () => {},
        getImageData: (_x, _y, w, h) => {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const collapsed = x >= Math.floor(w * 0.5) || y >= Math.floor(h * 0.5);
              const val = collapsed ? 128 : 40;
              data[i] = val; data[i + 1] = val; data[i + 2] = val; data[i + 3] = 255;
            }
          }
          return {data};
        },
      }),
    }),
  };
  globalThis.createImageBitmap = async () => ({width: 1264, height: 2752, close: () => {}});
  globalThis.fetch = async url => String(url).startsWith('/frames.bin') ? {
    ok: true,
    body: {
      getReader: () => {
        let sent = false;
        return {
          read: async () => sent ? {done: true} : (sent = true, {done: false, value: Uint8Array.from([0, 0, 0, 1, 7])}),
          cancel: async () => {},
          releaseLock: () => {},
        };
      },
    },
  } : {ok: false};
  const canvas = {
    getContext: () => ({setTransform: () => {}, translate: () => {}, rotate: () => {}, drawImage: (...args) => { drawArgs = args; }}),
    width: 0,
    height: 0,
  };
  let stop;
  try {
    stop = startVideo(canvas, {onFrame: () => {}, onStatus: () => {}, onDimensions: () => {}, forceSoftware: true});
    for (let i = 0; i < 20 && !drawArgs; i++) await new Promise(r => setTimeout(r, 10));
    assert.ok(drawArgs, 'drawImage should be called');
    assert.equal(drawArgs.length, 9, 'collapsed frame should use 9-arg cropped drawImage');
    assert.equal(drawArgs[1], 0);
    assert.equal(drawArgs[2], 0);
    assert.ok(drawArgs[3] > 500 && drawArgs[3] < 700, `expected cropped srcW ~632, got ${drawArgs[3]}`);
    assert.ok(drawArgs[4] > 1200 && drawArgs[4] < 1500, `expected cropped srcH ~1376, got ${drawArgs[4]}`);
    assert.equal(drawArgs[7], 1264);
    assert.equal(drawArgs[8], 2752);
  } finally {
    stop?.();
    if (original.document === undefined) delete globalThis.document;
    else globalThis.document = original.document;
    globalThis.fetch = original.fetch;
    globalThis.VideoDecoder = original.VideoDecoder;
    globalThis.createImageBitmap = original.createImageBitmap;
  }
});
