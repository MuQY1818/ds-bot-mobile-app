import React, { useEffect, useState } from "react";
import { Linking } from "react-native";
import Constants from "expo-constants";
import { Button, Card, Label, Notice } from "../components/UI";
import { PanelProps } from "./shared";
import { PluginUpdateCard } from "./PluginUpdateCard";
import { tr } from "./locale";
import { mobileActionAllowed, mobilePanelAllowed } from "../logic/mobile-access";
export function AboutPanel(props:PanelProps) {
  const [stars,setStars]=useState<number|null>(null),[error,setError]=useState("");
  useEffect(()=>{let active=true;if(props.online && mobileActionAllowed(props.team.mobileCapabilities, "repo-stars"))void props.client.action<number|null>("repo-stars").then(value=>{if(active && Number.isInteger(value))setStars(value);}).catch(()=>{});return()=>{active=false;};},[props.client,props.online,props.team.mobileCapabilities]);
  const open=(url:string)=>{void Linking.openURL(url).catch(()=>setError(tr("Could not open this link.")));};
  return <>
    <Card><Label>{tr("DS Bot Mobile")}</Label><Label muted>{Constants.expoConfig?.version || "0.1.0"}</Label></Card>
    {mobilePanelAllowed(props.team.mobileCapabilities, "updates") && <PluginUpdateCard {...props}/>}
    <Card><Button secondary title={tr("Source code")} onPress={()=>open("https://github.com/QingJ01/DS-Bot-App")}/><Button secondary title={tr("Release notes")} onPress={()=>open("https://github.com/QingJ01/DS-Bot-App/releases")}/><Button secondary title={tr("Feedback")} onPress={()=>open("https://github.com/QingJ01/DS-Bot-App/issues/new/choose")}/><Button secondary title={tr("Star")+(stars===null ? "" : ` · ${stars}`)} onPress={()=>open("https://github.com/QingJ01/DS-Bot-App")}/><Notice error text={error}/></Card>
  </>;
}
