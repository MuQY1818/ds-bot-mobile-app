import { tr, useI18n } from "../i18n";
import { notificationTitle } from "../logic/notifications";
import { readCache, writeCache } from "../storage";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { MobileClient } from "@ds-bot/mobile-sdk";
import { notificationResponses, foregroundNotification, registerSystemPush, localNotificationsAllowed } from "../media/notifications";
import { syncBackgroundLanguage, advanceBackgroundCursor, backgroundNotificationStatus, backgroundNotificationsAvailable, startBackgroundNotifications, stopBackgroundNotifications } from '../media/background-notifications';
import { notificationAccess } from "../logic/mobile-access";
import type { MobileCapabilities } from "../logic/mobile-capabilities";
export interface NotificationItem {id:number;conversationId:string;kind:string;title:string;createdAt:number;read:boolean}
export interface Inbox {items:NotificationItem[];cursor:number;pushRegistered:boolean;pushAvailable:boolean;preferences:{enabled:boolean;categories:string[];readThrough:number}}
export function useNotifications(client:MobileClient|null,serverId:string|undefined,online:boolean,open:(id:string)=>void, visibleConversationId?:string, capabilities?:MobileCapabilities) {
  const access=notificationAccess(capabilities);
  const {locale}=useI18n();
  useEffect(()=>{void syncBackgroundLanguage().catch(()=>{});},[locale]);
  const [inbox,setInbox]=useState<Inbox|null>(null), callback=useRef(open);
  callback.current=open;
  const last=useRef<number|null>(null);
  const connected=useRef(online);connected.current=online;
  useEffect(()=>{setInbox(null);last.current=null;},[client,serverId]);
  useEffect(()=>notificationResponses(data=>{if(data.serverId===serverId && typeof data.conversationId==='string')callback.current(data.conversationId);}),[serverId]);
  useEffect(()=>{
    if(!client || !serverId || !backgroundNotificationsAvailable || !access.list || !access.background)return;
    let active=true,pending=false;
    async function restore(){
      if(!active || pending || !connected.current || AppState.currentState!=='active')return;
      pending=true;
      try {
        if(!await readCache<boolean>(serverId!, 'backgroundOptIn') || !active)return;
        if(!await localNotificationsAllowed()){await writeCache(serverId!,'backgroundOptIn',false);await stopBackgroundNotifications(client!);return;}
        const status=await backgroundNotificationStatus();
        if(status.userStopped){await writeCache(serverId!,'backgroundOptIn',false);await client!.action('notifications-background-unregister',{});return;}
        if(status.state==='permission-required'){await writeCache(serverId!,'backgroundOptIn',false);return;}
        if(status.running && status.serverId===serverId && (status.expiresAt || 0)>Date.now()+300000)return;
        const inbox=await client!.action<Inbox>('notifications-list',{});
        if(!active)return;
        if(!inbox.preferences.enabled){await writeCache(serverId!,'backgroundOptIn',false);await stopBackgroundNotifications(client!);return;}
        await startBackgroundNotifications(client!,serverId!);
        if(!active)await stopBackgroundNotifications();
      }catch{}finally{pending=false;}
    }
    void restore();const timer=setInterval(()=>void restore(),10000);
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')void restore();});
    return()=>{active=false;clearInterval(timer);subscription.remove();void stopBackgroundNotifications().catch(()=>{});};
  },[client,serverId,access.list,access.background]);
  useEffect(()=>{
    if(!client || !online || !serverId || !access.list)return;
    let active=true,pending=false;
    async function poll(){if(!active || pending || AppState.currentState !== 'active')return;pending=true;
      try{const value=await client!.action<Inbox>('notifications-list',{});if(!active)return;setInbox(value);
        await advanceBackgroundCursor(serverId!,value.cursor).catch(()=>{});
        if (access.push && !value.pushRegistered && value.preferences.enabled && await readCache<boolean>(serverId!, 'pushOptIn')) {
          try { const token = await registerSystemPush(false); if (active) { await client!.action('notifications-register', {token}); value.pushRegistered = true; setInbox({...value}); } } catch {}
        }
        if(last.current!==null && !value.pushRegistered && value.preferences.enabled)for(const item of value.items.filter(item=>item.id>last.current! && item.conversationId!==visibleConversationId && !item.read && value.preferences.categories.includes(item.kind)).slice(0,3))void foregroundNotification(tr(notificationTitle(item.kind)),{serverId,conversationId:item.conversationId,notificationId:item.id}).catch(()=>{});
        last.current=value.cursor;
      }catch{}finally{pending=false;}
    }
    void poll();const timer=setInterval(()=>void poll(),10000);const subscription=AppState.addEventListener('change',state=>{if(state==='active')void poll();});
    return()=>{active=false;clearInterval(timer);subscription.remove();};
  },[client,serverId,online,visibleConversationId,access.list,access.push]);
  return access.list ? inbox : null;
}
