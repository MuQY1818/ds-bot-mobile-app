# DS Bot Mobile App · Desktop companion

The computer-side pairing and device-management interface for the native App. Current version: **0.2.0**. Authentication and transport belong to the separate Mobile Bridge plugin.

## Start

1. Prepare compatible DS Bot and Mobile Bridge with a phone-accessible HTTPS endpoint.
2. Install and enable `ds-bot-mobile-app-0.2.0.tgz` through the DSH plugin manager.
3. Open **Phone access → App**, generate a pairing QR, scan with the native client and approve the matching request on the computer.

The official bundle configuration can open the same dialog. With compatible Mobile Web installed, the dialog contains **Web / App** tabs; either interface also works alone. Browser sign-in QR codes cannot pair the native App.

Disabling this companion removes its UI, not Bridge or approved devices. Use **Revoke access** and confirm to disconnect a phone. Unused pairing codes expire after two minutes; hiding a QR does not revoke already approved access.

Detailed setup: [installation](https://github.com/MuQY1818/ds-bot-mobile-app/blob/main/docs/installation.md). Native clients remain a source preview; public IPA/APK files are not provided. For direct phone access, use [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web).

## 中文

这是电脑端的配对管理插件，不是手机安装包，也不是 Bridge。准备好兼容 DS Bot 与 Bridge 后，在官方管理器安装并启用，从 **手机访问 → App** 生成二维码并批准设备。停用本包只移除管理界面；要断开手机，在设备列表撤销并确认。

Development and isolated fixture instructions are in the parent [development guide](https://github.com/MuQY1818/ds-bot-mobile-app/blob/main/docs/development.md).

Apache-2.0; dependency attribution is retained in NOTICE.
