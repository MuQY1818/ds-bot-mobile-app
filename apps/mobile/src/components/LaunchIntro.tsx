import React, {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, AppState, Easing, Platform, StyleSheet, View} from 'react-native';
import {BotAvatar, mainLook} from './BotAvatar';
import {useTheme} from '../theme';

export function LaunchIntro({onComplete}:{onComplete:()=>void}) {
  const t=useTheme();
  const progress=useRef(new Animated.Value(0)).current;
  const [ready,setReady]=useState(false);
  const complete=useRef(onComplete);complete.current=onComplete;
  useEffect(()=>{
    if(!ready)return;
    let alive=true, finished=false;
    let deadline:ReturnType<typeof setTimeout>;
    const frames:number[]=[];
    function done(){if(alive && !finished){finished=true;complete.current();}}
    function play(duration:number){
      if(!alive || finished)return;
      clearTimeout(deadline);
      // Bound playback separately: a slow native preference lookup must not cut off the blink.
      deadline=setTimeout(done,5000);
      Animated.timing(progress,{toValue:1,duration,easing:Easing.linear,useNativeDriver:Platform.OS!=='web'}).start(({finished})=>{if(finished)done();});
    }
    const subscription=AppState.addEventListener('change',state=>{if(state!=='active')done();});
    deadline=setTimeout(done,3500);
    void AccessibilityInfo.isReduceMotionEnabled().catch(()=>true).then(reduced=>{
      if(!alive || finished)return;
      if(reduced){progress.setValue(.85);play(180);return;}
      // Prepaint the two original eye states, then animate all visual phases on the native driver.
      frames.push(requestAnimationFrame(()=>{frames.push(requestAnimationFrame(()=>play(1400)));}));
    });
    return()=>{alive=false;clearTimeout(deadline);frames.forEach(cancelAnimationFrame);progress.stopAnimation();subscription.remove();};
  },[progress,ready]);
  const opacity=progress.interpolate({inputRange:[0,.88,1],outputRange:[1,1,0]});
  const openEyes=progress.interpolate({inputRange:[0,.48,.50,.67,.69,1],outputRange:[1,1,0,0,1,1]});
  return <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFillObject,{zIndex:100,elevation:12,backgroundColor:t.bg,alignItems:'center',justifyContent:'center',opacity}]}>
    <Animated.View onLayout={()=>setReady(true)} style={{width:148,height:148,transform:[
      {translateY:progress.interpolate({inputRange:[0,.30,.38,.42,1],outputRange:[72,-14,4,0,0]})},
      {scale:progress.interpolate({inputRange:[0,.30,.38,.42,1],outputRange:[.6,1.08,.97,1,1]})},
      {rotate:progress.interpolate({inputRange:[0,.30,.38,.42,1],outputRange:['-18deg','5deg','-2deg','0deg','0deg']})},
    ]}}>
      <View renderToHardwareTextureAndroid shouldRasterizeIOS style={{width:148,height:148}}><BotAvatar bot={mainLook} size={148} animate={false} blink eyeFill="#ffffff"/></View>
      <Animated.View renderToHardwareTextureAndroid shouldRasterizeIOS style={{position:'absolute',left:0,top:0,width:148,height:148,zIndex:1,opacity:openEyes}}><BotAvatar bot={mainLook} size={148} animate={false} blink={false} eyeFill="#ffffff"/></Animated.View>
    </Animated.View>
  </Animated.View>;
}
