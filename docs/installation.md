# 安装与连接

## 电脑端

需要已有 DSH 0.2.1-rc.2 和 DS Bot 团队。独立 Bridge 要求 DS Bot 提供 bridge.describe、稳定 bridge.submit 与已知值 bridge.redact；原版 npm DS Bot 0.1.7 缺少这些窄接口。发布页提供对应的 ds-bot-0.1.7-codex.1.tgz（保留上游许可证与桌面修复），供明确选择。Bridge 不会自动修改另一份 DS Bot 安装。

1. 备份现有 profile 配置并保留旧包。在任务空闲且没有排队输入时，通过 DSH 正式插件管理器安装匹配的 DS Bot 包；保留现有团队与数据目录。
2. 下载并核对同次 Release 的 ds-bot-mobile-bridge-0.0.6.tgz 与 SHA256SUMS，通过管理器安装和选择 Bridge bundle。
3. 按 bridge/cordis.patch.example.yml 配置 enabled、绝对且独立的 home、监听端口和已有 HTTPS publicUrl。默认 disabled，不自动配置证书、代理或域名信任。不要把 home 指向 DSH_HOME。
4. 确认已有 HTTPS 反向代理指向 Bridge 的 loopback 监听；仅设备可访问的私网入口即可，不需要公网公开。
5. 在电脑所有者认证的 /mobile-operator RPC 中创建并批准配对。支持 status、pairing.create、pairing.approve / pairing.deny（requestId）和 device.revoke（id）；请求格式见 bridge/README.md。

不要同时启用旧 file-entry 和标准 bundle。迁移时先停用旧入口、确认端口释放，再用相同 Bridge home 启用新包，现有设备授权得以保留。卸载/回退保留 Bridge home；不要清空团队或配对数据。

## 手机端

当前发布源码，尚无签名 IPA/APK。Node.js 24、npm 与对应平台工具链准备好后：

```sh
npm run setup
cd apps/mobile
npm run ios       # macOS + Xcode；真机需要自己的签名设置
# 或 npm run android
```

在 App 扫描电脑生成的配对资料，核对主机身份，并在电脑上批准。首次连接建议同一网络。真实设备需要正常可信的 HTTPS；不要绕过 TLS 验证。手机离线时可保留草稿，恢复后不会自动发送。

已有个人签名安装的 App 更新时，必须沿用原 bundle identifier、签名团队和 Keychain 权限，不能卸载清数据。可通过 DS_BOT_IOS_BUNDLE_ID 指定已有标识。公共源码默认 app.dsbot.mobile。

## 回退

先在管理器停用新 Bridge，确认监听释放，再恢复保留的旧包和配置。DS Bot 使用原团队数据，Bridge 使用原独立状态目录。Web 插件与 App Bridge 是不同包，互不要求安装；Web 项目见 README 链接。
