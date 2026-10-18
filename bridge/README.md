# DS Bot Mobile Bridge

Standard DSH bundle for owner-approved pairing and scoped access to an existing DS Bot team. Version 0.0.6. [Project](https://github.com/MuQY1818/ds-bot-mobile-app) · [中文](README.zh.md).

Install the release archive through the official DSH plugin manager. The bundle is inert until explicitly configured: enabled:true, a dedicated absolute home separate from DSH_HOME, loopback host/port and an existing HTTPS publicUrl (or owner-supplied certificates). See cordis.patch.example.yml. It never provisions tunnels or automatically patches DS Bot.

DS Bot must expose the reviewed bridge.describe, stable bridge.submit and known-value bridge.redact interfaces. Pristine npm DS Bot 0.1.7 is refused for reliable text access. The parent project publishes a separately identified compatible DS Bot archive; selecting it is an explicit upgrade.

Owner operations use the authenticated /mobile-operator channel. POST /mobile-operator/status with {"type":"client-request","rpcId":"unique-id","method":"status","payload":{}}. Other fixed operations: pairing.create; pairing.approve/pairing.deny with payload {requestId}; device.revoke with payload {id}. The carrier must provide an owner principal. Never log returned pairing codes, URLs or device credentials.

Supports Bot/group committed text history/events, stable per-device receipts, model/effort, flags, Usage, own memory, schedule create/read/delete and user queue view/remove. No token deltas, native approvals, media/voice, APNs or group administration. Full compatibility and device limitations are in the parent docs/validation.md.

```sh
npm ci --ignore-scripts
npm run test:prepare
npm test
npm run lint
npm run test:integration
```

Fixtures use public pinned npm packages, dynamic ports, mock models and isolated HOME/DSH_HOME. BRIDGE_TEST_BOT / BRIDGE_TEST_DEPS can explicitly select reviewed test inputs. test:delivery verifies the exact tarball and owner lifecycle. Tests/operators/fixtures are excluded from the package.

Disable the standard bundle to stop transport and release routes/listeners. Keep its state directory to retain pairing and receipt identity. Migration must release the old file entry before enabling this package on the same port. Apache-2.0; preserve LICENSE/NOTICE.
