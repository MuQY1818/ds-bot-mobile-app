# 安装与连接

本指南面向已有 DSH / DS Bot 自托管环境。电脑端 App 配套插件和 Bridge 使用标准 DSH bundle 分别安装；手机 App 仍需要自行构建。三个插件的边界见[插件职责](plugins.md)。

## 1. 检查兼容性与下载文件

需要 DSH `0.2.1-rc.2`、可正常运行的 DS Bot 团队，以及手机能够访问且证书可信的 HTTPS 入口。Bridge 要求 DS Bot 提供 `bridge.describe`、稳定的 `bridge.submit` 与已知值 `bridge.redact`；原版 npm DS Bot `0.1.7` 缺少这些接口。[发布页](https://github.com/MuQY1818/ds-bot-mobile-app/releases)保留明确标识的 `ds-bot-0.1.7-codex.1.tgz` 供选择，原始许可证和署名保留。Bridge 不会自动修改另一份 DS Bot 安装。

| 文件 | 用途 |
| --- | --- |
| `ds-bot-0.1.7-codex.1.tgz` | 兼容的 DS Bot 宿主包；已有满足接口的版本无需另换 |
| `ds-bot-mobile-bridge-0.0.6.tgz` | 设备认证与消息传输插件 |
| `ds-bot-mobile-app-0.1.1.tgz` | 电脑端 App 配对与设备管理插件 |
| `SHA256SUMS` / `COMPANION-SHA256SUMS` | 对应发布制品的校验值 |
| `companion-release.json` | 配套插件名称、版本、源码 commit 与 SHA256 |

下载后在文件所在目录核对对应校验文件，例如 macOS：

```sh
shasum -a 256 -c COMPANION-SHA256SUMS
```

Linux 可以使用 `sha256sum -c`。读取发布说明确认校验文件对应的附件；不要把手机配对资料当作校验或安装配置。

## 2. 安装电脑端插件

1. 备份当前 profile 配置，保留旧包和数据目录。等任务空闲，并确认没有排队输入，再更新宿主相关包。
2. 在 DSH 正式插件管理器中，选择需要使用的 profile。若当前 DS Bot 缺少兼容接口，先安装匹配的兼容包，沿用现有团队目录。
3. 分别安装 Bridge 和 App 配套 `.tgz`，启用两个 bundle。App 配套包名为 `ds-bot-mobile-app`，Bridge 包名为 `ds-bot-mobile-bridge`。
4. 插件管理器若要求重启，完成受控重启后再检查配置。不要同时启用旧的 file-entry 和新的标准 bundle。

安装并启用 App 配套插件后，打开 **设置 → 移动设备**，即可看到“连接你的手机”页面。官方主侧栏“插件 → 已安装 → ds-bot-mobile-app”的 bundle 配置区域也保留此页面。第三方市场可能只展示包列表，设置中的独立入口无需经过该市场。Bridge 未安装、未启用或仍待配置时，页面显示准备提示和安装指南。

## 3. 配置 Bridge 与 HTTPS

按 [Bridge 配置示例](../bridge/cordis.patch.example.yml)设置以下参数：

| 参数 | 要求 |
| --- | --- |
| `enabled` | 明确设为 `true`；默认等待所有者配置 |
| `home` | 绝对、专用且长期保留的目录；不能指向 `DSH_HOME` |
| `host` / `port` | 建议 loopback 监听，由已配置的代理提供 HTTPS |
| `publicUrl` | 手机可达、证书可信的 Bridge HTTPS 地址 |

确认 HTTPS 反向代理指向 Bridge 的监听端口。使用设备可访问的私网入口即可。插件不会自动创建隧道、证书、代理配置或域名信任。真实设备需要正常可信的 HTTPS；开发 fixture 的 HTTP 模式仅用于隔离测试。

回到 **设置 → 移动设备**，点击“重新检查”或“刷新设备状态”。状态应显示 **Bridge 已连接**。如果页面仍在等待配置，先核对当前 profile、Bridge 启用状态和插件日志。

## 4. 构建手机客户端

当前仓库提供源码，尚无签名 IPA/APK。准备 Node.js 24、npm，以及对应的平台工具链后：

```sh
git clone https://github.com/MuQY1818/ds-bot-mobile-app.git
cd ds-bot-mobile-app
npm run setup
npm --prefix apps/mobile run ios
# 或 npm --prefix apps/mobile run android
```

iOS 需要 macOS、Xcode 和自己的签名身份；Android 需要 Android SDK 与对应构建工具。项目含自定义原生模块，使用开发构建。详细说明见[原生客户端 README](../apps/mobile/README.md)。

已有个人签名安装的 App 更新时，沿用原 bundle identifier、签名团队和 Keychain 权限，保留安全存储。iOS 可以通过 `DS_BOT_IOS_BUNDLE_ID` 指定已有标识；公共源码默认 `app.dsbot.mobile`。不要通过卸载清数据解决升级问题。

## 5. 配对与授权

1. 在电脑 App 配套插件中点击“生成配对二维码”。二维码在当前页面显示，未使用的码两分钟后失效。
2. 用原生 App 扫描，核对主机身份。如果无法扫码，可展开“手动配对资料”，按客户端流程输入 JSON。
3. 在电脑的“待批准请求”中核对手机名称，再点击“批准连接”。仅扫码不会自动授予访问权。
4. 手机完成授权后，电脑显示该设备。打开已有会话验证连接；首次使用建议先确认手机和电脑网络互通。

二维码和 JSON 含短期配对凭据，只给自己的设备。隐藏二维码或离开页面会清理页面内资料，但已复制资料仍可在失效前提出请求；新码会替换以前未使用的码。Mobile Web 的浏览器登录二维码不用于原生 App 设备配对。

## 设备管理与回退

在“已授权设备”中选择“撤销访问”，确认后 Bridge 会撤销该设备的访问；手机需要重新配对。停用或移除 App 配套插件只移除管理界面，不会代替撤销设备，也不会停掉 Bridge。

迁移 Bridge 时，先停用旧入口并确认端口释放，再使用原 Bridge `home` 启用新 bundle。回退时同样先停用新 Bridge，确认监听释放，再恢复旧包和配置。保留现有团队目录与 Bridge 独立状态目录，正常重启后设备身份可沿用。

Web 插件不依赖 App 配套插件或 Bridge。仅使用手机浏览器时，按 [Mobile Web 的安装指南](https://github.com/MuQY1818/ds-bot-mobile-web)操作即可。

## 常见问题

| 现象 | 检查项 |
| --- | --- |
| 找不到配对管理页 | 确认安装并启用了 `ds-bot-mobile-app` 0.1.1 或更新版本，打开“设置 → 移动设备”；第三方市场和“内置插件 → 模块详情”不一定呈现 bundle 配置 |
| Bridge 未连接 / 等待配置 | 当前 profile 是否正确，Bridge 是否启用，`enabled`、独立 `home` 和 HTTPS 是否配置完整 |
| 提示电脑所有者认证 | 在正常登录的电脑宿主会话打开配置页，重新认证后刷新 |
| 扫码失败或配对超时 | 区分 Web 登录码和 App 配对码，生成新码，检查手机可达的 HTTPS 与证书 |
| 主机离线 | 保持电脑和 DSH 运行，确认手机连接对应私网；离线草稿不会自动发送 |
| localhost:8108 只有演示会话 | 这是开发设计预览，采用虚构数据；实际连接需原生 App 与已配置 Bridge |
