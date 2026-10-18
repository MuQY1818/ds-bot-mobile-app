# Contributing to DS Bot Mobile App

欢迎提交缺陷修复、文档改进与翻译。新功能请先通过 Issue 说明使用场景、预期行为与兼容要求。

## 开发流程

使用 Node.js 24、npm、Git 和 Python 3。创建独立分支，保持一次提交聚焦一件事，并使用英文祈使句作为提交标题。中英文 README 应同步更新。

```sh
npm run setup
npm --prefix bridge run test:prepare
npm run check
npm --prefix bridge run test:integration
npm run audit
```

详细步骤见[开发指南](docs/development.md)。运行时行为发生变化时，应补充能验证用户可见结果的检查，并说明尚未覆盖的平台。

## 宿主与数据边界

- 使用公开 DSH 插件接口，保留原始 LICENSE、NOTICE 与来源记录。
- 测试使用隔离目录和 mock 模型，不连接真实用户 profile。
- 提交前移除凭据、配对资料、签名、运行态和私人截图。
- 区分单元、隔离宿主、打包与真机证据；列明实际执行的检查。
- 发布包对应固定的源码提交与校验值；已发布标签及附件保持不变。

## 提交 Pull Request

以 `main` 为目标，说明问题、修改后的行为和验证结果。界面修改可附虚构数据截图；文档修改请检查相对链接、命令与版本。提交者同意其贡献采用仓库的 Apache-2.0 许可。

## 报告问题

请提供组件版本、操作系统、安装方式、复现步骤、预期结果和实际结果。公开材料应移除登录链接、二维码、设备凭据和私人会话。涉及凭据泄漏的问题，请勿将敏感值贴入公开 Issue。

## English

Use Node.js 24, npm, Git and Python 3. Work on a focused branch and keep both README languages aligned. Run the commands above, test against isolated mock hosts, and describe the checks you actually ran. Never commit runtime data, signing material, pairing credentials or private screenshots.

Open pull requests against `main`, with the problem, resulting behavior and validation. Discuss substantial features in an Issue first. Preserve upstream attribution and immutable published releases. Contributions use the repository's Apache-2.0 license.
