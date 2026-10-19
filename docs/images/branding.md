# README whale mark

`whale-mark.png` is the App illustration in the coordinated DS Bot Mobile README artwork set. It is documentation artwork, separate from the running-product screenshots.

## Source and method

- Created on 2026-10-19 from the user's supplied blue-purple DS Bot whale and gold-star reference.
- Original whale character: [DS Bot by Fei2411 and contributors](https://github.com/Fei2411/DeepSeek-Bot/blob/e522ca474f38a7c7d4d1e8d1c08f1b542fa2667f/ds-bot/src/client/characters.js), Apache-2.0. Existing upstream attribution and license notices remain applicable.
- Generated with the imagegen skill's unmodified `image_gen.py edit` CLI through the user-selected Laoli image API. The provider model alias was `gpt-image-2.5-flare`; this records the gateway identifier rather than asserting an independently verified underlying model version.
- The original whale image supplied the character reference. App and Bridge also used the generated Web mark to keep the family style consistent.
- Requested at 1536 × 1024, high quality, PNG. A local response adapter converted the provider's image URL into the Base64 format expected by the CLI.
- Generated on flat green; the imagegen chroma-key helper removed the background. The artwork was then cropped, padded and resized for a transparent 960 × 400px horizontal README asset, and inspected at its 360px display size on light and dark backgrounds.
- No private conversation, access address, QR code, credential or real product UI is part of this artwork. The three projects are independent community companions.

## Final generation prompt

```text
Use case: logo-brand
Asset type: horizontal mascot illustration above a GitHub README project title.
Primary request: create the App companion mark in the same coordinated DS Bot Mobile family as input image 2.
Input image 1: original whale identity reference. Keep its blue-purple oval body, lifted two-lobed tail to the left, two narrow white facial marks at the right end, lighter periwinkle facets, and small warm gold five-point star. Do not add eyes, teeth or a mouth.
Input image 2: generated Web mark, used only for matching whale identity, colors, illustration style, visual weight and spacing. Replace its browser prop with a smartphone; do not include a browser.
Subject: the same little whale gently leans against the lower left side of a minimal rounded smartphone outline, with a small earpiece and an empty screen. One gold star floats near its nose. The whale is dominant and the phone is secondary. Balance the vertical phone with the horizontal whale and lifted tail.
Style/medium: premium cute flat illustration, vector-like clean smooth shapes, friendly rounded geometry, restrained tonal facets, crisp edges. No black outlines, 3D rendering, textures, shadows or glow.
Composition/framing: compact balanced horizontal silhouette, width about 2.5 times its height, centered with very generous plain space above and below. Keep every part fully inside the canvas. Match the companion Web mark's visual weight and whale proportions.
Color palette: vivid periwinkle and cornflower blue whale; lavender-blue phone outline; warm golden yellow star; white facial slits. No green in the subject.
Scene/backdrop: completely flat solid bright chroma green #00FF00 across the whole canvas, including the empty phone screen. It will be removed later; no green reflection or bleeding onto the subject. No gradient, floor, vignette or drop shadow.
Text: none. No letters, words, project name, captions, QR codes, URLs or watermark.
Constraints: exactly one whale, one phone outline and one star. Preserve the reference whale; no extra mascots, scene or UI details. Every visible element belongs to a single centered horizontal group.
```
