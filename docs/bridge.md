# App 连接配置与维护

原生 App 通过电脑端 **App 插件**（`ds-bot-mobile-app` 0.3.0+）连接 DS Bot。原独立的 Mobile Bridge 已并入该插件。只使用 [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web) 时无需安装。

## 配置顺序

1. 确认电脑上是 DSH `0.2.1-rc.5`+ 与官方 npm DS Bot `0.2.6`+，不需要任何补丁或兼容包。
2. 在现有 DSH 插件管理器安装并启用 `ds-bot-mobile-app-0.3.0.tgz`。
3. 按[配置示例](../companion/cordis.patch.example.yml)在 profile `cordis.patch.yml` 的 `ds-bot-mobile-app` 条目下设置专用存储和监听，由已有网络入口提供 HTTPS。
4. 在 **手机访问 → App** 刷新，确认“连接服务已就绪”。

## 参数

| 参数 | 填写内容 |
| --- | --- |
| `enabled` | 明确设为 `true` |
| `home` | 独立、长期保留的绝对目录，不与 DSH 数据目录混用 |
| `host` / `port` | 建议只在 loopback 监听；代理目标必须对应实际端口 |
| `publicUrl` | 手机可访问且证书可信的 HTTPS 地址 |
| `allowedOrigins` | 按实际客户端来源设置，使用准确来源，不放开任意网站 |
| `dsBotHome`（可选） | DS Bot 数据目录（用于读取 `secrets.json` 做已知值脱敏），默认 `DSH_HOME/bot` |

使用直接 TLS 时才需要自行提供 `certPath` / `keyPath`。插件不创建隧道、证书、私网账户或公网域名。

## 配对与撤销

日常管理在电脑 **手机访问 → App** 完成。生成二维码后，手机发起请求，电脑核对名称并批准。要断开设备，在已授权列表撤销并确认。

停用 App 插件会关闭监听，但 `home` 中的授权和回执保留；重新启用后已配对手机直接可用。

## 更新和迁移

保留原 `home`，其中包含配对和回执身份。从 Mobile Bridge 0.0.x 迁移时，先停用 `ds-bot-mobile-bridge`，把它的配置原样移到 `ds-bot-mobile-app` 条目下并保持同一 `home`，再启用 0.3.0 并移除旧包。不要同时运行两份实例使用同一状态目录或端口。

完整安装流程见[安装与配对](installation.md)。开发者接口见[所有者接口](bridge-api.md)，能力边界见[当前状态](status.md)。
