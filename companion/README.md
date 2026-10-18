# DS Bot Mobile App · Desktop companion

A standard DSH UI bundle for pairing and managing native App devices. The native client lives in `apps/mobile/`; authentication and transport belong to the separate `ds-bot-mobile-bridge` bundle.

Install `ds-bot-mobile-app-0.2.0.tgz` using the official DSH plugin manager, enable it, then open **Phone access → App** from the DS Bot account menu. The official bundle configuration can open the same dialog. With Mobile Web 0.4.0 enabled, the dialog includes **Web / App** tabs; either plugin also works alone. Scan with the native App and explicitly approve the matching request. Device revocation has an additional confirmation step. See the [installation guide](../docs/installation.md) for prerequisites and transport configuration.

Mobile Bridge must already be installed and configured. Missing or disabled Bridge is shown as a setup state. This companion does not create listeners, tunnels, credentials or a second Bot runtime. QR content stays in page memory; it is removed when explicitly hidden, expired or the page is left. Hiding a QR does not revoke an already copied code; codes expire after two minutes, and generating a new code replaces unused earlier codes.

## Independent lifecycle

Disabling this bundle removes its configuration UI and clears page timers, requests and pairing data. It does not disable Bridge, revoke approved devices or remove Bridge storage. Re-enable it to manage the same devices. To disconnect a phone, use **Revoke access** and confirm, or use the authenticated Bridge owner API. See [plugin responsibilities](../docs/plugins.md).

The Web plugin uses browser sign-in; this plugin manages native App devices. Their QR codes cannot be exchanged.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm run build
npm run test:delivery
```

Uses public DSH `settings.section`, `plugins.bundle.config` and the existing authenticated Bridge owner channel. The settings entry keeps device management reachable when a host shell or third-party market exposes a different plugin-management interface. All tests use isolated or synthetic inputs. See the parent project documentation for installation, supported capabilities and device validation.

`test:delivery` requires the prepared public Bridge fixture (`npm --prefix bridge run test:prepare` from the repository root). It installs a pinned local pnpm into an ignored isolated directory, invokes the official manager through the real owner carrier and cleans up its child services. It does not use a live user profile. To test a release archive, pass its path after `--`; without one, a temporary exact-source archive is created.

Use `npm run fixture` for an explicitly persistent mock preview and `Ctrl+C` to stop it. Synthetic login material is written only to ignored `fixture/ready.json` with mode `0600`. It must never be included in screenshots, commits or release packages.

## 中文

此包是原生 App 的**电脑端配套插件**。在官方插件管理器安装并启用后，打开账户菜单 **手机访问 → App**，即可生成配对二维码、批准手机和撤销设备。官方本包配置页可打开同一弹窗；与兼容的 Web 插件同时启用时显示 Web / App 标签。它与手机 App 安装包、Mobile Web 登录二维码和 Bridge 传输插件分别承担不同职责。

安装前先准备兼容的 DS Bot 与独立 Bridge，并配置手机可达的 HTTPS。Bridge 尚未安装、启用或配置时，本页显示设置提示。停用或移除本插件会清理配对管理界面；已授权手机与 Bridge 的独立状态保留。要断开手机，在设备列表选择撤销并确认。

二维码和手动 JSON 仅驻留当前页面，隐藏、过期或离开页面后清理。隐藏不会撤销已复制的配对资料；未使用码两分钟后失效，新码替换之前未使用码，任何设备请求仍须电脑明确批准。详细步骤见[安装指南](../docs/installation.md)。

许可：Apache-2.0；本地 QR 编码器的 MIT 声明见 NOTICE。
