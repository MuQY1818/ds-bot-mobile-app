# 兼容范围与验证

目标：公开 DSH 0.2.1-rc.2、Expo 54、React Native 0.81.5、Node.js 24。App 当前为源码预览，不等同 App Store / Play Store 发行。

原开发工作区已通过 118 App 测试、28 SDK 测试、30 Bridge 单元测试、17 HTTP/WebSocket/SDK 场景和 11 打包生命周期断言。桌面兼容包通过 635 单元测试及 41 mock smoke 步骤。公开导出新增独立依赖、通用签名脚本和 CI，必须以本仓库实际检查结果为准。

| 能力 | 当前 Bridge |
| --- | --- |
| Bot / 群文字 history/send | 支持；隐藏群成员 Session 不作为独立目标 |
| 推送 | 完整消息提交事件，断线恢复后有界合并 |
| 模型与状态 | 模型、effort、pin/hide |
| 记忆 | own 查看/遗忘；team 编辑与摘要关闭 |
| Usage | 宿主真实九列记录与可见 owner 映射 |
| 日程 | 创建、查看、删除；不支持修改 |
| 排队 | user-only 查看/移除；不承诺宿主跨重启 pending 恢复 |
| 逐 token、原生审批、媒体/语音、APNs、群管理 | 不支持 |

电脑端部署曾确认 8 Bot、1 群和设备配对身份保留，正常重启、HTTPS 入口以及原生多面板/webview 正常；这是本地配置证据，不代表新用户安装或全套真机测试。当前用户手机未连接，不将 iPhone 键盘、锁屏、网络切换、通知和真机安装写成新通过结果。

DSH 的 pending inbox 重启恢复与 producer 授权仍有上游限制，不靠捕获全局按键、重发或修改核心掩盖。生产更新前应保持任务空闲并检查排队状态。
