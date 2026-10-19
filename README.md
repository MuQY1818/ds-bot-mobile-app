# DS Bot Mobile App

连接已有 Bot 团队的 iOS / Android 原生客户端源码预览。

[English](README.en.md) · [安装与配对](docs/installation.md) · [使用指南](docs/usage.md) · [发布版本](https://github.com/MuQY1818/ds-bot-mobile-app/releases) · [反馈](https://github.com/MuQY1818/ds-bot-mobile-app/issues)

**希望直接在手机使用，建议先选 [DS Bot Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web)。** Web 是目前主要入口，无需自行构建 App。本仓库面向希望使用原生客户端、能够准备平台构建工具的开发者。

当前源码预览为 **0.1.6-preview.1**：原生 App **0.1.6**、电脑配套插件 **0.2.0**、Mobile Bridge **0.0.6**。iOS 正文支持系统局部选字、拖动手柄和复制；整条消息操作位于独立按钮。尚未提供可直接下载使用的 IPA/APK，实际验收与设备安装状态见[状态页](docs/status.md)。

## 界面预览

| 会话 | 单聊 | 群聊 |
| :---: | :---: | :---: |
| <img src="docs/images/iphone-conversations.png" width="260" alt="会话"> | <img src="docs/images/iphone-chat.png" width="260" alt="单聊"> | <img src="docs/images/iphone-group.png" width="260" alt="群聊"> |

<p align="center">
  <img src="docs/images/phone-access-app.png" width="960" alt="电脑端手机访问 App 标签与设备管理">
</p>

*iPhone 真机截图，会话使用示例数据。电脑端设备管理截图来自已安装运行的配套插件，未展示配对二维码或访问凭据。*

## 已实现的体验

- 使用现有 Bot 与群聊，查看文字历史和带成员归属的完整回复。
- 原生导航、返回手势、主题、中英文界面和精灵头像。
- 点击发送即显示“正在发送”气泡，并清空输入框，让你继续编辑下一条草稿；宿主确认后才标为已发送。
- 未确认或失败的发送保留原内容，供手动查询和重试；迟到回执不会清掉新草稿。
- 从最新消息进入会话，离开底部后提供圆形返回按钮；近期会话短时复用前台连接。
- 电脑批准设备配对，分别查看和撤销授权。

功能受 Bridge 能力限制。当前独立 Bridge 推送完整消息，尚不提供逐 token 增量、原生工具审批、媒体/语音、系统推送通知或群管理。界面出现某项功能不代表所有宿主均支持，具体见[状态说明](docs/status.md)。

## 需要哪些组件

| 组件 | 安装位置 | 用途 |
| --- | --- | --- |
| 原生客户端 | iOS / Android | 手机界面；当前需自行构建 |
| `ds-bot-mobile-app` | 电脑 DSH | 配对二维码、批准请求、设备管理 |
| `ds-bot-mobile-bridge` | 电脑 DSH | 设备认证和消息传输 |
| 兼容的 DS Bot | 电脑 DSH | 复用原有 Bot、群聊和会话 |

Web、App 配套插件和 Bridge 是三个可独立启停的电脑插件。只用 Web 时不需要安装后两个。停用 App 配对界面不会自动撤销已授权手机或停止 Bridge。

## 安装与连接

1. **准备电脑**：按[安装指南](docs/installation.md)安装兼容 DS Bot、Bridge 和 App 配套插件，并配置手机可达的 HTTPS 入口。
2. **准备客户端**：使用自己的 Xcode 或 Android 工具链构建原生 App。项目包含自定义原生模块，不能用 Expo Go 代替完整运行环境。
3. **扫码批准**：在电脑打开 **手机访问 → App**，用原生客户端扫描配对码，再在电脑批准对应设备。

原版 npm DS Bot `0.1.7` 不提供此 Bridge 所需的稳定接口。发布页另有明确标识的 `ds-bot-0.1.7-codex.1.tgz` 兼容包；若已有符合接口的版本，无需重复替换。安装顺序与升级保留数据的要求见[安装指南](docs/installation.md)。

## 当前适用范围

已有 iPhone 的同身份覆盖更新、在线读取、部分滚动与键盘交互已检查。完整首次配对、真实收发、长后台、网络切换和 Android 真机矩阵仍未完成。用户消息的即时反馈与失败恢复使用隔离环境验证，不以自动测试替代真实设备结果。

当前工作重点是 Web，原生 App 保留源码预览。`0.1.6` 已通过原生 Release 模拟器选字检查并覆盖安装到本地 iPhone；安装、启动与缓存保留已确认，真机选字手感与完整设备矩阵仍待验收。

## 文档

| 文档 | 内容 |
| --- | --- |
| [安装与配对](docs/installation.md) | 组件、构建、网络、设备授权和升级 |
| [使用指南](docs/usage.md) | 会话、发送中状态、草稿和设备管理 |
| [常见问题](docs/faq.md) | Web 与 App、二维码、能力限制 |
| [故障排查](docs/troubleshooting.md) | 配对、离线、未知发送与升级问题 |
| [Bridge 配置](docs/bridge.md) | 电脑传输服务的准备与维护 |
| [插件职责](docs/plugins.md) | 三个插件如何独立工作 |
| [当前状态](docs/status.md) | 稳定预览与待完成工作 |
| [版本记录](CHANGELOG.md) | 用户可见的变化 |

开发者另见[原生客户端构建](apps/mobile/README.md)、[开发指南](docs/development.md)与[验证记录](docs/validation.md)。

## 许可与来源

采用 [Apache License 2.0](LICENSE)。保留原始版权、来源和依赖声明于 [NOTICE](NOTICE) 与[来源说明](docs/provenance.md)。这是独立社区项目，与 DeepSeek 官方无隶属关系。反馈时请遮住配对码、主机地址和私人聊天。
