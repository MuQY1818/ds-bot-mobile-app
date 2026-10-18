import { dateLocale } from "../i18n";
import { tr } from "../i18n";
import { writeCache } from "../storage";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { MobileClient } from "@ds-bot/mobile-sdk";
import { Inbox } from "../hooks/useNotifications";
import { registerSystemPush, requestLocalNotifications, systemPushConfigured } from "../media/notifications";
import { BackgroundStatus, backgroundNotificationStatus, backgroundNotificationsAvailable, startBackgroundNotifications, stopBackgroundNotifications } from '../media/background-notifications';
import { notificationTitle, notificationTransportLabel } from '../logic/notifications';
import { Button, Card, Label, Notice, ToggleRow } from "./UI";
import { errorText } from "../types";
import { mobileActionAllowed, notificationAccess, BRIDGE_UNAVAILABLE } from "../logic/mobile-access";
import type { MobileCapabilities } from "../logic/mobile-capabilities";
export function NotificationsPanel({client,online,open,serverId,capabilities}: {client:MobileClient;serverId:string;online:boolean;open?:(id:string)=>void;capabilities?:MobileCapabilities}) {
  const access=notificationAccess(capabilities);
  const allows=(action:string)=>mobileActionAllowed(capabilities,action);
  const [inbox,setInbox]=useState<Inbox|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [loadError,setLoadError]=useState('');
  const [background,setBackground]=useState<BackgroundStatus>({running:false,state:'stopped'});
  const scope = useRef(client); scope.current = client;
  async function load(){
    if (!access.list) return;
    const current = client;
    const [value,status] = await Promise.all([current.action<Inbox>('notifications-list',{}),backgroundNotificationStatus()]);
    if(scope.current === current){setInbox(value);setBackground(status);}
  }
  async function run(fn:()=>Promise<unknown>){if(busy)return;setBusy(true);setError('');try{await fn();await load();}catch(err){setError(errorText(err));}finally{setBusy(false);}}
  useEffect(()=>{
    if(!online || !access.list)return;
    let active=true,pending=false;
    const controller=new AbortController();
    async function poll(){
      if(!active || pending || AppState.currentState !== 'active')return;
      pending=true;
      try {const value=await client.action<Inbox>('notifications-list',{}, {signal:controller.signal});if(active){setInbox(value);setLoadError('');}}
      catch (err) {if(active && !controller.signal.aborted)setLoadError(errorText(err));} finally {pending=false;}
    }
    void poll();const timer=setInterval(()=>void poll(),5000);
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')void poll();});
    return()=>{active=false;controller.abort();clearInterval(timer);subscription.remove();};
  },[client,online,access.list]);
  useEffect(()=>{let alive=true;async function status(){if(AppState.currentState==='active'){const value=await backgroundNotificationStatus();if(alive)setBackground(value);}}const timer=setInterval(()=>void status().catch(()=>{}),2000);return()=>{alive=false;clearInterval(timer);};},[]);
  const disabled=!online || busy;
  if (!access.list) return <Notice text={BRIDGE_UNAVAILABLE}/>;
  async function prefs(enabled:boolean,categories=inbox?.preferences.categories || []){if(!enabled){await writeCache(serverId,'backgroundOptIn',false);await writeCache(serverId,'pushOptIn',false);await stopBackgroundNotifications(access.background ? client : undefined);}await client.action('notifications-preferences',{enabled,categories});}
  return <View style={{gap:12}}><Label muted>{tr("Collect replies, questions and tool approvals while your host is running. System notifications never include conversation text.")}</Label><Notice error text={error || loadError}/><Notice text={notice}/>
    <Button secondary title={tr("Refresh notifications")} disabled={disabled} onPress={()=>run(load)}/>
    {!!inbox && <><ToggleRow title={tr("Notify this device")} value={inbox.preferences.enabled} disabled={disabled || !allows("notifications-preferences")} onChange={value=>run(()=>prefs(value))}/>
      {[['reply',tr("New replies")],['question',tr("Questions")],['approval',tr("Tool approvals")]].map(([kind,label])=><ToggleRow key={kind} title={label} value={inbox.preferences.categories.includes(kind)} disabled={disabled || !allows("notifications-preferences")} onChange={value=>run(()=>prefs(inbox.preferences.enabled,value?[...inbox.preferences.categories,kind]:inbox.preferences.categories.filter(item=>item!==kind)))}/>)}
      <Label muted>{tr(notificationTransportLabel(Platform.OS,systemPushConfigured))}</Label>
      <Button secondary title={tr("Allow foreground notifications")} disabled={disabled || !inbox.preferences.enabled} onPress={()=>run(async()=>{await requestLocalNotifications();setNotice("Foreground notifications are enabled for events in other conversations.");})}/>
      {access.background && access.push && <Card><Label>{tr("Background notifications")}</Label><Label muted>{background.running?(background.state==='reconnecting'?tr("Connection lost. The receiver is reconnecting."):background.state==='suspended'?tr("iOS paused background reception. Reopen the app to resume, or configure cloud push for longer delivery."):Platform.OS==='android'?tr("Background reception is on. You can stop it from the notification tray."):tr("Reception is on. iOS controls how long the app can run in the background.")):background.state==='authorization-required'?tr("The receiver registration expired. Reopen the app and reconnect."):tr("Background reception is off.")}</Label>
        <Button title={background.running?tr("Reconnect background receiver"):tr("Enable background notifications")} disabled={disabled || !inbox.preferences.enabled || !backgroundNotificationsAvailable} onPress={()=>run(async()=>{await requestLocalNotifications();await writeCache(serverId,'pushOptIn',false);await client.action('notifications-unregister',{});await startBackgroundNotifications(client,serverId);await writeCache(serverId,'backgroundOptIn',true);setNotice(Platform.OS==='android'?"Background notifications are on. Delivery stops if you force-stop the app or the system restricts background activity.":"Reception is on. iOS allows limited background time; delivery pauses when the app is suspended.");})}/>
        {background.running && <Button secondary title={tr("Stop background notifications")} onPress={()=>run(async()=>{await writeCache(serverId,'backgroundOptIn',false);await stopBackgroundNotifications(client);})} disabled={busy}/>}
      </Card>}
      {access.push && access.background && <Card><Label>{tr("Optional cloud push")}</Label><Label muted>{inbox.pushRegistered?tr("Cloud push is registered. You can send a test notification."):systemPushConfigured?tr("The EAS project is configured. Add platform credentials to enable cloud push."):tr("Cloud push is not configured. Background reception still works while the app can run.")}</Label>
      <Button title={inbox.pushRegistered?tr("Register cloud push again"):tr("Enable cloud push")} disabled={disabled || !inbox.preferences.enabled || !systemPushConfigured} onPress={()=>run(async()=>{const token=await registerSystemPush();await client.action('notifications-register',{token});await writeCache(serverId,'pushOptIn',true);await writeCache(serverId,'backgroundOptIn',false);await stopBackgroundNotifications(client);setNotice("Cloud push is registered. This device will restore its registration after reconnecting.");})}/>
      {inbox.pushRegistered && <><Button secondary title={tr("Send test notification")} disabled={disabled || !allows("notifications-test")} onPress={()=>run(async()=>{await client.action('notifications-test',{});setNotice("The push service accepted the test. Check your phone for delivery.");})}/><Button secondary title={tr("Disable cloud push")} disabled={disabled} onPress={()=>run(async()=>{await writeCache(serverId,'pushOptIn',false);await client.action('notifications-unregister',{});})}/></>}
      </Card>}
      <Button secondary title={tr("Mark all as read")} disabled={disabled || !allows("notifications-read") || !inbox.items.some(item=>!item.read)} onPress={()=>run(()=>client.action('notifications-read',{through:inbox.cursor}))}/>
      {inbox.items.map(item=><Card key={item.id}><Label>{item.read?'':'● '}{tr(notificationTitle(item.kind))}</Label><Label muted>{new Date(item.createdAt).toLocaleString(dateLocale())}</Label>{open && <Button secondary title={tr("Open conversation")} onPress={()=>run(async()=>{if(allows('notifications-read'))await client.action('notifications-read',{ids:[item.id]});open(item.conversationId);})}/>}</Card>)}
      {!inbox.items.length && <Notice text={tr("No notifications yet. New events will appear after connecting to your host.")}/>}
    </>}
  </View>;
}
