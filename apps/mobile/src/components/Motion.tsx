import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, PressableProps } from 'react-native';

const ReducedMotion = createContext(false);
const NativePressable = Animated.createAnimatedComponent(Pressable);
const nativeDriver = Platform.OS !== 'web';

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; subscription.remove(); };
  }, []);
  return <ReducedMotion.Provider value={reduced}>{children}</ReducedMotion.Provider>;
}

export function AnimatedPressable({ style, onPressIn, onPressOut, ...props }: PressableProps) {
  const reduced = useContext(ReducedMotion);
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  useEffect(() => () => scale.stopAnimation(), [scale]);
  function animate(value: number) {
    scale.stopAnimation();
    if (reduced) scale.setValue(1);
    else Animated.timing(scale, { toValue: value, duration: value === 1 ? 160 : 90, easing: Easing.out(Easing.quad), useNativeDriver: nativeDriver }).start();
  }
  return <NativePressable {...props}
    onPressIn={event => { setPressed(true); animate(.97); onPressIn?.(event); }}
    onPressOut={event => { setPressed(false); animate(1); onPressOut?.(event); }}
    style={[typeof style === 'function' ? style({ pressed }) : style, { transform: [{ scale }] }]}
  />;
}

// Animate transforms only; measuring layout during a transition must stay stable.
export function PageTransition({ children, distance = 12 }: { children: React.ReactNode; distance?: number }) {
  const reduced = useContext(ReducedMotion);
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) progress.setValue(1);
    else Animated.timing(progress, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }).start();
    return () => progress.stopAnimation();
  }, [progress, reduced]);
  return <Animated.View pointerEvents="box-none" style={{ flex: 1, opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }}>{children}</Animated.View>;
}
