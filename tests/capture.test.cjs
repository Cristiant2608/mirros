const {test} = require('node:test');
const assert = require('node:assert/strict');
const {saveCapture} = require('../desktop/capture.cjs');
const png = Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3]);
test('PNG captures reach disk as identical binary bytes without Base64', async () => {
  let saved;
  const wrapper = new Uint8Array(50); wrapper.set(png,5);
  assert.equal(await saveCapture({window:{}, dialog:{showSaveDialog:async()=>({filePath:'capture.png'})}, writeFile:async(path,bytes)=>{saved={path,bytes};}}, wrapper.subarray(5,5+png.length)), true);
  assert.equal(saved.path,'capture.png'); assert.deepEqual(saved.bytes,Buffer.from(png));
});
test('canceling capture does not write a file; invalid input is rejected before opening a dialog', async () => {
  let dialogs=0,writes=0;
  const deps={dialog:{showSaveDialog:async()=>{dialogs++;return{canceled:true};}},writeFile:async()=>writes++};
  assert.equal(await saveCapture(deps,png),false); assert.equal(writes,0);
  for(const input of ['data:image/png;base64,AAAA',new Uint8Array(5),new Uint8Array(64*1024*1024+1)]) await assert.rejects(saveCapture(deps,input),/Captura no válida/);
  assert.equal(dialogs,1);
});
