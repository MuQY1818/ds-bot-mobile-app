# Compatibility

- DeepSeek Harness (public DSH) 0.2.1-rc.5.
- Pristine npm DS Bot 0.2.6, unpatched. The plugin uses only DS Bot's public `/api/bot` endpoints (`state` plus the App actions listed in `server/actions.mjs`), the host `sessionController`, and DS Bot's own `secrets.json` format for known-value redaction.
- Connection state (`home`) written by ds-bot-mobile-bridge 0.0.5/0.0.6 is read unchanged; keep the same `home` when migrating.

Tests: `npm run test:prepare` downloads the public fixtures above into the ignored `fixture-server/`; unit, integration and packed delivery checks never touch a live profile. App Store / physical-device acceptance is not implied by these checks.
