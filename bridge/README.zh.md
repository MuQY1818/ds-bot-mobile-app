# DS Bot Mobile Bridge

DS Bot Mobile App 的独立 DSH 桥接插件，版本 0.0.6。通过电脑所有者批准配对，让手机复用现有 Bot 团队。

通过正式插件管理器安装压缩包。默认不监听、不创建状态；需明确配置 enabled、独立绝对 home、loopback 端口和已有 HTTPS publicUrl。参考 cordis.patch.example.yml。不创建隧道、不放宽认证、不自动修改 DSH 或 DS Bot。

DS Bot 需提供 bridge.describe、稳定 bridge.submit 和已知值 bridge.redact；原版 npm DS Bot 0.1.7 不满足可靠聊天要求。主仓库发布单独标识的兼容包，需明确选择安装。

所有者通过宿主认证的 /mobile-operator 使用 status、pairing.create、pairing.approve / pairing.deny（requestId）和 device.revoke（id）。请求 envelope 见 English README。不要记录或公开配对码、设备 token、真实二维码。

支持 Bot/群文字历史、完整消息提交事件、稳定回执、模型/effort、标记、Usage、own 记忆、日程创建/查看/删除及 user 排队查看/移除。逐 token、原生审批、媒体/语音、APNs 和群管理未提供。以主仓库的能力矩阵为准。

测试先运行 npm ci --ignore-scripts、npm run test:prepare，再运行 npm test、npm run lint 和 npm run test:integration。fixture 只用公开固定版本、mock、动态端口和隔离 HOME/DSH_HOME。test:delivery 校验指定 tgz 的每个文件与真实所有者启停生命周期。

停用释放监听和路由，保留 Bridge home 以保留配对与回执。迁移必须先释放旧 file-entry，再同端口启用标准包。来源及许可证见 LICENSE/NOTICE。
