# DS Bot Mobile App

An iOS / Android source preview for your existing Bot team.

[简体中文](README.md) · [Installation and pairing](docs/installation.md) · [Usage](docs/usage.md) · [Releases](https://github.com/MuQY1818/ds-bot-mobile-app/releases) · [Issues](https://github.com/MuQY1818/ds-bot-mobile-app/issues)

**For direct phone access, start with [DS Bot Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web).** Web is the primary access path and requires no native build. This repository is for developers who want a native client and can prepare the platform toolchain.

The current source preview is **0.1.5-preview.1**: native App **0.1.5**, desktop companion **0.2.0**, Mobile Bridge **0.0.6**. Ready-to-install IPA/APK files are not provided. Selection handles remain experimental and are not part of this preview.

## Preview

| Conversations | Direct messages | Group chat |
| :---: | :---: | :---: |
| <img src="docs/images/iphone-conversations.png" width="260" alt="Conversations"> | <img src="docs/images/iphone-chat.png" width="260" alt="Direct messages"> | <img src="docs/images/iphone-group.png" width="260" alt="Group chat"> |

<p align="center">
  <img src="docs/images/phone-access-app.png" width="960" alt="Desktop Phone access App tab and device management">
</p>

*Captured on a physical iPhone with example conversations. The desktop device panel comes from the installed companion; pairing QR codes and access credentials are excluded.*

## Implemented experience

- Access existing Bot and group conversations, committed text history and complete replies with group authorship.
- Native navigation, back gestures, themes, English/Chinese interfaces and character avatars.
- Show a “Sending…” bubble immediately and clear the composer so you can write the next draft. A message is confirmed only after host acceptance.
- Retain uncertain or failed sends for explicit status checks and retries. Late receipts do not erase newer drafts.
- Open at the latest message, offer a round return-to-bottom button and briefly reuse recent foreground streams.
- Pair devices with computer-owner approval and revoke each device separately.

Features depend on Bridge capabilities. The standalone Bridge currently delivers complete messages; token deltas, native tool approvals, media/voice, system push notifications and group administration are not provided. A visible interface control does not establish host support. See [status](docs/status.md).

## Components

| Component | Installed on | Purpose |
| --- | --- | --- |
| Native client | iOS / Android | Phone interface; currently self-built |
| `ds-bot-mobile-app` | Computer DSH | Pairing QR, approvals and device management |
| `ds-bot-mobile-bridge` | Computer DSH | Device authentication and message transport |
| Compatible DS Bot | Computer DSH | Existing Bots, groups and conversations |

Web, the App companion and Bridge are three independently managed computer plugins. Web users need neither native component. Disabling the App pairing interface does not revoke approved devices or stop Bridge.

## Install and connect

1. **Prepare the computer.** Follow [installation](docs/installation.md) to install compatible DS Bot, Bridge and the App companion, and configure a phone-accessible HTTPS endpoint.
2. **Build the client.** Use your own Xcode or Android toolchain. Custom native modules require a full development build rather than Expo Go.
3. **Scan and approve.** Open **Phone access → App** on the computer, scan with the native client, and approve the matching device request on the computer.

Pristine npm DS Bot `0.1.7` lacks the stable interfaces this Bridge needs. Releases include a separately identified `ds-bot-0.1.7-codex.1.tgz` compatible package. Do not replace an existing installation that already supplies the required interfaces. The [installation guide](docs/installation.md) covers order and data-preserving updates.

## Current scope

Selected same-identity iPhone updates, online reads, scrolling and keyboard interactions have been checked. The complete first-pairing, live messaging, background, network-transition and Android device matrix remains incomplete. Immediate send feedback and failure recovery are tested in isolation, which does not replace physical-device validation.

Current product work prioritizes Web. The native App remains a source preview. The 0.1.5 keyboard update is a candidate; the existing iPhone installation remains 0.1.4 build 8. Experimental selection handles are not part of this candidate.

## Documentation

Detailed guides are in Simplified Chinese.

| Guide | Topic |
| --- | --- |
| [Installation and pairing](docs/installation.md) | Components, builds, networking, authorization and updates |
| [Usage](docs/usage.md) | Conversations, sending states, drafts and device management |
| [FAQ](docs/faq.md) | Web versus App, QR codes and limitations |
| [Troubleshooting](docs/troubleshooting.md) | Pairing, offline access, uncertain sends and updates |
| [Bridge configuration](docs/bridge.md) | Transport setup and maintenance |
| [Plugin roles](docs/plugins.md) | Independent responsibilities |
| [Status](docs/status.md) | Stable preview and unfinished work |
| [Changelog](CHANGELOG.md) | User-visible changes |

Developers can use the [native build guide](apps/mobile/README.md), [development guide](docs/development.md) and [validation record](docs/validation.md).

## License and provenance

[Apache License 2.0](LICENSE). Copyright, upstream provenance and dependency notices remain in [NOTICE](NOTICE) and [provenance](docs/provenance.md). This independent community project is not affiliated with DeepSeek. Remove pairing data, host addresses and private conversations from bug reports.
