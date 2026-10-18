# DS Bot Mobile Bridge：配置与所有者接口

DS Bot Mobile Bridge 是标准 DSH bundle，为原生客户端提供设备配对与受限的团队访问。当前发布包为 `0.0.6`。包内英文说明见 [bridge/README.md](../bridge/README.md)，完整安装顺序见[安装指南](installation.md)。

## 配置

通过 DSH 插件管理器安装同次 Release 的 Bridge 包。选择 bundle 后，按 [cordis.patch.example.yml](../bridge/cordis.patch.example.yml)配置以下项目：

| 配置 | 用途 |
| --- | --- |
| `enabled` | 显式启用服务；默认等待配置 |
| `home` | 独立的绝对状态目录，与 `DSH_HOME` 分开 |
| `host` / `port` | loopback 监听；反向代理使用固定可用端口，或读取状态中的分配端口 |
| `publicUrl` | 你已经配置好的 HTTPS 入口 |
| `allowedOrigins` | 需要允许的浏览器来源 |
| `certPath` / `keyPath` | 可选的直接 TLS 证书与私钥路径 |

Bridge 复用既有 DS Bot。所需的 `bridge.describe`、稳定 `bridge.submit` 与 `bridge.redact` 接口必须存在；原版 npm DS Bot `0.1.7` 缺少这些接口。请明确选择本项目发布的兼容包。

## 所有者操作

电脑上的已认证所有者通过 DSH 的 `/mobile-operator` 通道管理设备。这是**宿主地址**上的 RPC；手机的 HTTPS Bridge 入口使用另一套协议。

请求使用 `POST /mobile-operator/<method>`，`method` 与请求体中的字段保持一致：

```json
{
  "type": "client-request",
  "rpcId": "unique-request-id",
  "method": "status",
  "payload": {}
}
```

| method | payload | 用途 |
| --- | --- | --- |
| `status` | `{}` | 查看配置、监听和设备状态 |
| `pairing.create` | `{}` | 生成配对资料 |
| `pairing.approve` | `{"requestId":"…"}` | 批准手机申请 |
| `pairing.deny` | `{"requestId":"…"}` | 拒绝申请 |
| `device.revoke` | `{"id":"…"}` | 撤销设备授权 |

使用宿主现有的所有者认证会话；普通远程请求不能因此取得管理权限。配对资料、请求结果和设备凭据应只在本机受信任界面中处理。

## Owner operations

The authenticated computer owner manages devices through the host's `/mobile-operator` RPC channel. This is the **DSH host endpoint**, separate from the mobile Bridge origin.

Send `POST /mobile-operator/<method>` using the JSON envelope above. The path and body `method` must match; each request uses a unique `rpcId`. Supported methods and payloads are listed in the table. Use the existing owner-authenticated host session; keep pairing results and device credentials private.

## 能力与生命周期

当前支持文字历史与完整消息提交事件、稳定回执及能力矩阵中列出的宿主操作。支持范围以[兼容与验证](validation.md)为准。

停用 bundle 会释放监听与路由。保留 Bridge home 可继续保留配对和回执。迁移旧 file-entry 时，先停用旧入口并确认端口释放，再用同一 home 启用标准包。
