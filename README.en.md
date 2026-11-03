<div align="center">

<p><img src="docs/images/whale-mark.png" width="360" alt="DS Bot Mobile App whale and phone mark"></p>

<h1>DS Bot Mobile App</h1>
<p>Connect to your existing Bot team from your phone, keep drafts close, and manage access per device.</p>

<p>
  <a href="https://github.com/MuQY1818/ds-bot-mobile-app/actions/workflows/check.yml"><img src="https://github.com/MuQY1818/ds-bot-mobile-app/actions/workflows/check.yml/badge.svg?branch=main" alt="CI checks on main"></a>
  <a href="docs/status.md"><img src="https://img.shields.io/badge/source%20preview-0.1.7--preview.1-5879E8" alt="Source preview 0.1.7-preview.1"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-3D8B7D" alt="Apache License 2.0"></a>
</p>

<p><a href="README.md">简体中文</a> · English · <a href="docs/installation.md">Install &amp; pair</a> · <a href="docs/usage.md">Usage</a> · <a href="https://github.com/MuQY1818/ds-bot-mobile-app/releases">Releases</a> · <a href="docs/README.md">Documentation</a></p>

</div>

> **Want to use your phone right away?** Start with [DS Bot Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web): browser access with no native build. This repository provides the iOS / Android client source and its desktop companion. Ready-to-install IPA/APK files are not available.

## A native interface for an existing team

Connect to DS Bot already running in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) on your computer, with your existing Bots, groups and conversations. The phone handles native navigation, reading and drafts. The desktop App plugin handles pairing approval, device management, authentication and transport.

| Conversations | Direct messages | Group chat |
| :---: | :---: | :---: |
| <img src="docs/images/iphone-conversations.png" width="260" alt="Physical iPhone example: conversation list"> | <img src="docs/images/iphone-chat.png" width="260" alt="Physical iPhone example: direct messages"> | <img src="docs/images/iphone-group.png" width="260" alt="Physical iPhone example: group chat"> |

<p align="center"><sub>Physical iPhone captures with synthetic conversations, showing the native layout. See <a href="docs/status.md">status</a> for current features and device coverage.</sub></p>

<details>
<summary><strong>On the computer: Phone access → App</strong></summary>
<p align="center"><img src="docs/images/phone-access-app.png" width="960" alt="Running desktop Phone access App tab and device-management interface"></p>
<p>Generate a pairing QR, approve requests and revoke individual devices from one entry point. Pairing QR codes and access credentials are excluded from this capture. See <a href="docs/images/README.md">image provenance</a>.</p>
</details>

## Designed for phone use

<table>
  <tr>
    <td width="50%"><strong>Your existing conversations</strong><br>Read Bot and group text history with group authorship intact. Keep the team on the computer without recreating it on the phone.</td>
    <td width="50%"><strong>Messages made for reading</strong><br>CJK Markdown, code and tables; native iOS range selection and drag handles, with raw Markdown copy below each bubble.</td>
  </tr>
  <tr>
    <td><strong>Room for the next draft</strong><br>Sending immediately creates a pending bubble and frees the composer. Uncertain or failed requests retain their content for status checks and explicit retries.</td>
    <td><strong>Access per device</strong><br>The computer owner approves pairing and can revoke a device. Authorization lives in the App plugin's dedicated directory and survives disabling.</td>
  </tr>
</table>

Also included: English/Chinese interfaces, light and dark themes, character avatars, recent conversation caching and a return-to-latest button. Cached content and drafts remain available offline. Messaging requires the computer, the App plugin and network; reconnecting does not send drafts automatically.

### Current capabilities

| Scope | Current behavior |
| --- | --- |
| Text conversations | Bot / group text history, complete replies, send confirmation and status queries |
| Host capabilities | Models, usage, memory, schedules and queues are available according to host capability discovery |
| Not provided yet | Token deltas, native tool approvals, media/voice transport, system push notifications and group administration |
| Platforms | iOS / Android source preview; selected iPhone checks exist, Android device acceptance remains incomplete |

A visible control does not establish App plugin support. See [status](docs/status.md) and the [capability and validation matrix](docs/validation.md) for the complete scope.

## Two desktop plugins + the native App

| Project | Runs on | Responsibility | Best fit |
| --- | --- | --- | --- |
| [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web) | Computer DSH; accessed by a phone browser | Mobile Web interface, browser sign-in and history browsing | Users who want phone access immediately |
| **Mobile App** · this repository | Native client on the phone; companion in computer DSH | Native interaction, drafts and cache; desktop pairing approval, device management, authentication and transport | Developers able to build a native client |

There are two desktop plugins, Web and App, both reusing an existing DSH / official DS Bot team with no patch. **Web does not require the App plugin; the native App does not require Web.** The former Mobile Bridge is merged into the App plugin since 0.3.0. See [plugin lifecycles](docs/plugins.md).

### Versions and deliverables

| Deliverable | Current version | Distribution |
| --- | --- | --- |
| App source preview | `0.1.7-preview.1` | This repository and [releases](https://github.com/MuQY1818/ds-bot-mobile-app/releases/tag/v0.1.7-preview.1) |
| Native client | `0.1.7` | Build with your own platform toolchain; no public IPA/APK |
| Desktop App plugin | `0.3.0` | `ds-bot-mobile-app-0.3.0.tgz`, installed in DSH; includes the former Mobile Bridge |

Mobile Bridge is merged into App plugin 0.3.0 and no longer released separately; see [companion/README.md](companion/README.md) to migrate.

## Quick start

### 1. Prepare the computer

Use an existing DSH (0.2.1-rc.5+) and official DS Bot (0.2.6+) team. Install and enable the **App plugin**, then configure a phone-accessible HTTPS endpoint with a trusted certificate. Follow [installation and pairing](docs/installation.md).

Bridge requires compatible DS Bot interfaces. Pristine npm DS Bot `0.1.7` does not supply them. App releases include the separately identified `ds-bot-0.1.7-codex.1.tgz` compatible package; an existing compatible installation does not need replacing. The installation guide covers compatibility and updates.

### 2. Build the native client

Use **Node.js 24 + npm**. iOS requires macOS, Xcode and a simulator or your own device signing identity. Android requires the Android SDK, its build toolchain and an emulator or device.

```sh
git clone https://github.com/MuQY1818/ds-bot-mobile-app.git
cd ds-bot-mobile-app
npm run setup
npm --prefix apps/mobile run ios
```

For Android, use `npm --prefix apps/mobile run android`. The client uses Expo SDK 54, React Native 0.81.5 and custom native modules. Use a full development build; Expo Go does not provide the complete runtime. See the [native client guide](apps/mobile/README.md) for platform builds and signing.

### 3. Scan, verify and approve

1. Open **Phone access → App** in the computer's account menu and generate a pairing QR.
2. Scan with the native client and verify the host identity. Manual pairing details are available in the panel when scanning is unavailable.
3. Approve the matching device request on the computer, then open an existing conversation on the phone.

Web sign-in QR codes cannot pair the App. Unused pairing codes expire after two minutes; scanning alone does not grant access. See [troubleshooting](docs/troubleshooting.md) for connection issues.

## Documentation map

Start at the [documentation index](docs/README.md), or choose a guide below. Detailed guides are maintained in Simplified Chinese.

| Goal | Guides |
| --- | --- |
| Install and start using | [Installation and pairing](docs/installation.md) · [Usage](docs/usage.md) · [FAQ](docs/faq.md) |
| Resolve connection or update problems | [Troubleshooting](docs/troubleshooting.md) · [Bridge configuration](docs/bridge.md) |
| Understand components and APIs | [Plugin responsibilities](docs/plugins.md) · [Owner API](docs/bridge-api.md) · [Mobile SDK](packages/mobile-sdk/README.md) |
| Build and contribute | [Native client](apps/mobile/README.md) · [Development checks](docs/development.md) · [Interaction design](docs/design.md) |
| Follow versions and completion scope | [Changelog](CHANGELOG.md) · [Status](docs/status.md) · [Validation record](docs/validation.md) |

## Contributing

Reproducible issues, documentation improvements and focused feature PRs are welcome. Read the [development guide](docs/development.md), validate against isolated fixtures and preserve the public DSH API boundary. After dependency setup, the baseline checks are:

```sh
npm --prefix bridge run test:prepare
npm run check
npm run audit
```

Bridge and companion changes also require their integration and packed-delivery checks. Include platform, component versions, reproduction steps and expected behavior in reports. Keep signing material, pairing details, private conversations and runtime state out of commits and public screenshots.

[Report an issue](https://github.com/MuQY1818/ds-bot-mobile-app/issues) · [Contributors](https://github.com/MuQY1818/ds-bot-mobile-app/graphs/contributors)

## License and provenance

[Apache License 2.0](LICENSE). The App / SDK builds on [QingJ01/DS-Bot-App](https://github.com/QingJ01/DS-Bot-App); the original DS Bot characters and sprite algorithms come from [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot). Copyright, dependency notices and modification history remain in [NOTICE](NOTICE) and [provenance](docs/provenance.md).

This independent community project is not affiliated with DeepSeek.
