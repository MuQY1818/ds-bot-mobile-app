# Bridge 所有者接口（开发者）

普通用户通过“手机访问 → App”管理设备，无需手动调用接口。配置指南见[Bridge 配置](bridge.md)。

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
