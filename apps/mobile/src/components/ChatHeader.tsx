import React from "react";
import { Pressable, Text, View } from "react-native";
import { IconButton } from "./UI";
import { useTheme } from "../theme";
import { tr } from "../i18n";

export function ChatHeader({name,avatar,onBack,onDetails,onMore}:{name:string;avatar:React.ReactNode;onBack:()=>void;onDetails:()=>void;onMore:()=>void}) {
  const t=useTheme();
  return <View pointerEvents="box-none" style={{flexDirection:"row",alignItems:"center",minHeight:52,gap:10}}>
    <IconButton name="back" floating label={tr("Back to conversations")} onPress={onBack}/>
    <View pointerEvents="box-none" style={{flex:1,alignItems:"center"}}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("Open ")+name+tr(" details")} onPress={onDetails} style={({pressed})=>({minHeight:50,maxWidth:"100%",flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:13,paddingVertical:5,borderRadius:28,borderWidth:1,borderColor:t.line,backgroundColor:t.surface,opacity:pressed ? .7 : 1})}>
        {avatar}<Text numberOfLines={1} style={{color:t.ink,fontSize:18,fontWeight:"600",flexShrink:1}}>{name}</Text>
      </Pressable>
    </View>
    <IconButton name="more" floating label={tr("Conversation options")} onPress={onMore}/>
  </View>;
}
