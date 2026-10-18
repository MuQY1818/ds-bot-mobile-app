import { language } from "../i18n";
import { requireOptionalNativeModule } from 'expo';
import { MobileClient } from '@ds-bot/mobile-sdk';
import { AppState, Platform } from 'react-native';

export interface BackgroundStatus {running:boolean;state:string;serverId?:string;expiresAt?:number;cursor?:number;userStopped?:boolean}
interface Receiver {
  start(url:string,serverId:string,token:string,cursor:number,expiresAt:number,locale:string,tlsPin:string):Promise<boolean>;
  stop():Promise<boolean>;
  setLocale(locale:string):Promise<void>;
  status():Promise<BackgroundStatus>;
  advanceCursor(serverId:string,cursor:number):Promise<void>;
}
const receiver = requireOptionalNativeModule<Receiver>('DSBotBackgroundNotifications');
let generation = 0;
let registering:AbortController|undefined;
let operations:Promise<unknown> = Promise.resolve();
function enqueue<T>(work:()=>Promise<T>):Promise<T> { const next=operations.then(work);operations=next.catch(()=>{});return next; }
export const backgroundNotificationsAvailable = !!receiver && Platform.OS !== 'web';
export async function backgroundNotificationStatus(): Promise<BackgroundStatus> { return receiver ? receiver.status() : {running:false,state:'unavailable'}; }
export async function startBackgroundNotifications(client:MobileClient,serverId:string) {
  if (!receiver) throw new Error("Install the latest native Android or iOS app to enable background notifications.");
  if (AppState.currentState !== 'active') throw new Error("Open the app before enabling background notifications.");
  const epoch = ++generation;
  await enqueue(async()=>{
    if(epoch!==generation)throw new Error("Background registration was cancelled.");
    await receiver.stop();
    const controller=new AbortController();registering=controller;
    const timer=setTimeout(()=>controller.abort(),10000);
    let lease:{token:string;cursor:number;expiresAt:number};
    try { lease=await client.action('notifications-background-register',{}, {signal:controller.signal}); }
    finally { clearTimeout(timer);if(registering===controller)registering=undefined; }
    if(epoch!==generation)throw new Error("Background registration was cancelled.");
    try { await receiver.start(client.baseUrl,serverId,lease.token,lease.cursor,lease.expiresAt,language(),client.tlsPin??""); }
    catch (error) { if(epoch===generation)await client.action('notifications-background-unregister',{}).catch(()=>{}); throw error; }
  });
}
export async function stopBackgroundNotifications(client?:MobileClient) {
  generation++;
  registering?.abort();
  await enqueue(async()=>{
    await receiver?.stop();
    if(client){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);try{await client.action('notifications-background-unregister',{}, {signal:controller.signal});}catch{}finally{clearTimeout(timer);}}
  });
}
export async function advanceBackgroundCursor(serverId:string,cursor:number) { await receiver?.advanceCursor(serverId,cursor); }

export async function syncBackgroundLanguage() { await receiver?.setLocale(language()); }
