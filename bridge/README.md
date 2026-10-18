# DS Bot Mobile Bridge

The independently managed DSH device-authentication and text-transport plugin for the native App. Current version: **0.0.6**. [中文](README.zh.md)

For phone browser access, use [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web); this package is not required.

## Setup

Install `ds-bot-mobile-bridge-0.0.6.tgz` through your existing DSH plugin manager. Use `cordis.patch.example.yml` to configure `enabled`, a dedicated absolute `home`, a loopback port and an existing phone-accessible HTTPS `publicUrl`. Bridge waits for explicit configuration and does not provision tunnels, certificates or another team.

DS Bot must supply `bridge.describe`, stable `bridge.submit` and `bridge.redact`. Pristine npm DS Bot `0.1.7` does not. Project releases provide a separately identified compatible package. Follow the [installation guide](https://github.com/MuQY1818/ds-bot-mobile-app/blob/main/docs/installation.md).

With the App companion installed, use **Phone access → App** on the computer to create pairing codes, approve requests and revoke devices. The two plugins have independent lifecycles. Keep pairing material and device credentials private.

## Capabilities

Bot/group text history, complete messages, stable receipts and host-declared model, usage, memory, schedule and user-queue operations. Token deltas, native approvals, media/voice, system push and group administration are not provided.

## Updates and shutdown

Disabling Bridge releases routes and listeners. Retain its `home` to preserve device and receipt identity. Stop the old instance before migration to avoid sharing its port or state directory.

Development, isolated tests and owner APIs are documented in the parent project. Apache-2.0; preserve LICENSE / NOTICE and upstream attribution.
