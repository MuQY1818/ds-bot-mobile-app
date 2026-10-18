# 来源与版本

- 上游 App / SDK：QingJ01/DS-Bot-App，Apache-2.0，基线 253407cf76062b2aa60bc5d039415aaa1c9867c4。
- 本地原生导航/交互：a7b24fd 与 ba79049；Bridge 收束：438b1f055c5d8bb107e09051c146b0fbe199c737。
- DS Bot 原始角色与精灵算法：Fei2411/DeepSeek-Bot v0.1.7，939a6635830cb5b246e7dd19c67b0e1352ad1c07，Apache-2.0。
- 桌面兼容包：v0.1.7 + 保留安装定制的 98a6091 + 面板修复 7ef17ad4db96e4142b23dfb5fee9df705c350b98。
- 电脑端 App 配套插件：本仓库 `companion/` 的独立实现，使用 DSH 公开 bundle / UI slot / owner carrier；QR 编码器来自 `qrcode@1.5.4`，其 MIT 许可及 `dijkstrajs` 声明保留在包内 `NOTICE`。浏览器渲染不依赖远端二维码服务。

本仓库以审查后的源码快照建立独立历史，原始开发仓库及其未提交材料在本机保留。初始公开快照未复制原开发工作区的运行态、签名或原始截图；后续文档截图单独审阅并脱敏。没有声称此前的上游功能全部被当前独立 Bridge 支持。
