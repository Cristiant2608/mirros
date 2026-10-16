// Screenshots use an original generated screen. No USB device or personal data is read.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.MIRROS_CAPTURE_OUTPUT || path.join(root,'docs/screenshots');await fs.mkdir(output,{recursive:true});
const frameInterval = Number(process.env.MIRROS_CAPTURE_FRAME_INTERVAL_MS || 500);
if(!Number.isFinite(frameInterval) || frameInterval < 100 || frameInterval > 10000) throw Error('Frame interval must be 100–10000 ms.');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'mirros-captures-'));
const candidates=[process.env.MIRROS_CAPTURE_BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean);
let browser;for(const candidate of candidates){try{await fs.access(candidate);browser=candidate;break;}catch{}}
if(!browser)throw Error('Set MIRROS_CAPTURE_BROWSER to a Chromium browser.');
const server=http.createServer(async(req,res)=>{try{const name=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','viewer.js','viewer.css'].includes(name)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,'src/mirros/web',name)));}catch{res.writeHead(500);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
let port;
const child=spawn(browser,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
let browserError = '';
child.stderr.on('data', data => {browserError = (browserError + data).slice(-8192);});
child.on('error', error => {browserError += error.message;});
let ws,sequence=0;const requests=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
// Minimal SPS metadata for a simulated 1264x2752 portrait frame.
let bits='00000001'+'0'.repeat(96);const ue=n=>{const s=(n+1).toString(2);bits+='0'.repeat(s.length-1)+s;};ue(0);ue(1);ue(1264);ue(2752);bits+='01';bits=bits.padEnd(Math.ceil(bits.length/8)*8,'0');
const nal=[0x42,1];let zeros=0;for(let i=0;i<bits.length;i+=8){const b=parseInt(bits.slice(i,i+8),2);if(zeros>=2&&b<=3){nal.push(3);zeros=0;}nal.push(b);zeros=b===0?zeros+1:0;}
const header=new Uint8Array(23);header[0]=1;header[22]=1;
const description=Buffer.from([...header,33,0,1,nal.length>>8,nal.length&255,...nal]).toString('base64');
try{
 let page; const deadline = Date.now() + 30000;
 while(Date.now() < deadline) {
   if(child.exitCode !== null || child.signalCode) break;
   try {
     const active = await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8');
     port = Number(active.split('\n')[0]);
     page=(await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)})).json()).find(p=>p.type==='page' && p.url==='about:blank');
     if(page) break;
   } catch {}
   await pause(100);
 }
 if(!page)throw Error('Capture browser did not start: ' + browserError);
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=e=>{const m=JSON.parse(e.data);requests.get(m.id)?.(m);requests.delete(m.id);};
 const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{requests.delete(id);reject(Error(`Capture command timed out: ${method}`));},15000);requests.set(id,m=>{clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m);});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.result.exceptionDetails)throw Error(JSON.stringify(result.result.exceptionDetails));return result.result.result.value;};
 await command('Page.enable');
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`
const demo=document.createElement('canvas');demo.width=1264;demo.height=2752;const c=demo.getContext('2d');
const g=c.createLinearGradient(0,0,1264,2752);g.addColorStop(0,'#cbdcf8');g.addColorStop(.55,'#ece4f7');g.addColorStop(1,'#afc8eb');c.fillStyle=g;c.fillRect(0,0,1264,2752);
const text=(s,x,y,size,color='#283855')=>{c.fillStyle=color;c.font=size+'px system-ui';c.fillText(s,x,y);};
const card=(x,y,w,h)=>{c.fillStyle='#ffffffb8';c.beginPath();c.roundRect(x,y,w,h,48);c.fill();};
text('09:41',80,155,48);text('EJEMPLO',930,155,32);text('Buen día',80,420,108);text('Tu iPhone, en el escritorio',82,515,43,'#62728c');
card(70,650,1124,400);text('Mirros',125,765,65);text('Una vista de ejemplo',125,855,45);text('Sin datos personales',125,935,36,'#62728c');
const names=['Notas','Calendario','Música','Archivos','Fotos','Clima'];const colors=['#dfb85f','#cc7888','#8d80c4','#739bc6','#9c83ab','#75a6b0'];
for(let i=0;i<6;i++){const x=95+(i%3)*390,y=1190+Math.floor(i/3)*390;c.fillStyle=colors[i];c.beginPath();c.roundRect(x,y,290,250,60);c.fill();text(names[i][0],x+96,y+168,125,'#fff');text(names[i],x+30,y+320,40);}
card(70,2100,1124,330);text('Pantalla simulada',125,2220,54);text('Las capturas usan contenido generado.',125,2310,33,'#62728c');
c.fillStyle='#526782';c.beginPath();c.roundRect(442,2630,380,14,7);c.fill();
const frameInterval=${frameInterval};
const softwareDemo=${process.env.MIRROS_SOFTWARE_DEMO === '1'};
window.VideoDecoder=class {static async isConfigSupported(){return{supported:!softwareDemo};}constructor(o){this.o=o;this.state='unconfigured';this.decodeQueueSize=0;}configure(){this.state='configured';this.timer=setInterval(()=>this.o.output(new VideoFrame(demo,{timestamp:performance.now()*1000})),frameInterval);}decode(){}close(){clearInterval(this.timer);this.state='closed';}};
const realFetch=window.fetch.bind(window);window.fetch=async(input,options)=>{const p=String(input);if(p==='/codec')return new Response(JSON.stringify({codec:'hev1.1.6.L150.B0',description:${JSON.stringify(description)}}));if(p==='/orientation')return new Response('{"orientation":"portrait"}');if(p==='/rotate')return new Response('{"currentDeviceOrientation":"portrait"}');if(p==='/frames.bin')return new Response(new ReadableStream({start(controller){let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{const blob=await new Promise(r=>demo.toBlob(r,'image/jpeg'));const bytes=new Uint8Array(await blob.arrayBuffer());const packet=new Uint8Array(4+bytes.length);new DataView(packet.buffer).setUint32(0,bytes.length);packet.set(bytes,4);controller.enqueue(packet);}catch{}finally{busy=false;}},frameInterval);options?.signal?.addEventListener('abort',()=>{clearInterval(timer);try{controller.close();}catch{}});}}));if(p==='/stream.bin'||p==='/audio.bin')return new Response(new ReadableStream({start(controller){options?.signal?.addEventListener('abort',()=>{try{controller.close();}catch{}});}}));return realFetch(input,options);};
let state={phase:'conectado',mode:'studio',theme:'claro',size:'mediano',alwaysOnTop:false,controlsVisible:true,version:'1.1.0',device:{name:'iPhone de ejemplo',version:'17.4'},update:{phase:'actualizado',message:'Tienes la versión 1.1.0.'}};const listeners=[];
window.mirros={state:async()=>({...state}),subscribe:fn=>{listeners.push(fn);return()=>{};},action:async(name,value)=>{if(name==='theme')state.theme=value;if(name==='mode')state.mode=value;if(name==='controls')state.controlsVisible=value;if(name==='pin')state.alwaysOnTop=value;listeners.forEach(fn=>fn({...state}));}};
`});
 const viewport=async(width,height)=>{await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1.5,mobile:false});await pause(350);};
 await viewport(1320,900);await command('Page.navigate',{url});
 // Wait for a decoded frame, not a fixed delay: cold CI browsers can take
 // longer to load React and decode the first software JPEG.
 const frameDeadline = Date.now() + 20000;
 let rendered = false;
 while(Date.now() < frameDeadline) {
   rendered = await evaluate("document.querySelector('.phone-shell.is-live')!==null");
   if(rendered) break;
   await pause(100);
 }
 if(!rendered) {
   const status = await evaluate("document.querySelector('.phone-placeholder')?.textContent || document.readyState");
   throw Error('Demo frame did not render: ' + status);
 }
 const screenshot=async name=>{await pause(250);const result=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(result.result.data,'base64'));};
 const tab=async label=>{await evaluate(`[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes(${JSON.stringify(label)})).click()`);await pause(100);};
 await screenshot('pantalla');await tab('Audio');await screenshot('audio');await tab('Portapapeles');await screenshot('portapapeles');await tab('Apariencia');await screenshot('apariencia');await tab('Ayuda');await screenshot('actualizaciones');
 await evaluate("window.mirros.action('theme','oscuro')");await tab('Pantalla');await screenshot('oscuro');
 await evaluate("window.mirros.action('theme','lavanda');window.mirros.action('mode','phone')");await viewport(490,880);await pause(900);await screenshot('telefono-flotante');
 await evaluate("document.querySelector('.controls-tab').click()");await viewport(454,880);await screenshot('telefono-guardado');
 await evaluate("document.querySelector('.controls-tab').click();document.querySelector('[aria-label=\"Girar vista 90°\"]').click()");await viewport(1000,500);await pause(4500);await screenshot('telefono-horizontal');
 console.log(`Nine screenshots generated from simulated content in ${output}.`);await command('Browser.close');
}finally{ws?.close();child.kill();server.close();await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
