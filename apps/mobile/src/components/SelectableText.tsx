import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextStyle, View, ViewProps } from "react-native";
import { requireNativeModule, requireNativeViewManager } from "expo-modules-core";
import type { SelectionRun } from "../logic/selection-runs";

interface NativeProps extends ViewProps {
  runs: SelectionRun[];
  lineHeight: number;
  textColor: string;
  selectionColor: string;
  heading: boolean;
  selectionIdentifier: string;
  onContentSizeChange: (event: { nativeEvent: { height: number } }) => void;
  onLink: (event: { nativeEvent: { url: string } }) => void;
}

const NativeText: React.ComponentType<NativeProps> | null = Platform.OS === "ios" ? requireNativeViewManager("DSBotSelectableText") : null;
const selection = Platform.OS === "ios" ? requireNativeModule<{ clearSelection(): Promise<void> }>("DSBotSelectableText") : null;

export function clearMessageSelection() {
  return selection?.clearSelection().catch(() => {});
}

export function SelectableText({ runs, children, style, selectionColor, onLink, heading = false }: {
  runs: SelectionRun[];
  children: React.ReactNode;
  style: TextStyle;
  selectionColor: string;
  onLink: (url: string) => void;
  heading?: boolean;
}) {
  const [height, setHeight] = useState<number>();
  if (!NativeText) return <Text selectable accessibilityRole={heading ? "header" : undefined} style={style}>{children}</Text>;
  const { marginTop, marginBottom, marginVertical, ...textStyle } = style;
  return <View style={{ flexShrink: 1, marginTop: marginTop ?? marginVertical, marginBottom: marginBottom ?? marginVertical, height }}>
    {/* Keep the original text's natural width before native TextKit measures it.
        This layout-only copy is neither interactive nor read by VoiceOver. */}
    <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[textStyle, { opacity: 0 }]}>{children}</Text>
    <NativeText testID="message-text-selection" selectionIdentifier="message-text-selection" style={StyleSheet.absoluteFill}
      runs={runs} lineHeight={style.lineHeight ?? Number(style.fontSize ?? 14) + 8} textColor={String(style.color ?? "#202020")}
      selectionColor={selectionColor} heading={heading}
      onContentSizeChange={event => {
        const next = event.nativeEvent.height;
        if (Number.isFinite(next) && next > 0 && next < 100000) setHeight(previous => previous === undefined || Math.abs(previous - next) > 0.5 ? next : previous);
      }}
      onLink={event => onLink(event.nativeEvent.url)} />
  </View>;
}
