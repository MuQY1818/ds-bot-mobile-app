import React from 'react';
import { Keyboard, Text, View } from 'react-native';
import { AnimatedPressable as Pressable } from './Motion';
import { Icon } from './UI';
import { useTheme } from '../theme';
import { mainDestinations, type Route } from '../logic/app-navigation';

export function AppNavigation({ selected, onNavigate }: {
  selected: Route['page'];
  onNavigate: (route: Route) => void;
}) {
  const t = useTheme();
  return (
    <View accessibilityLabel="主导航" style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: t.line, backgroundColor: t.bg, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
      {mainDestinations.map(item => {
        const active = selected === item.id;
        return (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: active }}
            onPress={() => { Keyboard.dismiss(); onNavigate(item.route); }}
            style={({ pressed }) => ({ flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, backgroundColor: pressed || active ? t.hover : undefined, opacity: pressed ? 0.7 : 1 })}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name={item.icon} size={20} color={active ? t.ink : t.muted}/></View>
            <Text style={{ color: active ? t.ink : t.muted, fontSize: 13, fontWeight: active ? '600' : '400' }}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
