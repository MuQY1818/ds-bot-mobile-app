# DS Bot Mobile App 文档

[项目首页](../README.md) · [English overview](../README.en.md) · [发布版本](https://github.com/MuQY1818/ds-bot-mobile-app/releases)

本仓库提供原生客户端源码和电脑端 App 配套插件。希望直接在手机使用，请先选 [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web)；原生 App 目前没有公开 IPA/APK，需要自行构建。详细指南以简体中文维护，英文产品说明见项目首页。

## 按目标开始

| 你想做什么 | 建议阅读顺序 |
| --- | --- |
| 判断是否适合使用 | [常见问题](faq.md) → [当前状态](status.md) |
| 第一次安装原生 App | [安装与配对](installation.md) → [原生客户端构建](../apps/mobile/README.md) → [使用指南](usage.md) |
| 部署和维护电脑端 | [插件职责](plugins.md) → [Bridge 配置](bridge.md) → [故障排查](troubleshooting.md) |
| 升级已有部署 | [安装指南：更新与保留数据](installation.md#更新与保留数据) → [更新记录](../CHANGELOG.md) |
| 参与客户端或配套插件开发 | [开发与检查](development.md) → [交互设计](design.md) → [验证记录](validation.md) |
| 开发 Bridge 或使用接口 | [独立 Bridge 仓库](https://github.com/MuQY1818/ds-bot-mobile-bridge) → [所有者接口](bridge-api.md) → [Mobile SDK](../packages/mobile-sdk/README.md) |

## 文档目录

| 文档 | 内容 |
| --- | --- |
| [安装与配对](installation.md) | 当前下载入口、平台要求、HTTPS、设备批准、更新与回退 |
| [使用指南](usage.md) | 会话历史、草稿、发送状态、局部选字与设备管理 |
| [常见问题](faq.md) | Web / App 选择、组件区别、能力和平台范围 |
| [故障排查](troubleshooting.md) | 连接服务未就绪、二维码、未知发送与升级问题 |
| [插件职责与生命周期](plugins.md) | 三个独立插件、共享手机访问入口与启停语义 |
| [Bridge 配置](bridge.md) | 认证与传输插件的部署、状态目录和维护 |
| [所有者接口](bridge-api.md) | 电脑配套界面与 Bridge 的所有者操作协议 |
| [原生客户端构建](../apps/mobile/README.md) | Expo 开发构建、签名、平台工具链和设计预览 |
| [开发与检查](development.md) | 独立 fixture、工程检查、插件构建与交付 |
| [交互设计](design.md) | 会话布局、原生与 Web 预览的不同验证范围 |
| [当前状态](status.md) | 当前版本、已实现能力、待验收项目 |
| [能力与验证记录](validation.md) | 宿主能力矩阵、模拟器、部署与设备证据 |
| [来源说明](provenance.md) | 上游基线、独立实现、许可与修改来源 |
| [截图说明](images/README.md) | 真实 iPhone、电脑端与 Web 组件预览的图片来源 |

## 版本与发布

| 组件 | 版本 | 入口 |
| --- | --- | --- |
| 原生 App / 源码预览 | `0.1.7` / `0.1.7-preview.1` | [App 发布页](https://github.com/MuQY1818/ds-bot-mobile-app/releases/tag/v0.1.7-preview.1) |
| 电脑端 App 配套插件 | `0.2.0` | 与 App 源码预览一起提供 `.tgz` |
| Mobile Bridge | `0.0.6` | [独立仓库发布](https://github.com/MuQY1818/ds-bot-mobile-bridge/releases/tag/v0.0.6) |

本仓库 `bridge/` 是保留的兼容快照，供当前 App 构建和测试复现；后续 Bridge 开发从独立仓库进入。App、配套插件与 Bridge 独立版本化，更新一个组件不表示其他组件已经更新。

历史变化见 [CHANGELOG](../CHANGELOG.md)；各次源码预览说明保留于 [0.1.7](releases/v0.1.7-preview.1.md)、[0.1.6](releases/v0.1.6-preview.1.md)、[0.1.5](releases/v0.1.5-preview.1.md) 和 [0.1.4](releases/v0.1.4-preview.1.md)。旧版本记录描述的是当次交付，不代表当前支持范围。

## 反馈与贡献

使用问题请先查常见问题和故障排查，再到 [Issues](https://github.com/MuQY1818/ds-bot-mobile-app/issues) 提供组件版本与复现步骤。公开报告与图片请去除配对资料、私人聊天、设备身份和签名内容。贡献代码前阅读开发指南，保留 [LICENSE](../LICENSE)、[NOTICE](../NOTICE) 及来源记录。
