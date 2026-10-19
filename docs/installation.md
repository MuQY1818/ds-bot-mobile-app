# 安装与配对

原生 App 当前是 `0.1.7-preview.1` 源码预览，客户端版本 `0.1.7`，尚无可直接安装的 IPA/APK。希望不构建客户端直接在手机使用，请选择 [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web)。[文档首页](README.md)提供其他指南入口。

## 开始前

- 电脑有可正常使用的 DSH / DS Bot 团队。当前组合为 DSH `0.2.1-rc.2`，以及满足 Bridge 接口的 DS Bot。
- 手机可访问证书可信的 HTTPS Bridge 入口；使用私网时，电脑与手机都需连入对应网络。
- iOS 构建需要 macOS、Xcode 和自己的签名身份；Android 需要 Android SDK 与构建工具。源码使用 Node.js 24 和 npm。

## 第一步：准备电脑端

使用下列明确版本的插件包，在日常使用的 DSH 插件管理器分别安装。App 配套插件与兼容 DS Bot 包位于 [App `v0.1.7-preview.1` 发布](https://github.com/MuQY1818/ds-bot-mobile-app/releases/tag/v0.1.7-preview.1)，Bridge 的独立发布入口为 [`v0.0.6`](https://github.com/MuQY1818/ds-bot-mobile-bridge/releases/tag/v0.0.6)：

| 文件 | 作用 |
| --- | --- |
| [`ds-bot-mobile-bridge-0.0.6.tgz`](https://github.com/MuQY1818/ds-bot-mobile-bridge/releases/download/v0.0.6/ds-bot-mobile-bridge-0.0.6.tgz) | 设备认证与消息传输 |
| [`ds-bot-mobile-app-0.2.0.tgz`](https://github.com/MuQY1818/ds-bot-mobile-app/releases/download/v0.1.7-preview.1/ds-bot-mobile-app-0.2.0.tgz) | 电脑上的配对与设备管理界面 |
| [`ds-bot-0.1.7-codex.1.tgz`](https://github.com/MuQY1818/ds-bot-mobile-app/releases/download/v0.1.7-preview.1/ds-bot-0.1.7-codex.1.tgz) | 缺少 Bridge 接口时使用的兼容 DS Bot 包 |

Bridge 需要 `bridge.describe`、稳定 `bridge.submit` 和 `bridge.redact`。原版 npm DS Bot `0.1.7` 不满足；已有提供这些接口的版本无需另换。等现有任务空闲后更新宿主，保留团队目录和旧包。

启用 Bridge 和 App 配套插件，按[Bridge 配置指南](bridge.md)设置专用状态目录、监听和 HTTPS。电脑账户菜单打开 **手机访问 → App**，刷新后应显示“连接服务已就绪”。找不到菜单时，可从官方插件管理器的 `ds-bot-mobile-app` 配置页打开同一弹窗。

安装文件应留在电脑，手机不安装这些 `.tgz`。

## 第二步：构建并安装客户端

```sh
git clone https://github.com/MuQY1818/ds-bot-mobile-app.git
cd ds-bot-mobile-app
npm run setup
npm --prefix apps/mobile run ios
# Android 改为 npm --prefix apps/mobile run android
```

项目含自定义原生模块，使用完整开发构建；Expo Go 不具备完整运行环境。上述脚本调用 `expo run:ios` / `expo run:android`，本地构建并安装开发客户端；首次构建前必须准备对应平台工具链。详细要求及 Expo 官方参考见[客户端构建说明](../apps/mobile/README.md)。提供 Android 构建入口不代表已经完成 Android 真机验收，当前范围见[状态页](status.md)。

更新已经安装的个人版本时，沿用应用标识、签名身份和 Keychain 权限，保留本地数据。不要通过先卸载清数据来处理一般升级。

## 第三步：扫码并批准设备

1. 在电脑的 **手机访问 → App** 生成配对二维码。
2. 用原生客户端扫描，核对主机身份。无法扫码时可使用面板的手动配对资料。
3. 在电脑“待批准请求”中核对设备名称，批准对应请求。
4. 手机上连接成功后，打开已有会话。

只扫码不会自动获得权限。未使用配对码两分钟后失效；超时后重新生成。Web 标签的二维码用于浏览器登录，不能用于 App 配对。

## 更新与保留数据

App、电脑配套插件和 Bridge 独立更新。手机覆盖更新应保持同一应用身份；Bridge 更新应保持同一专用 `home`。这些状态保存设备授权和回执，不要在普通升级中删除。

停用 App 配套插件只移除管理界面。需要断开设备时，在已授权设备中选择“撤销访问”并确认；要停止传输服务，另行停用 Bridge。

## 迁移与回退

从旧 file-entry 迁移 Bridge 时，先停用旧入口并释放端口，再以原 `home` 启用标准 bundle。回退同样先停用新版、释放监听，再恢复旧包与配置。不要同时启动两个 Bridge 争用同一状态目录或端口。

后续使用见[使用指南](usage.md)，遇到问题见[故障排查](troubleshooting.md)。
