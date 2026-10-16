const {test} = require('node:test');
const assert = require('node:assert/strict');
const {workerArgs, stopProcess} = require('../desktop/runtime.cjs');
const {spawn} = require('node:child_process');
const net = require('node:net');
const {once} = require('node:events');
test('development Python paths match Windows and Linux environments', () => {
  const windows=workerArgs({platform:'win32',packaged:false,root:'C:\\mirros',desktopPath:'C:\\mirros\\desktop'},['status']);
  assert.equal(windows[0],'C:\\mirros\\.venv\\Scripts\\python.exe');
  const linux=workerArgs({platform:'linux',packaged:false,root:'/opt/mirros',desktopPath:'/opt/mirros/desktop'},['serve','--userspace']);
  assert.equal(linux[0],'/opt/mirros/.venv/bin/python');assert.deepEqual(linux[1],['/opt/mirros/desktop/worker.py','serve','--userspace']);
});
test('packaged Linux never executes a Windows binary', () => {
  for(const platform of ['win32','linux']){
    const result=workerArgs({platform,packaged:true,resourcesPath:platform==='win32'?'C:\\app\\resources':'/opt/app/resources'},['status']);
    assert.equal(result[0].endsWith('.exe'),platform==='win32');assert.deepEqual(result[1],['status']);
  }
});
test('already stopped or failed workers need no signals', async () => {
  await stopProcess(null);await stopProcess({pid:0,exitCode:null});await stopProcess({pid:123,exitCode:0});
});
test('POSIX shutdown stops a descendant server, not just its parent', {skip:process.platform==='win32'}, async()=>{
  const childCode="const net=require('node:net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>console.log(s.address().port));";
  const code=`const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['-e',code],{detached:true,stdio:['ignore','pipe','inherit']});
  try{
    const [data]=await once(child.stdout,'data');const port=Number(String(data).trim());
    assert(port>0);await stopProcess(child);
    const stillListening=await new Promise(resolve=>{const socket=net.connect(port,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));});
    assert.equal(stillListening,false);
  }finally{try{process.kill(-child.pid,'SIGKILL');}catch{}}
});

test('resize corners preserve the opposite anchor and enforce minimum size',()=>{
  const {resizeBounds}=require('../desktop/runtime.cjs');
  const b={x:100,y:200,width:300,height:600};
  assert.deepEqual(resizeBounds(b,'se',80,70),{x:100,y:200,width:380,height:670});
  assert.deepEqual(resizeBounds(b,'nw',40,50),{x:140,y:250,width:260,height:550});
  const minimum=resizeBounds(b,'nw',1000,1000);
  assert.equal(minimum.width,240);assert.equal(minimum.height,360);assert.equal(minimum.x+minimum.width,b.x+b.width);assert.equal(minimum.y+minimum.height,b.y+b.height);
});
test('resize side changes only one axis and respects display bounds',()=>{
  const {resizeBounds}=require('../desktop/runtime.cjs');
  const b={x:100,y:200,width:300,height:600};
  assert.deepEqual(resizeBounds(b,'e',900,900,{maxWidth:1000,maxHeight:800}),{x:100,y:200,width:1000,height:600});
  assert.deepEqual(resizeBounds(b,'n',900,-900,{maxWidth:1000,maxHeight:800}),{x:100,y:0,width:300,height:800});
});

test('phone resizing scales the video area while keeping fixed toolbar space',()=>{
  const {resizeBounds}=require('../desktop/runtime.cjs');
  const b={x:100,y:100,width:384,height:620},limits={aspectRatio:1264/2752,maxWidth:1920,maxHeight:1080,minX:0,minY:0,maxX:1920,maxY:1080};
  const bigger=resizeBounds(b,'e',50,0,limits);
  assert(bigger.height>b.height);assert(bigger.width>b.width);
  assert(Math.abs((bigger.width-78)/(bigger.height-28)-limits.aspectRatio)<.005);
  const smaller=resizeBounds(b,'n',0,100,limits);assert(smaller.height<b.height);assert(smaller.width<384);
  assert.equal(smaller.y+smaller.height,b.y+b.height);
});

test('rotation expands a custom floating window into landscape and keeps it on screen',()=>{
  const {orientedBounds}=require('../desktop/runtime.cjs');
  const area={x:0,y:0,width:1920,height:1040}, ratio=1264/2752;
  const before={x:1400,y:300,width:384,height:620};
  const landscape=orientedBounds(before,ratio,1/ratio,area);
  assert(landscape.width>landscape.height);assert(landscape.x+landscape.width<=area.width);assert(landscape.y+landscape.height<=area.height);
  const portrait=orientedBounds(landscape,1/ratio,ratio,area);
  assert(portrait.height>portrait.width);assert(portrait.height>=360);
  const again=orientedBounds(portrait,ratio,1/ratio,area);
  assert(Math.abs(again.width-landscape.width)<3);assert(Math.abs(again.height-landscape.height)<3);
});
