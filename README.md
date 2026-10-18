<h1 align="center">DS Bot Mobile App</h1>

<p align="center">把电脑上的 Bot 团队，带到手机上。</p>

<p align="center">
  <a href="https://github.com/MuQY1818/ds-bot-mobile-app/actions/workflows/check.yml"><img src="https://github.com/MuQY1818/ds-bot-mobile-app/actions/workflows/check.yml/badge.svg?branch=main" alt="构建与检查"></a>
  <a href="https://github.com/MuQY1818/ds-bot-mobile-app/releases/tag/v0.1.4-preview.1"><img src="https://img.shields.io/badge/source-0.1.4--preview.1-blue" alt="源码预览 0.1.4-preview.1"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0 许可"></a>
</p>

<p align="center">
  简体中文 · <a href="README.en.md">English</a> · <a href="docs/installation.md">安装指南</a> · <a href="https://github.com/MuQY1818/ds-bot-mobile-app/releases">发布版本</a> · <a href="https://github.com/MuQY1818/ds-bot-mobile-app/issues">反馈</a>
</p>

DS Bot Mobile App 为自托管 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）与 [DS Bot](https://github.com/Fei2411/DeepSeek-Bot) 提供 iOS / Android 原生客户端和独立的电脑端配套插件。电脑端负责可视化配对与设备管理，**DS Bot Mobile Bridge** 负责认证与消息传输；模型与工具仍在电脑端运行。

> **源码预览**：当前版本为 `0.1.4-preview.1`，原生 App 版本 `0.1.4`，电脑端配套插件 `0.2.0`，Mobile Bridge 保持 `0.0.6`。配套插件与 Bridge 分别打包、安装和启停；Mobile Web `0.4.1` 与本插件共用“手机访问”弹窗；**尚未提供签名 IPA/APK**。原生客户端需使用自己的平台工具链构建。浏览器入口由 [DS Bot Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web) 提供。

## 界面预览

| 会话 | 单聊 | 群聊 |
| :---: | :---: | :---: |
| <img src="docs/images/iphone-conversations.png" width="260" alt="会话"> | <img src="docs/images/iphone-chat.png" width="260" alt="单聊"> | <img src="docs/images/iphone-group.png" width="260" alt="群聊"> |

<p align="center">
  <img src="docs/images/phone-access-app.png" width="960" alt="电脑端手机访问 App 标签与设备管理">
</p>

*iPhone 真机截图，会话使用示例数据。电脑端设备管理截图来自已安装运行的配套插件，未展示配对二维码或访问凭据。*

## 主要功能

- **延续现有会话**：访问 Bot 与群聊，收发文字，查看带成员署名的回复。
- **原生交互**：页面导航、返回手势、消息滚动、精灵头像、深浅主题与中英文界面。
- **设备独立授权**：电脑所有者批准配对，可单独撤销设备访问。
- **电脑端配对管理**：从账户菜单的“手机访问 → App”生成二维码、查看待批准请求与授权设备，并二次确认撤销；与 Web 插件共享一个入口。
- **连接恢复与草稿**：恢复连接后同步历史，保留本地草稿，发送由用户确认。
- **宿主能力集成**：模型与思考强度、会话标记、Usage、个人记忆、定时任务创建/查看/删除及自己的排队输入查看/移除。

功能以 Bridge 的能力声明为准。当前消息推送发生在**完整消息提交后**；逐 token 推送、原生工具审批、媒体/语音、APNs、群管理及定时任务修改尚未提供。完整矩阵见[兼容与验证](docs/validation.md)。

## 工作方式

```mermaid
flowchart LR
    Owner["电脑端 App 配套插件"] -->|配对与撤销| Bridge
    Phone["iOS / Android App"] --> HTTPS["你的 HTTPS 入口"]
    HTTPS --> Bridge["DS Bot Mobile Bridge"]
    Bridge --> Host["现有 DSH / DS Bot 团队"]
```

三个电脑端功能均使用标准 DSH bundle：

| 插件 | 职责 | 依赖 |
| --- | --- | --- |
| [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web) | 手机浏览器布局与浏览器登录入口 | 已有 DSH Web 与 DS Bot |
| [Mobile App](companion/README.md) | 原生 App 的电脑端配对、批准与设备管理 | 已配置的 Mobile Bridge |
| [Mobile Bridge](bridge/README.zh.md) | 手机设备认证、HTTP/WS 协议和能力适配 | 兼容的 DS Bot 窄接口 |

App 配套插件和 Bridge 在本仓库维护，发布为两个独立 `.tgz`。原生 App 是手机上的独立客户端。停用 App 配套插件会移除配对界面；Bridge 与已授权手机可以继续工作。Web 使用宿主的浏览器认证，无需安装 App 或 Bridge。架构和生命周期见[插件职责](docs/plugins.md)。

Bridge 默认等待所有者配置。配置独立状态目录与 HTTPS 后，由电脑批准手机配对。消息缓存与草稿保存在客户端；设备凭据使用平台安全存储。

## 开发状态

Bridge 文字链路和电脑端配对管理界面已实现，并使用隔离宿主验证。原生客户端仍是开发者源码预览；签名分发及完整真机验收仍待完成。详细进度见[开发状态](docs/status.md)。

## 快速开始

### 环境要求

| 组件 | 要求 |
| --- | --- |
| 宿主 | DSH `0.2.1-rc.2` 与兼容 DS Bot 包 |
| Bridge | 同次发布的 `ds-bot-mobile-bridge-0.0.6.tgz` |
| App 配套插件 | `ds-bot-mobile-app-0.2.0.tgz`，用于电脑端可视化设备管理 |
| 网络 | 手机可达、证书可信的 HTTPS 入口 |
| 开发环境 | Git、Node.js 24、npm；源码审计需 Python 3 |
| iOS 构建 | macOS、Xcode；真机使用自己的签名身份 |
| Android 构建 | Android SDK 与对应构建工具链 |

**兼容性前提**：Bridge 依赖 `bridge.describe`、稳定的 `bridge.submit` 与 `bridge.redact` 接口。原版 npm DS Bot `0.1.7` 不包含这些接口；本项目[发布页](https://github.com/MuQY1818/ds-bot-mobile-app/releases/tag/v0.1.4-preview.1)提供单独标识的 `ds-bot-0.1.7-codex.1.tgz`。安装位置与迁移步骤见[安装指南](docs/installation.md)。

### 1. 准备电脑端

从 Release 下载兼容 DS Bot、Bridge、App 配套插件及各自校验文件，核对校验值后，通过现有 DSH 插件管理器分别安装。按[Bridge 配置示例](bridge/cordis.patch.example.yml)设置独立状态目录、监听地址及 HTTPS 入口。启用 `ds-bot-mobile-app` 后，打开账户菜单 **手机访问 → App**，确认显示 **连接服务已就绪**，再生成配对二维码。官方插件侧栏中该 bundle 的配置页也可打开同一入口。详细步骤见[安装指南](docs/installation.md)。

### 2. 构建客户端

```sh
git clone https://github.com/MuQY1818/ds-bot-mobile-app.git
cd ds-bot-mobile-app
npm run setup
```

选择一个平台构建开发客户端：

```sh
npm --prefix apps/mobile run ios
# 或
npm --prefix apps/mobile run android
```

项目包含自定义原生模块，请使用开发构建。平台准备与签名说明见[客户端文档](apps/mobile/README.md)。

### 3. 配对并连接

在 App 扫描电脑配套插件生成的二维码，核对主机身份，并在电脑的“待批准请求”中批准对应设备。Web 的登录二维码与 App 配对二维码用途不同。首次使用建议先确认手机与电脑网络互通，随后打开一个已有会话。完整配置、迁移与回退步骤见[安装指南](docs/installation.md)。

## 开发与贡献

在完成 `npm run setup` 后，从仓库根目录运行：

```sh
npm --prefix bridge run test:prepare
npm run check
npm --prefix bridge run test:integration
npm run audit
```

测试使用固定公开依赖、mock 模型和隔离宿主。开发环境、打包与原生验证说明见[开发指南](docs/development.md)。欢迎通过 [Issues](https://github.com/MuQY1818/ds-bot-mobile-app/issues) 报告可复现的问题，或按[贡献指南](CONTRIBUTING.md)提交改进。

## 文档与项目结构

| 入口 | 内容 |
| --- | --- |
| [安装指南](docs/installation.md) | 宿主配置、客户端构建、配对、迁移与回退 |
| [开发指南](docs/development.md) | 环境准备、隔离测试与打包 |
| [兼容与验证](docs/validation.md) | 能力矩阵、验证层级与已知限制 |
| [设计说明](docs/design.md) | 布局、消息归属与开发预览 |
| [来源记录](docs/provenance.md) | 上游版本、审查范围与修改来源 |
| [插件职责](docs/plugins.md) | 三个独立插件、原生客户端与启停行为 |
| [companion](companion/README.md) | 标准 DSH 电脑端 App 配对管理插件 |
| [apps/mobile](apps/mobile/README.md) | Expo / React Native 客户端 |
| [packages/mobile-sdk](packages/mobile-sdk/README.md) | 协议、连接、回执与缓存 SDK |
| [bridge](bridge/README.zh.md) | 独立 DSH Bridge、配置与所有者接口 |

## 当前限制

本项目仍处于源码预览阶段。自动化测试、Hermes bundle 导出和 Web 设计预览各自有明确范围；已有部分 iPhone 安装、在线读取和界面检查，首次配对、Android 真机、锁屏、网络切换及通知等完整矩阵尚未完成。DSH 跨重启的 pending 恢复也存在上游限制。详见[验证说明](docs/validation.md)。

## 许可与致谢

基于 [QingJ01/DS-Bot-App](https://github.com/QingJ01/DS-Bot-App) 与 [Fei2411/DeepSeek-Bot](https://github.com/Fei2411/DeepSeek-Bot)，采用 [Apache License 2.0](LICENSE)。原始署名与第三方声明保留于 [NOTICE](NOTICE) 和[来源记录](docs/provenance.md)。

本项目为独立社区项目，与 DeepSeek 官方无隶属关系。
