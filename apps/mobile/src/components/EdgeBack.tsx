import React, { useEffect, useRef } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import { useScreenActivity } from './ScreenActivity';

type Back = () => void;

// UIKit owns the iOS recognizer. Only the focused page handles Android's button.
export function useEdgeBack(onBack?: Back) {
  const focused = useScreenActivity();
  const latest = useRef(onBack); latest.current = onBack;
  useEffect(() => {
    if (!focused || !onBack || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      latest.current?.();
      return true;
    });
    return () => subscription.remove();
  }, [focused, !!onBack]);
}

// Compatibility wrapper for callers outside the application navigator.
export function EdgeBackSurface({ children }: { onBack?: Back; children: React.ReactNode }) {
  return <View style={{ flex: 1 }}>{children}</View>;
}
