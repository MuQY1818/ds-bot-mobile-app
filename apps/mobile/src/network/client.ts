import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { ClientOptions, MobileClient, validateServerUrl, validateTlsPin } from "@ds-bot/mobile-sdk";
interface NativeResponse { status:number; headers:Record<string,string>; bodyText?:string; bodyFile?:string; fileId?:string }
interface SocketEvent { id:string; type:string; data?:string; code?:number; reason?:string }
interface Transport {
  request(input:Record<string,unknown>):Promise<NativeResponse>;
  cancel(id:string):Promise<void>;
  removeResponseFile(id:string):Promise<boolean>;
  connect(origin:string,pin:string,id:string,url:string):Promise<void>;
  send(id:string,text:string):Promise<void>;
  close(id:string):Promise<void>;
  addListener(name:"socket",listener:(event:SocketEvent)=>void):{remove():void};
}
const native = requireOptionalNativeModule<Transport>("DSBotLocalTLS");
let sequence=0;
const requestId=()=>`local-${Date.now()}-${++sequence}`;
function base64(bytes:Uint8Array) {
  let raw="";
  for(let offset=0;offset<bytes.length;offset+=8192) raw+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  return btoa(raw);
}
function encodeBody(body:RequestInit["body"]) {
  if(body==null)return undefined;
  if(typeof body==="string")return btoa(encodeURIComponent(body).replace(/%([0-9A-F]{2})/g,(_,hex:string)=>String.fromCharCode(parseInt(hex,16))));
  if(body instanceof ArrayBuffer)return base64(new Uint8Array(body));
  if(ArrayBuffer.isView(body))return base64(new Uint8Array(body.buffer,body.byteOffset,body.byteLength));
  throw new Error("This upload format is unavailable.");
}
export function createMobileClient(options:ClientOptions):MobileClient {
  if(options.tlsPin===undefined)return new MobileClient(options);
  const pin=validateTlsPin(options.tlsPin),origin=validateServerUrl(options.baseUrl);
  if(!native || Platform.OS==="web")throw new Error("Install the latest native app to connect to local HTTPS.");
  const transport=native;
  const pinnedFetch=async(input:RequestInfo|URL,init:RequestInit={})=>{
    const id=requestId();
    if(init.signal?.aborted)throw new Error("The request was cancelled.");
    const headers:Record<string,string>={};new Headers(init.headers).forEach((value,key)=>{headers[key] = value;});
    const abort=()=>{void transport.cancel(id).catch(()=>{});};
    init.signal?.addEventListener("abort",abort,{once:true});
    try {
      const response=await transport.request({origin,pin,id,url:String(input),method:init.method??"GET",headers,body:encodeBody(init.body)});
      if(init.signal?.aborted){if(response.fileId)await transport.removeResponseFile(response.fileId);throw new Error("The request was cancelled.");}
      const text=response.bodyText??"";
      const responseHeaders=new Headers(response.headers);
      return {status:response.status,ok:response.status>=200&&response.status<300,headers:responseHeaders,text:async()=>text,json:async()=>JSON.parse(text),
        blob:async()=>{
          if(!response.bodyFile || !response.fileId)throw new Error("The host did not return a downloadable attachment.");
          try {
            const file=await fetch(response.bodyFile),blob=await file.blob();
            const type=responseHeaders.get("content-type")?.split(";")[0].trim();
            return type ? blob.slice(0,blob.size,type) : blob;
          }
          finally {await transport.removeResponseFile(response.fileId);}
        },
      } as Response;
    } finally {init.signal?.removeEventListener("abort",abort);}
  };
  class PinnedSocket {
    readyState=0;
    onopen:((event:unknown)=>void)|null=null;
    onmessage:((event:{data:string})=>void)|null=null;
    onerror:((event:unknown)=>void)|null=null;
    onclose:((event:{code:number;reason:string})=>void)|null=null;
    private id=requestId();
    private subscription:{remove():void};
    constructor(url:string) {
      this.subscription=transport.addListener("socket",event=>{
        if(event.id!==this.id || this.readyState===3)return;
        if(event.type==="open"){if(this.readyState!==0)return;this.readyState=1;this.onopen?.({});}
        if(event.type==="message")this.onmessage?.({data:event.data??""});
        if(event.type==="error")this.onerror?.({});
        if(event.type==="close")this.finish(event.code??1006,event.reason??"");
      });
      void transport.connect(origin,pin,this.id,url).catch(()=>{if(this.readyState===3)return;this.onerror?.({});this.finish(1006,"");});
    }
    private finish(code:number,reason:string) {if(this.readyState===3)return;this.readyState=3;this.subscription.remove();this.onclose?.({code,reason});}
    send(text:string) {if(this.readyState!==1)throw new Error("The stream closed.");void transport.send(this.id,text).catch(()=>{this.onerror?.({});this.close();});}
    close(){if(this.readyState>=2)return;this.readyState=2;void transport.close(this.id).catch(()=>{}).finally(()=>this.finish(1000,""));}
  }
  return new MobileClient({...options,fetch:pinnedFetch,WebSocket:PinnedSocket as unknown as typeof WebSocket});
}
