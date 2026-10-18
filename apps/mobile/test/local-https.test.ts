import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { URL, URLSearchParams, fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const {build}=require('esbuild');
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/network/client.ts',import.meta.url))],bundle:true,format:'cjs',platform:'node',write:false,external:['expo','react-native']});
const pin='sha256:'+'a'.repeat(64);
const credentials={serverId:'computer',deviceId:'phone',accessToken:'fixture-access',refreshToken:'fixture-refresh',expiresAt:Date.now()+3600000,serverUrl:'https://192.168.2.3:8788',tlsPin:pin};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(platform='android',available=true,origin=credentials.serverUrl){
 const sent:Record<string,unknown>[]=[];const sockets:Record<string,string>[]=[];const removed:string[]=[];let handler:(event:unknown)=>void=()=>{};let socketId='';let auth='';
 const transport={
  request:async(input:Record<string,unknown>)=>{sent.push(input);return String(input.url).includes('/attachments/')?{status:200,headers:{'Content-Type':'image/png'},bodyFile:'file:///private/attachment-fixture',fileId:'fixture-file'}:{status:200,headers:{},bodyText:JSON.stringify(String(input.url).endsWith('/info')?{protocolVersion:1,serverId:'computer'}:{ok:true})};},
  cancel:async()=>{},removeResponseFile:async(id:string)=>{removed.push(id);return true;},
  addListener:(_name:string,callback:(event:unknown)=>void)=>{handler=callback;return{remove(){handler=()=>{};}};},
  connect:async(origin:string,pin:string,id:string,url:string)=>{socketId=id;sockets.push({origin,pin,url});},send:async(_id:string,text:string)=>{auth=text;},close:async()=>{},
 };
 const module={exports:{} as {createMobileClient:(options:unknown)=>any}};
 runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,Headers,Response,Blob,ArrayBuffer,Uint8Array,URL,URLSearchParams,AbortController,AbortSignal,setTimeout,clearTimeout,btoa,
  fetch:async(url:string)=>{assert.equal(url,'file:///private/attachment-fixture');return new Response('attachment-bytes');},
  require:(name:string)=>name==='expo'?{requireOptionalNativeModule:()=>available?transport:null}:{Platform:{OS:platform}},
 });
 const tokenStore={get:async()=>({...credentials,serverUrl:origin}),set:async()=>{},clear:async()=>{}};
 return{create:()=>module.exports.createMobileClient({baseUrl:origin,tokenStore,tlsPin:pin}),sent,sockets,removed,emit:(type:string,data?:string)=>handler({id:socketId,type,data}),auth:()=>auth};
}
test('native client supplies the immutable origin and pin on a Unicode JSON upload',async()=>{
 const f=fixture(),client=f.create();await client.action('fixture',{text:'你好 🐟'});
 const request=f.sent.at(-1)!;assert.equal(request.origin,credentials.serverUrl);assert.equal(request.pin,pin);
 assert.deepEqual(JSON.parse(Buffer.from(request.body as string,'base64').toString('utf8')),{endpoint:'fixture',payload:{text:'你好 🐟'}});client.dispose();
});
test('native attachment bytes become a file blob and the temporary file is removed',async()=>{
 const f=fixture(),client=f.create();const blob=await client.attachment('bot','session','file',{seq:1});assert.equal(blob.type,'image/png');assert.equal(await blob.text(),'attachment-bytes');assert.deepEqual(f.removed,['fixture-file']);client.dispose();
});
test('native stream authenticates after the pinned socket opens and delivers events',async()=>{
 const f=fixture(),client=f.create();const states:string[]=[];
 const connection=client.connect({conversationId:'bot',onEvent:()=>{},onStatus:(value:string)=>states.push(value)});
 await tick();await tick();assert.equal(f.auth(),'');f.emit('open');await tick();assert.equal(JSON.parse(f.auth()).token,'fixture-access');f.emit('message',JSON.stringify({type:'ready'}));assert.ok(states.includes('connected'));connection.close();client.dispose();
});
test('browser and older native binaries refuse local pinned HTTPS with an upgrade instruction',()=>{
 for(const f of [fixture('web'),fixture('android',false)]){assert.throws(f.create,/latest native app/);assert.equal(f.sent.length,0);}
});
test('native IPv6 requests retain the bracketed origin and pin for HTTPS and WSS authentication',async()=>{
 const origin='https://[2001:db8::7]:8788',f=fixture('android',true,origin),client=f.create();
 await client.action('fixture',{});
 assert.equal(f.sent.at(-1)!.origin,origin);assert.equal(f.sent.at(-1)!.url,origin+'/mobile/v1/actions');assert.equal(f.sent.at(-1)!.pin,pin);
 const connection=client.connect({conversationId:'bot',onEvent:()=>{},onStatus:()=>{}});
 await tick();await tick();assert.deepEqual(f.sockets,[{origin,pin,url:'wss://[2001:db8::7]:8788/mobile/v1/events'}]);f.emit('open');await tick();assert.equal(JSON.parse(f.auth()).token,'fixture-access');connection.close();client.dispose();
});
