// Explicit development-only preview. No host, credentials or real conversations.
import React, {useState} from "react";
import {Pressable,ScrollView,Text,TextInput,View,useWindowDimensions} from "react-native";
import {SafeAreaProvider} from "react-native-safe-area-context";
import type {Message,MobileClient} from "@ds-bot/mobile-sdk";
import {MotionProvider} from "../components/Motion";
import {BotAvatar,RoomAvatar} from "../components/BotAvatar";
import {AppNavigation} from "../components/AppNavigation";
import {ChatHeader} from "../components/ChatHeader";
import {MessageBubble} from "../components/MessageBubble";
import {Icon,IconButton,Sheet} from "../components/UI";
import {setLocalePreference} from "../i18n";
import {useTheme} from "../theme";
import type {Bot,Room} from "../types";
const bots:Bot[]=[
 {id:"preview-chief",name:"Chief",color:"deepseek",avatar:{shape:"whale"}},
 {id:"preview-research",name:"研究助手",color:"gray",avatar:{shape:"square"}},
 {id:"preview-design",name:"设计搭档",color:"yellow",avatar:{shape:"star"}},
 {id:"preview-writing",name:"写作伙伴",color:"green",avatar:{shape:"circle"}},
];
const room:Room={id:"preview-room",name:"创作小组",members:bots.slice(1).map(b=>b.id)};
const previews=["今天的计划，已经帮你理好了。","把关键证据留在正文，其余放进附录。","新配色已经准备好了，来看看？","这段开头还可以再轻一点。","我们先把最重要的那一件做好。"];
const client={} as MobileClient;
const message=(id:number,role:string,text:string,author?:Bot):Message=>({id:"preview-"+id,sessionId:"preview",seq:id,createdAt:0,role,text,...(author?{author:{id:author.id,name:author.name}}:{})});
const single=[message(1,"user","帮我把今天的想法整理成一个小计划。"),message(2,"assistant","可以，我们先从最重要的事情开始。\n\n**今天只做三件事：**\n\n1. 整理手头的资料，留下关键证据。\n2. 选一个最小可验证的想法。\n3. 留半小时复盘，写下下一步。\n\n不用一次做完所有事。先把第一步走稳。"),message(3,"user","好，先从整理资料开始。"),message(4,"assistant","我会陪你一起。把最想弄清楚的问题发给我吧。")];
const group=[message(1,"user","我们把下一版的方向定下来吧。"),message(2,"assistant","我先整理用户反馈，找出最需要解决的两个问题。",bots[1]),message(3,"assistant","界面保持安静一点。让角色和内容成为主角。",bots[2]),message(4,"assistant","那我来把说明写得更清楚，第一次用也能明白。",bots[3]),message(5,"user","就按这个方向走。"),message(6,"assistant","收到，我们把想法变成一个可以试用的版本。",bots[1])];
function Preview(){
 const t=useTheme(),{width,height}=useWindowDimensions();
 const [screen,setScreen]=useState<"home"|"single"|"group">("home"),[query,setQuery]=useState(""),[search,setSearch]=useState(false),[draft,setDraft]=useState(""),[extra,setExtra]=useState<Message[]>([]),[sheet,setSheet]=useState("");
 const small=width<650;
 const open=(next:"home"|"single"|"group")=>{setScreen(next);setExtra([]);setDraft("");};
 const rows=[...bots.map((b,i)=>({id:b.id,name:b.name,avatar:<BotAvatar bot={b} size={48} main={i===0}/>,preview:previews[i]})),{id:room.id,name:room.name,avatar:<RoomAvatar room={room} team={{bots}} size={48}/>,preview:previews[4]}];
 const messages=[...(screen==="group"?group:single),...extra];
 return <View style={{flex:1,backgroundColor:small?t.bg:"#EEF0F3",alignItems:"center",justifyContent:"center",gap:14,padding:small?0:24}}>
  {!small&&<View style={{width:390,flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}><Text style={{fontSize:18,fontWeight:"600",color:"#202124"}}>DS Bot Mobile App</Text></View>}
  <View style={{width:small?"100%":390,height:small?height:Math.min(height-110,820),backgroundColor:t.bg,borderRadius:small?0:34,overflow:"hidden",borderWidth:small?0:1,borderColor:"#D8DBE0",boxShadow:small?undefined:"0 14px 54px rgba(27,35,49,0.09)"}}>
   <View style={{height:38,paddingHorizontal:26,flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}><Text style={{fontSize:15,fontWeight:"600",color:t.ink}}>9:41</Text><View style={{flexDirection:"row",alignItems:"center",gap:5}}><View style={{width:16,height:9,borderRadius:2,backgroundColor:t.ink}}/><Text style={{fontSize:11,fontWeight:"600",color:t.ink}}>100</Text></View></View>
   {screen==="home"?<View style={{flex:1}}>
    <View style={{flexDirection:"row",alignItems:"center",gap:9,paddingHorizontal:20,paddingTop:10,paddingBottom:14}}><IconButton name="settings" floating label="打开设置" onPress={()=>setSheet("设置")}/><View style={{flex:1}}/><IconButton name="search" floating label="搜索会话" onPress={()=>setSearch(!search)}/><IconButton name="plus" floating label="新建会话" onPress={()=>setSheet("新建会话")}/></View>
    {search&&<TextInput accessibilityLabel="搜索会话" value={query} onChangeText={setQuery} placeholder="搜索会话" style={{marginHorizontal:20,backgroundColor:t.bubble,color:t.ink,paddingHorizontal:16,height:44,borderRadius:24}}/>}
    <ScrollView contentContainerStyle={{paddingHorizontal:20,paddingBottom:24}}>{rows.filter(row=>row.name.includes(query)).map((row,i)=><Pressable key={row.id} accessibilityRole="button" accessibilityLabel={"打开"+row.name} onPress={()=>open(row.id===room.id?"group":"single")} style={({pressed})=>({flexDirection:"row",alignItems:"center",gap:16,paddingVertical:20,minHeight:88,opacity:pressed ? .65 : 1})}>{row.avatar}<View style={{flex:1,gap:7}}><View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:6}}><Text style={{fontSize:19,fontWeight:"600",color:t.ink}}>{row.name}</Text><Text style={{fontSize:12,color:t.muted}}>{i===0?"刚刚":"09:32"}</Text></View><Text numberOfLines={1} style={{fontSize:15,lineHeight:22,color:t.muted}}>{row.preview}</Text></View></Pressable>)}</ScrollView>
    <AppNavigation selected="home" onNavigate={route=>{if(route.page==="home")open("home");else setSheet(route.page==="team"?"团队":"设置");}}/>
   </View>:<View style={{flex:1}}>
    <View style={{position:"absolute",top:10,left:16,right:16,zIndex:3}}><ChatHeader name={screen==="group"?room.name:bots[1].name} avatar={screen==="group"?<RoomAvatar room={room} team={{bots}} size={30}/>:<BotAvatar bot={bots[1]} size={30}/>} onBack={()=>open("home")} onDetails={()=>setSheet("对话详情")} onMore={()=>setSheet("对话选项")}/></View>
    <ScrollView contentContainerStyle={{paddingHorizontal:16,paddingTop:92,paddingBottom:18}}><Text style={{textAlign:"center",fontSize:12,color:t.muted,marginBottom:16}}>今天 09:32</Text>{messages.map(m=><MessageBubble key={m.id} message={m} client={client} conversationId="preview" bot={screen==="group"?bots.find(b=>b.id===(m.author as {id?:string})?.id):bots[1]} bots={bots} showAuthor={screen==="group"} onOpenBot={()=>open("single")}/>)}</ScrollView>
    <View style={{paddingHorizontal:16,paddingTop:8,paddingBottom:22,backgroundColor:t.bg,flexDirection:"row",alignItems:"flex-end",gap:10}}><IconButton name="plus" floating label="添加内容" onPress={()=>setSheet("添加内容")}/><View style={{flex:1,minHeight:50,borderRadius:28,borderWidth:1,borderColor:t.line,flexDirection:"row",alignItems:"center",paddingHorizontal:4,gap:2}}><TextInput accessibilityLabel="消息" placeholder={screen==="group"?"给创作小组发消息":"向研究助手提问"} placeholderTextColor={t.muted} value={draft} onChangeText={setDraft} style={{flex:1,paddingLeft:12,fontSize:16,color:t.ink,minHeight:48}}/><IconButton primary size={44} name="send" label="发送消息" disabled={!draft.trim()} onPress={()=>{setExtra([...extra,message(20+extra.length,"user",draft.trim())]);setDraft("");}}/></View></View>
   </View>}
   <View style={{alignSelf:"center",width:118,height:4,borderRadius:3,backgroundColor:t.ink,marginBottom:8}}/>
  </View>
  {!small&&<View style={{flexDirection:"row",gap:8}}>{([['home','会话列表'],['single','单聊'],['group','群聊']] as const).map(([value,label])=><Pressable accessibilityRole="button" accessibilityLabel={label} key={value} onPress={()=>open(value)} style={{minHeight:44,paddingHorizontal:20,justifyContent:"center",borderRadius:24,backgroundColor:screen===value?"#111111":"#FFFFFF"}}><Text style={{color:screen===value?"white":"#62666D",fontSize:13}}>{label}</Text></Pressable>)}</View>}
  <Sheet title={sheet} visible={!!sheet} onClose={()=>setSheet("")}><Text style={{fontSize:16,color:t.ink,lineHeight:25}}>管理主机连接、通知和设备。</Text></Sheet>
 </View>;
}
export default function DesignPreview(){setLocalePreference("zh");return <SafeAreaProvider><MotionProvider><Preview/></MotionProvider></SafeAreaProvider>;}
