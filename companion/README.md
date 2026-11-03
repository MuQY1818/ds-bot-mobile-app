# DS Bot Mobile App plugin

电脑端插件，当前版本 **0.3.0**。它负责原生 App 连接电脑上 DS Bot 的全部工作：设备配对与授权、HTTP/WS 文字传输，以及 **手机访问 → App** 里的二维码和设备管理界面。只用手机浏览器时请安装 [Mobile Web](https://github.com/MuQY1818/ds-bot-mobile-web)，不需要本插件。

从 0.3.0 起，原来单独发布的 `ds-bot-mobile-bridge` 已并入本插件，不再单独安装。

## 要求

- DeepSeek Harness 0.2.1-rc.5 或更新。
- 官方 npm DS Bot 0.2.6 或更新，**无需任何补丁**。本插件只调用 DS Bot 公开的 `state` 接口，用宿主公开的 `sessionController` 投递消息，并用 DS Bot 自己的已知值脱敏规则（读取 `dsBotHome/secrets.json`）处理文字。

## 安装与配置

1. 在 DSH 官方插件管理器安装 `ds-bot-mobile-app-0.3.0.tgz` 并启用。默认不监听、不创建任何状态。
2. 按 [`cordis.patch.example.yml`](cordis.patch.example.yml) 在 profile 的 `cordis.patch.yml` 里给 `ds-bot-mobile-app` 设置：`enabled: true`、专用绝对路径 `home`（不能等于 `DSH_HOME`）、监听 `host`/`port`、手机可访问的 HTTPS `publicUrl`。可选 `dsBotHome`，默认 `DSH_HOME/bot`（或 `~/.dsh/bot`）。
3. 打开 **手机访问 → App**，生成二维码，用 App 扫码后在电脑上批准。

要断开某台手机，在设备列表里撤销并确认。未使用的配对码两分钟后失效。

## 从 Bridge 0.0.x + App 0.2.0 迁移

1. 先在插件管理器里停用 `ds-bot-mobile-bridge`。
2. 把 profile `cordis.patch.yml` 里 `- id: ds-bot-mobile-bridge` 下的 `config`（enabled、host、port、home、publicUrl、allowedOrigins、certPath/keyPath、devAllowInsecure、name）原样移到 `- id: ds-bot-mobile-app` 下。
3. **`home` 保持原路径**：已配对的设备和发送回执都在里面，App 不用重新扫码。
4. 安装 0.3.0、启用，然后卸载 `ds-bot-mobile-bridge`。

旧 Bridge 与新插件不能同时启用同一个端口或同一个 `home`：两边会争用监听端口，并同时写同一份授权文件。

## 能力

Bot / 群文字历史、完整消息、稳定回执（手机的请求 ID 原样写入聊天记录），以及模型/推理档位选择、用量、记忆、日程、用户队列。逐 token 输出、原生审批、媒体/语音、系统推送和群管理暂不提供。

已知限制：DS Bot 在发送前会为 Bot 准备已连接的能力；本插件直接投递消息，若 Bot 的连接能力刚改过，新配置会在下一次从电脑端给它发消息或它新建会话时挂载。

## 停用与卸载

停用会关闭监听和路由，`home` 里的授权和回执原样保留；重新启用后同一台手机直接可用。卸载也不会删除 `home`。

开发与隔离测试见 [development guide](https://github.com/MuQY1818/ds-bot-mobile-app/blob/main/docs/development.md)。Apache-2.0；来源与第三方声明见 LICENSE / NOTICE。

---

**English.** Desktop plugin for the native App: pairing, device authorization, HTTP/WS text transport, and the **Phone access → App** UI. Since 0.3.0 the former `ds-bot-mobile-bridge` package is merged here. Requires DSH 0.2.1-rc.5+ and pristine npm DS Bot 0.2.6+ (no patch). To migrate, disable the old bridge, move its `cordis.patch.yml` config row from `ds-bot-mobile-bridge` to `ds-bot-mobile-app` keeping the same `home`, then enable 0.3.0 and remove the old bundle. Paired devices keep working without re-pairing.
