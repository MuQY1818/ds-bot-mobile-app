# Mobile Bridge 配置与维护

Mobile Bridge 是原生 App 的电脑端传输插件。只使用 [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web) 时无需安装。当前包为 [`ds-bot-mobile-bridge-0.0.6.tgz`](https://github.com/MuQY1818/ds-bot-mobile-bridge/releases/download/v0.0.6/ds-bot-mobile-bridge-0.0.6.tgz)。独立维护与发布入口见 [Mobile Bridge 仓库](https://github.com/MuQY1818/ds-bot-mobile-bridge)。本页记录 App 配套所需的配置，本仓库 `bridge/` 保留兼容快照。

## 配置顺序

1. 确认 DS Bot 提供兼容 Bridge 接口；原版 npm `0.1.7` 不包含所需接口，[App 发布页](https://github.com/MuQY1818/ds-bot-mobile-app/releases/tag/v0.1.7-preview.1)提供明确标识的兼容包。
2. 在现有 DSH 插件管理器安装并启用 Bridge。
3. 按[配置示例](../bridge/cordis.patch.example.yml)设置专用存储和监听，由已有网络入口提供 HTTPS。
4. 安装并启用 App 配套插件，在 **手机访问 → App** 刷新，确认“连接服务已就绪”。

## 必需参数

| 参数 | 填写内容 |
| --- | --- |
| `enabled` | 明确设为 `true` |
| `home` | 独立、长期保留的绝对目录，不与 DSH 数据目录混用 |
| `host` / `port` | 建议只在 loopback 监听；代理目标必须对应实际端口 |
| `publicUrl` | 手机可访问且证书可信的 HTTPS Bridge 地址 |
| `allowedOrigins` | 按实际客户端来源设置，使用准确来源，不放开任意网站 |

使用直接 TLS 时才需要自行提供 `certPath` / `keyPath`。Bridge 不创建隧道、证书、私网账户或公网域名。

## 配对与撤销

日常管理在电脑 **手机访问 → App** 完成。生成二维码后，手机发起请求，电脑核对名称并批准。要断开设备，在已授权列表撤销并确认。

停用 App 配套插件只移除管理界面，已批准设备仍由 Bridge 管理。要停止整个传输服务，停用 Bridge。

## 更新和迁移

保留原 `home`，其中包含配对和回执身份。迁移旧 file-entry 时，先停用旧入口并释放端口，再以同一 `home` 启用标准包。不要同时运行两份实例使用同一状态目录。

完整安装流程见[安装与配对](installation.md)。开发者接口见[所有者接口](bridge-api.md)，能力边界见[当前状态](status.md)。
