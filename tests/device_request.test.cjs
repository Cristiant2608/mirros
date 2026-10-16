const test = require('node:test');
const assert = require('node:assert/strict');
const {deviceRequest} = require('../desktop/device-request.cjs');
test('display actions reject HTTP failures and backend errors instead of reporting success', async()=>{
  await assert.rejects(deviceRequest(async()=>({ok:false,status:503}),1234,'/wake'), /HTTP 503/);
  await assert.rejects(deviceRequest(async()=>({ok:true,json:async()=>({status:'error'})}),1234,'/wake'), /no pudo/);
  await assert.rejects(deviceRequest(()=>assert.fail('No request without a device'),null,'/wake'), /Conecta/);
});
test('display actions send explicit JSON and a bounded request signal', async()=>{
  const result=await deviceRequest(async(url, options)=>{
    assert.equal(url,'http://127.0.0.1:1234/display-mode');
    assert.deepEqual(JSON.parse(options.body),{mode:'aod'});
    assert(options.signal instanceof AbortSignal);
    return {ok:true,json:async()=>({mode:'aod'})};
  },1234,'/display-mode',{mode:'aod'});
  assert.deepEqual(result,{mode:'aod'});
});
