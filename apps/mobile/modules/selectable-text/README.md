# Selectable message text (iOS)

Local Expo SDK 54 module. UIKit's noneditable, selectable `UITextView` provides
word selection, drag handles and the standard copy menu within one paragraph.
The view never focuses programmatically or requests a software keyboard.

Native module/default view: `DSBotSelectableText`.

```ts
requireNativeViewManager('DSBotSelectableText');
requireNativeModule('DSBotSelectableText').clearSelection();
```

View props:

- `runs`: `{ text, color?, fontSize, fontWeight?, italic?, strikethrough?, fontFamily?, backgroundColor?, url? }[]`.
  Pass font weights as strings, such as `"600"` or `"bold"`; `"monospace"` uses the
  system monospaced font. Colors accept Expo's color strings.
- `lineHeight`: base points before Dynamic Type scaling.
- `textColor`, `selectionColor`: color strings.
- `selectionIdentifier`: optional identifier forwarded to the inner `UITextView`
  for native accessibility/UI tests. Falls back to the Expo view's identifier.
- `heading`: optional boolean that adds the native header accessibility trait.
- `onContentSizeChange`: native event `{ height }`, measured with `sizeThatFits`
  at the current width. The JS wrapper supplies the resulting layout height.
- `onLink`: native event `{ url }` for a default link activation. Long-press
  previews do not navigate, and UIKit never opens URLs itself. The caller keeps
  its existing mention handling and URL validation.

Equivalent content does not replace the attributed text. Attribute-only updates
preserve its characters; changed text preserves and clamps the UTF-16 selection.
Width and Dynamic Type changes remeasure content. Selection and menu events do
not issue height changes. Selecting another paragraph clears the previous native
selection; unmounting and `clearSelection()` also clear it.

This module is iOS-only. It requires a new native build; it is not available in
Expo Go. Native interaction and accessibility acceptance belong to the integrated
simulator/device checks, not the existence of this source module.
