# DS Bot Mobile Bridge

原生 App 的独立 DSH 设备认证与文字传输插件，当前版本 **0.0.6**。[English](README.md)

本目录是 App 仓库保留的 `0.0.6` 兼容快照。Bridge 后续维护与发布入口为[独立 Mobile Bridge 仓库](https://github.com/MuQY1818/ds-bot-mobile-bridge)；本地快照继续用于 App 构建、测试和历史交付复现。

仅使用手机浏览器时，请选择 [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web)，无需安装此包。

## 安装与配置

在现有 DSH 的官方插件管理器安装 `ds-bot-mobile-bridge-0.0.6.tgz`。按 `cordis.patch.example.yml` 设置 `enabled`、专用绝对 `home`、loopback 端口和手机可达的 HTTPS `publicUrl`。Bridge 默认等待明确配置，不自行创建隧道、证书或团队。

DS Bot 必须提供 `bridge.describe`、稳定 `bridge.submit` 与 `bridge.redact`；原版 npm DS Bot `0.1.7` 不满足。项目发布页提供明确标识的兼容包。完整步骤见[安装指南](https://github.com/MuQY1818/ds-bot-mobile-app/blob/main/docs/installation.md)。

安装 App 配套插件后，从电脑 **手机访问 → App** 生成配对码、批准手机或撤销设备。两插件独立启停。配对码和设备凭据只给自己的设备。

## 当前能力

Bot / 群文字历史、完整消息、稳定回执，以及宿主声明支持的模型、用量、记忆、日程和用户队列操作。逐 token、原生审批、媒体/语音、系统推送和群管理未提供。

## 更新与停止

停用 Bridge 会释放监听和路由。保留原 `home` 以保留配对与回执；迁移前先停用旧实例，避免同端口或同目录争用。

开发、隔离测试和所有者接口见主仓库文档。Apache-2.0；来源及版权声明保留于 LICENSE / NOTICE。
