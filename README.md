<div align="center">

<h1>DS Bot Mobile App</h1>
<p>在手机上连接已有 Bot 团队，阅读会话、继续草稿，并按设备管理访问权限。</p>

<p>
  <a href="https://github.com/MuQY1818/ds-bot-mobile-app/actions/workflows/check.yml"><img src="https://github.com/MuQY1818/ds-bot-mobile-app/actions/workflows/check.yml/badge.svg?branch=main" alt="CI checks on main"></a>
  <a href="docs/status.md"><img src="https://img.shields.io/badge/source%20preview-0.1.7--preview.1-5879E8" alt="Source preview 0.1.7-preview.1"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-3D8B7D" alt="Apache License 2.0"></a>
</p>

<p>简体中文 · <a href="README.en.md">English</a> · <a href="docs/installation.md">安装与配对</a> · <a href="docs/usage.md">使用指南</a> · <a href="https://github.com/MuQY1818/ds-bot-mobile-app/releases">发布版本</a> · <a href="docs/README.md">文档</a></p>

</div>

> **希望直接在手机使用？** 先选 [DS Bot Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web)，通过浏览器连接，无需构建原生客户端。本仓库提供 iOS / Android 客户端源码及电脑端 App 配套插件，目前没有可直接安装的 IPA/APK。

## 已有团队的原生入口

连接电脑上已经运行的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）和 DS Bot，保留原有 Bot、群聊和会话。手机提供原生导航、消息阅读与草稿体验；电脑端配套插件负责配对批准和设备管理，独立 Bridge 负责认证与传输。

| 会话列表 | 单聊 | 群聊 |
| :---: | :---: | :---: |
| <img src="docs/images/iphone-conversations.png" width="260" alt="iPhone 真机示例：会话列表"> | <img src="docs/images/iphone-chat.png" width="260" alt="iPhone 真机示例：单聊"> | <img src="docs/images/iphone-group.png" width="260" alt="iPhone 真机示例：群聊"> |

<p align="center"><sub>真实 iPhone 中的示例界面，使用合成会话。图片展示原生布局；当前功能与设备支持以<a href="docs/status.md">状态页</a>为准。</sub></p>

<details>
<summary><strong>电脑端：手机访问 → App</strong></summary>
<p align="center"><img src="docs/images/phone-access-app.png" width="960" alt="运行中的电脑端手机访问 App 标签与设备管理"></p>
<p>从同一入口生成配对二维码、批准设备请求、查看和撤销授权。图中未展示配对二维码或访问凭据，图片来源见<a href="docs/images/README.md">截图说明</a>。</p>
</details>

## 为手机使用而设计

<table>
  <tr>
    <td width="50%"><strong>会话跟着团队走</strong><br>读取已有 Bot 和群聊的文字历史，保留群成员归属。无需在手机重新创建一份团队。</td>
    <td width="50%"><strong>适合阅读的消息</strong><br>中文 Markdown、代码和表格；iOS 原生局部选字与拖动手柄，气泡下方一键复制原始 Markdown。</td>
  </tr>
  <tr>
    <td><strong>继续写下一条草稿</strong><br>发送后立即显示待确认气泡，输入框留给新草稿。未知或失败的发送保留原内容，供检查与手动重试。</td>
    <td><strong>每台设备单独授权</strong><br>电脑所有者批准配对，按设备撤销访问。配套界面与 Bridge 独立启停，授权由 Bridge 保存。</td>
  </tr>
</table>

还有中英文界面、明暗主题、角色头像、近期会话缓存和回到最新消息的快捷按钮。离线时可阅读已有缓存和编辑草稿；收发仍需要电脑、Bridge 与网络可用，恢复网络不会自动发送草稿。

### 当前能力

| 范围 | 当前行为 |
| --- | --- |
| 文字会话 | Bot / 群文字历史、完整回复、发送确认与状态查询 |
| 宿主扩展能力 | 模型、用量、记忆、日程、队列等按宿主实际声明开放 |
| 尚未提供 | 逐 token 增量、原生工具审批、媒体/语音传输、系统推送通知、群管理 |
| 平台状态 | iOS / Android 源码预览；已有部分 iPhone 验证，Android 真机验收尚未完成 |

界面中存在某个控件，不代表当前 Bridge 支持相应功能。完整范围见[状态说明](docs/status.md)和[能力与验证矩阵](docs/validation.md)。

## 三个组件，各有职责

| 项目 | 安装位置 | 职责 | 适合谁 |
| --- | --- | --- | --- |
| [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web) | 电脑 DSH；手机浏览器访问 | 移动 Web 界面、浏览器登录与历史浏览 | 希望直接在手机使用的用户 |
| **Mobile App** · 本仓库 | 原生客户端在手机；配套插件在电脑 DSH | 原生交互、草稿与缓存；电脑上的配对批准和设备管理 | 能够自行构建原生客户端的开发者 |
| [Mobile Bridge](https://github.com/MuQY1818/ds-bot-mobile-bridge) | 电脑 DSH | App 设备身份、HTTP/WS 传输、能力适配与授权存储 | 需要连接原生客户端的部署者 |

三者复用已有 DSH / DS Bot 团队。Web、App 配套插件和 Bridge 是可分别安装、启停的电脑插件；原生 App 是手机客户端。**只用 Web 无需安装 App 或 Bridge；原生 App 无需安装 Web。** 停用 App 配对界面不会自动撤销手机或停止 Bridge。详见[插件职责与生命周期](docs/plugins.md)。

### 版本与交付

| 交付项 | 当前版本 | 获取方式 |
| --- | --- | --- |
| App 源码预览 | `0.1.7-preview.1` | 本仓库与[发布页](https://github.com/MuQY1818/ds-bot-mobile-app/releases/tag/v0.1.7-preview.1) |
| 原生客户端 | `0.1.7` | 使用自己的平台工具链构建；无公开 IPA/APK |
| 电脑端 App 配套插件 | `0.2.0` | [`ds-bot-mobile-app-0.2.0.tgz`](https://github.com/MuQY1818/ds-bot-mobile-app/releases/download/v0.1.7-preview.1/ds-bot-mobile-app-0.2.0.tgz)，安装到 DSH |
| Mobile Bridge | `0.0.6` | [独立仓库与发布](https://github.com/MuQY1818/ds-bot-mobile-bridge/releases/tag/v0.0.6)；电脑端插件包 |

本仓库的 [`bridge/`](bridge/README.zh.md) 保留 `0.0.6` 兼容源码快照，用于已有构建、测试和历史交付复现。Bridge 的独立入口和后续维护见新仓库；本地快照继续保留，不因仓库拆分而移除。

## 快速开始

### 1. 准备电脑端

准备已有 DSH / DS Bot 团队，安装并启用 **Mobile Bridge** 和 **App 配套插件**，为 Bridge 配置手机可达、证书可信的 HTTPS 入口。完整步骤见[安装与配对](docs/installation.md)。

Bridge 需要兼容的 DS Bot 接口。原版 npm DS Bot `0.1.7` 不满足此要求；App 发布页另有明确标识的 `ds-bot-0.1.7-codex.1.tgz` 兼容包。已有兼容版本无需重复替换，安装顺序与升级要求见安装指南。

### 2. 构建原生客户端

需要 **Node.js 24 + npm**。iOS 需要 macOS、Xcode 和模拟器或自己的设备签名；Android 需要 Android SDK、对应构建工具和模拟器或设备。

```sh
git clone https://github.com/MuQY1818/ds-bot-mobile-app.git
cd ds-bot-mobile-app
npm run setup
npm --prefix apps/mobile run ios
```

Android 改用 `npm --prefix apps/mobile run android`。项目使用 Expo SDK 54、React Native 0.81.5 和自定义原生模块，须使用完整开发构建；Expo Go 不提供完整运行环境。平台构建与签名见[原生客户端指南](apps/mobile/README.md)。

### 3. 扫码，核对，批准

1. 在电脑账户菜单打开 **手机访问 → App**，生成配对二维码。
2. 使用原生客户端扫描，核对主机身份；无法扫码时使用面板提供的手动配对资料。
3. 在电脑批准匹配的设备请求，再从手机打开已有会话。

Web 登录码不能用于 App 配对。未使用的配对码两分钟后失效，扫码本身不会授予访问权限。遇到连接问题请看[故障排查](docs/troubleshooting.md)。

## 文档地图

从[文档首页](docs/README.md)按目标选择指南，也可以直接进入：

| 目标 | 文档 |
| --- | --- |
| 安装并开始使用 | [安装与配对](docs/installation.md) · [日常使用](docs/usage.md) · [常见问题](docs/faq.md) |
| 处理连接或升级问题 | [故障排查](docs/troubleshooting.md) · [Bridge 配置](docs/bridge.md) |
| 理解组件与接口 | [插件职责](docs/plugins.md) · [所有者接口](docs/bridge-api.md) · [Mobile SDK](packages/mobile-sdk/README.md) |
| 构建与参与开发 | [原生客户端](apps/mobile/README.md) · [开发检查](docs/development.md) · [交互设计](docs/design.md) |
| 了解版本与完成范围 | [更新记录](CHANGELOG.md) · [当前状态](docs/status.md) · [验证记录](docs/validation.md) |

## 参与贡献

欢迎提交复现清晰的问题、文档改进和功能 PR。先阅读[开发指南](docs/development.md)，使用独立 fixture 验证，保留公共 DSH API 边界。安装依赖后，基础检查为：

```sh
npm --prefix bridge run test:prepare
npm run check
npm run audit
```

Bridge、配套插件改动还需要各自的集成与打包交付检查。报告问题时说明平台、组件版本、复现步骤与预期行为；设备签名、配对资料、私聊和运行态数据不应进入提交或公开截图。

[提交问题](https://github.com/MuQY1818/ds-bot-mobile-app/issues) · [查看贡献记录](https://github.com/MuQY1818/ds-bot-mobile-app/graphs/contributors)

## 许可与来源

采用 [Apache License 2.0](LICENSE)。App / SDK 基于 [QingJ01/DS-Bot-App](https://github.com/QingJ01/DS-Bot-App)，DS Bot 原始角色与精灵算法来自 [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot)。版权、依赖与修改来源保留于 [NOTICE](NOTICE) 和[来源说明](docs/provenance.md)。

这是独立社区项目，与 DeepSeek 官方无隶属关系。
