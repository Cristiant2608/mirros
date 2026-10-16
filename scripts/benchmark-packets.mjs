// Controlled allocation benchmark, independent of USB, GPU and the iPhone.
import fs from 'node:fs/promises';
const source = await fs.readFile(new URL('../frontend/src/packets.mjs', import.meta.url),'utf8');
const instrument = `const allocations=[]; const Native=globalThis.Uint8Array; class Uint8Array extends Native { constructor(arg,...rest){super(arg,...rest);if(typeof arg==='number')allocations.push(arg);} } export {allocations};`;
const {PacketAssembler,allocations} = await import('data:text/javascript;base64,'+Buffer.from(instrument+source).toString('base64'));
function benchmark({name,count,size,fragment}) {
  const packet=new Uint8Array(size+4);new DataView(packet.buffer).setUint32(0,size);packet.fill(7,4);
  const parts=[];for(let i=0;i<packet.length;i+=fragment)parts.push(packet.subarray(i,i+fragment));
  const results=[];
  for (const method of ['previous','optimized']) {
    globalThis.gc?.();allocations.length=0;
    let allocated=0,packets=0,checksum=0,buffer=new Uint8Array(0);
    const assembler=new PacketAssembler(size),start=performance.now();
    for(let n=0;n<count;n++)for(const value of parts) {
      if(method==='previous') {
        const merged=new Uint8Array(buffer.length+value.length);allocated+=merged.length;merged.set(buffer);merged.set(value,buffer.length);buffer=merged;
        while(buffer.length>=4) {
          const length=new DataView(buffer.buffer,buffer.byteOffset).getUint32(0);if(buffer.length<4+length)break;
          const payload=buffer.slice(4,4+length);allocated+=payload.length;buffer=buffer.subarray(4+length);packets++;checksum+=payload[0];
        }
      } else for(const payload of assembler.push(value)){packets++;checksum+=payload[0];}
    }
    const elapsedMs=performance.now()-start;
    if(method==='optimized')allocated=allocations.reduce((a,b)=>a+b,0);
    if(packets!==count||checksum!==count*7)throw Error('Payload mismatch');
    results.push({method,packets,allocatedMiB:Math.round(allocated/2**20*100)/100,elapsedMs:Math.round(elapsedMs*100)/100});
  }
  return {name,payloadMiB:count*size/2**20,fragment,results};
}
console.log(JSON.stringify([benchmark({name:'video',count:120,size:256*1024,fragment:4096}),benchmark({name:'audio',count:4096,size:3840,fragment:512})],null,2));
