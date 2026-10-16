const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {newer,releaseAsset,checkUpdates,downloadUpdate,portableTarget,installerScript,prepareInstaller} = require('../desktop/updates.cjs');
const bytes = Buffer.from('a harmless update fixture');
const hash = createHash('sha256').update(bytes).digest('hex');
const asset = {name:'Mirros-1.2.0-Windows.exe',size:bytes.length,digest:'sha256:'+hash,browser_download_url:'https://github.com/Cristiant2608/mirros/releases/download/v1.2.0/Mirros-1.2.0-Windows.exe'};
const release = {tag_name:'v1.2.0',assets:[asset]};
test('stable versions compare numerically and never downgrade',()=>{
  assert(newer('v1.10.0','1.2.0'));assert(!newer('1.1.0','1.1.0'));assert(!newer('1.0.9','1.1.0'));assert(!newer('1.2.0-beta','1.1.0'));
});
test('updates accept only matching official assets with a digest',()=>{
  assert.equal(releaseAsset(release,'win32','x64').hash,hash);
  assert.equal(releaseAsset(release,'linux','x64'),null);
  assert.equal(releaseAsset({...release,assets:[{...asset,browser_download_url:'https://evil.example/update.exe'}]},'win32','x64'),null);
  assert.equal(releaseAsset({...release,assets:[{...asset,digest:null}]},'win32','x64'),null);
  assert.equal(releaseAsset({...release,prerelease:true},'win32','x64'),null);
});
test('missing releases are reported as unpublished, not up to date',async()=>{
  const status=await checkUpdates({version:'1.1.0',fetchRequest:async()=>({status:404})});assert.equal(status.phase,'sin-publicacion');
  const available=await checkUpdates({version:'1.1.0',platform:'win32',arch:'x64',fetchRequest:async()=>({ok:true,json:async()=>release})});assert.equal(available.phase,'disponible');
});
test('download verifies complete bytes and removes corrupt files',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mirros-update-test-'));
  try {
    const response=async()=>({ok:true,body:(async function*(){yield bytes.subarray(0,5);yield bytes.subarray(5);})()});
    const file=await downloadUpdate({...asset,hash},directory,{fetchRequest:response});assert.deepEqual(await fs.readFile(file),bytes);
    await assert.rejects(downloadUpdate({...asset,hash:'0'.repeat(64)},directory,{fetchRequest:response}),/verificación/);
    await assert.rejects(fs.access(file));
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('update targets must be the original portable or AppImage, never an extracted runtime',()=>{
  assert.equal(portableTarget('win32',{PORTABLE_EXECUTABLE_FILE:'C:\\Apps\\Mirros.exe'}),'C:\\Apps\\Mirros.exe');
  assert.equal(portableTarget('linux',{APPIMAGE:'/opt/mirros/Mirros.AppImage'}),'/opt/mirros/Mirros.AppImage');
  assert.equal(portableTarget('linux',{APPIMAGE:'relative.AppImage'}),null);assert.equal(portableTarget('win32',{}),null);
});
test('installer keeps literal paths and waits for the old app to close',()=>{
  const win=installerScript({platform:'win32',target:"C:\\O'Brien\\Mirros.exe",download:'C:\\cache\\new',log:'C:\\cache\\log',pid:1234});
  assert(win.includes("O''Brien"));assert(win.includes('Get-Process -Id 1234'));assert(win.includes('Move-Item -LiteralPath $target'));assert(win.includes('.mirros-previous'));
  const linux=installerScript({platform:'linux',target:"/home/O'Brien/Mirros.AppImage",download:'/tmp/new',log:'/tmp/log',pid:1234});assert(linux.includes("O'\\''Brien"));assert(linux.includes('kill -0 1234'));assert(linux.includes('mv -- "$backup" "$target"'));
});

test('native installer replaces a harmless fixture, keeps backup and rejects changed bytes', {skip:!['win32','linux'].includes(process.platform)}, async()=>{
  for(const corrupt of [false,true]) {
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),"mirros-update-O'Brien-"));
    const target=path.join(directory,process.platform==='win32'?'Mirros.exe':'Mirros.AppImage'),download=path.join(directory,'new.download');
    try{
      const payload=process.platform==='win32'?await fs.readFile(path.join(process.env.WINDIR,'System32','where.exe')):Buffer.from('#!/bin/sh\nexit 0\n');
      const digest=createHash('sha256').update(payload).digest('hex');
      await fs.writeFile(target,'previous harmless fixture');await fs.writeFile(download,payload);
      const install=await prepareInstaller({target,download,directory,pid:2147483647,hash:corrupt?'0'.repeat(64):digest});await install();
      let finished=false;
      for(let i=0;i<150;i++){
        try {if(corrupt){await fs.access(path.join(directory,'install-update.log'));if((await fs.stat(path.join(directory,'install-update.log'))).size>0){finished=true;break;}}else if((await fs.readFile(target)).equals(payload)){finished=true;break;}}catch{}
        await new Promise(r=>setTimeout(r,100));
      }
      assert(finished,'native helper did not finish');
      if(corrupt)assert.equal(await fs.readFile(target,'utf8'),'previous harmless fixture');
      else {assert.deepEqual(await fs.readFile(target),payload);assert.equal(await fs.readFile(target+'.mirros-previous','utf8'),'previous harmless fixture');}
    }finally{await new Promise(r=>setTimeout(r,300));await fs.rm(directory,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
  }
});
