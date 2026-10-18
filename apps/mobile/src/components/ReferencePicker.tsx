import React, { useEffect, useState } from "react";
import { MobileClient } from "@ds-bot/mobile-sdk";
import { Field, Icon, Notice, SettingRow, Sheet } from "./UI";
import { BotAvatar } from "./BotAvatar";
import { Bot, errorText } from "../types";
import { tr } from "../i18n";
export interface ReferenceChat { sessionId: string; label: string; botId?: string; kind: string }
export function ReferencePicker({client,conversationId,bots,visible,online,pick,close}:{client:MobileClient;conversationId:string;bots:Bot[];visible:boolean;online:boolean;pick:(chat:ReferenceChat)=>void;close:()=>void}) {
  const [chats,setChats]=useState<ReferenceChat[]>([]),[query,setQuery]=useState(""),[loading,setLoading]=useState(false),[available,setAvailable]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;setQuery("");setChats([]);setAvailable(false);setError("");setLoading(false);
    if(!visible || !online)return;
    setLoading(true);
    void client.action<{available:boolean;chats:ReferenceChat[]}>("reference-chats",{conversationId}).then(value=>{if(active){setChats(value.chats);setAvailable(value.available);}}).catch(err=>{if(active)setError(errorText(err));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[client,conversationId,visible,online]);
  const rows=chats.filter(chat=>chat.label.toLowerCase().includes(query.trim().toLowerCase()));
  return <Sheet title={tr("Reference a chat")} visible={visible} onClose={close}>
    <Notice text={tr("The selected chat is shared with this message as read-only context.")}/>
    <Field label={tr("Search conversations")} value={query} onChangeText={setQuery} autoCorrect={false}/>
    <Notice error text={error}/>
    {!online ? <Notice text={tr("Reconnect to your host to choose a chat.")}/> : loading ? <Notice text={tr("Loading…")}/> : !available && !error ? <Notice text={tr("Update Harness on the host to use chat references.")}/> : null}
    {rows.map(chat=>{const bot=bots.find(bot=>bot.id===chat.botId);return <SettingRow key={chat.sessionId} title={chat.label} hint={tr(bot ? "Bot chat" : "Recent conversation")} leading={bot ? <BotAvatar bot={bot} size={30}/> : <Icon name="chat"/>} disabled={!online || loading} onPress={()=>pick(chat)}/>;})}
    {available && !loading && !rows.length ? <Notice text={tr("No conversations found.")}/> : null}
  </Sheet>;
}
