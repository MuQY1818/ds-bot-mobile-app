# DS Bot Mobile App visual system

Brief: an intimate messaging app for an existing Bot team. User references establish a quiet white canvas, colored original Bot characters, floating circular navigation, a centered identity capsule, gray Bot bubbles and black user bubbles. Preserve this direction over the generic purple/cyan palette suggested by the design search.

Palette: Canvas #FFFFFF; Ink #111111; Bot bubble #F2F2F2; muted #747474; hairline #E4E4E4. DS Bot blue #536DFF is reserved for brand/connection indications. Dark mode inverts contrast without changing semantic ownership.

Typography: native system SF on iOS / platform sans elsewhere; message 17px with 25px line height, conversation name 19–20 semibold, metadata 13px. Keep body text scalable. Avoid display fonts in chat.

Layout: 20px side gutters; 48px circular touch controls; 52px floating chat capsule; 88px conversation rows; 52px minimum composer. Center identity independently of back/more controls. User bubbles align right; group names align with bubbles, small original avatar sits beside each speaker's message. Main Bot is a regular list identity with a small star, not a large hero block.

Interaction: native back gestures, preserved scroll position and KeyboardAvoidingView. Controls must remain above safe area and keyboard. Unsupported host actions stay gated. Reduced-motion preferences remain authoritative. Demo content is synthetic, isolated, clearly labeled, and has no host access.

Review: retained the reference's monochrome messaging hierarchy; rejected generic gradients, decorative cards and blue user bubbles. Changes are a focused visual pass, not a claim of full Grok feature parity. Existing source art and licenses are preserved.
