# DS Bot Mobile App

Your existing Bot team, on your phone. A native iOS / Android client for your own DeepSeek Harness and DS Bot host.

[中文](README.md) · [Installation](docs/installation.md) · [Development](docs/development.md) · [Compatibility](docs/validation.md) · [Releases](https://github.com/MuQY1818/ds-bot-mobile-app/releases) · [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web)

Source preview 0.1.2-preview.1 includes DS Bot Mobile Bridge 0.0.6. Releases contain the bridge package, compatible DS Bot package and checksums. Signed IPA/APK builds are not distributed; build with your own signing identity.

The reviewed bridge supports Bot/group text, attributed committed-message events, model/effort selection, flags, Usage, own memory, schedule create/read/delete and user queue operations. Token deltas, native approvals, media/voice, APNs and group administration remain unsupported. The client honors capability discovery.

The standard DSH bundle starts inert and requires explicit owner configuration, dedicated storage and HTTPS before device pairing. It reuses the existing team and never patches DSH. See the linked installation and validation documents for requirements and limitations.

Derived from QingJ01/DS-Bot-App and Fei2411/DeepSeek-Bot under Apache-2.0. Original attribution is retained in LICENSE and NOTICE. Independent community project; not an official DeepSeek product.
