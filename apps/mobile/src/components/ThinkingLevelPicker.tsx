import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { MobileClient } from "@ds-bot/mobile-sdk";
import { Model, Reasoning, errorText } from "../types";
import { Button, Label, Notice } from "./UI";
import { tr } from "../i18n";
export function ThinkingLevelPicker({client,model,value,disabled,choose}:{client:MobileClient;model?:Model;value?:string;disabled:boolean;choose:(value:string|null)=>Promise<void>}) {
  const [reasoning,setReasoning]=useState<Reasoning>(),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const reasoningKey=JSON.stringify(model?.reasoning);
  useEffect(()=>{
    let active=true;setReasoning(model?.reasoning);setError("");setLoading(false);
    if(!model || disabled || model.reasoning)return;
    setLoading(true);
    void client.action<Reasoning>("efforts",{ref:model.ref}).then(value=>{if(active)setReasoning(value);}).catch(err=>{if(active)setError(errorText(err));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[client,model?.ref,reasoningKey,disabled]);
  if(!model)return null;
  return <View style={{gap:10,paddingVertical:10}}>
    <Label>{tr("Thinking level")}</Label>
    {loading ? <Label muted>{tr("Loading…")}</Label> : reasoning?.efforts?.length ? <>
      <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{[{id:"",name:tr("Default")},...reasoning.efforts].map(effort=><Button key={effort.id} title={tr(effort.name)} compact secondary={(value || "")!==effort.id} disabled={disabled || busy} onPress={()=>{setBusy(true);setError("");void choose(effort.id || null).catch(err=>setError(errorText(err))).finally(()=>setBusy(false));}}/>)}</View>
      <Label muted>{tr("Default uses this model’s own thinking level.")}</Label>
    </> : !error ? <Label muted>{tr("This model does not offer thinking levels.")}</Label> : null}
    <Notice error text={error}/>
  </View>;
}
