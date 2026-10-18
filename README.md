# DS Bot Mobile App

把电脑上的 Bot 团队，带到手机上。原生 iOS / Android 客户端，连接自己运行的 DeepSeek Harness 与 DS Bot，共用团队和会话。

[English](README.en.md) · [安装](docs/installation.md) · [开发](docs/development.md) · [兼容与验证](docs/validation.md) · [Releases](https://github.com/MuQY1818/ds-bot-mobile-app/releases) · [手机 Web](https://github.com/MuQY1818/ds-bot-mobile-web)

当前为源码预览版 **0.1.2-preview.1**，独立桥接包 **DS Bot Mobile Bridge 0.0.6**。发布页提供桥接安装包、兼容的 DS Bot 包和校验值；尚未发布签名 IPA/APK，请按构建说明生成自己的客户端。

<p align="center">
  <img src="docs/images/conversations.png" width="230" alt="会话列表示例">
  <img src="docs/images/chat.png" width="230" alt="单聊设计预览">
  <img src="docs/images/group.png" width="230" alt="带发言者署名的群聊设计预览">
</p>

预览采用虚构内容，由实际原生组件在 Web 渲染，不是手机实拍。查看[交互设计](docs/design.md)。

## 目前能做什么

- 与现有 Bot 或群聊收发文字，查看有署名的群成员回复。
- 原生页面导航、滚动和返回手势；原有精灵头像、深浅主题与中英文。
- 查看 Usage、管理自己的记忆，以及创建、查看和删除定时任务。
- 按宿主能力切换模型、思考强度和标记，查看/移除自己排队的输入。
- 电脑批准手机配对，设备独立授权；断线后恢复历史，草稿不会自动重发。

当前独立 Bridge 推送的是**完整消息提交后的事件**。逐 token、原生工具审批、媒体/语音、APNs、群管理和定时任务修改等能力尚未提供；客户端按能力声明隐藏相应入口。它们不因界面中保留了上游组件就被算作可用。

## 连接方式

App → 你配置的 HTTPS 入口 → DS Bot Mobile Bridge → 现有 DSH / DS Bot。

电脑运行模型和工具；手机复用团队，不另建 Bot 运行时。Bridge 是标准 DSH bundle，安装后默认不开监听；由电脑所有者明确配置独立存储和 HTTPS，再批准配对。不自建隧道、不关闭认证、不修改 DSH 核心。

从[安装说明](docs/installation.md)开始。浏览器用户可选择独立的 **DS Bot Mobile Web**，无需安装 App。

## 源码与许可

| 目录 | 用途 |
| --- | --- |
| apps/mobile | Expo / React Native 客户端及原生模块 |
| packages/mobile-sdk | 共享协议、连接、回执和缓存 SDK |
| bridge | 可独立安装的 DS Bot Mobile Bridge |
| group-bridge/patches | DS Bot 0.1.7 窄接口的审查补丁，仅用于隔离 fixture |
| ds-bot/dev | 测试专用 mock 模型 |

本项目基于 [QingJ01/DS-Bot-App](https://github.com/QingJ01/DS-Bot-App) 和 [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot)，保留 Apache-2.0 许可和来源声明。详见 [NOTICE](NOTICE)、[来源记录](docs/provenance.md)。这是社区项目，并非 DeepSeek 官方产品。
