# 开发与检查

使用 Node.js 24 与 npm，原生构建额外需要 Xcode 或 Android SDK。仓库不包含签名、真实聊天、设备身份或运行态数据。

```sh
npm run setup
npm --prefix companion run test:prepare
npm run check
npm --prefix companion run test:integration
npm run audit
npm run pack:companion
npm --prefix companion run test:delivery -- ../artifacts/ds-bot-mobile-app-0.3.0.tgz
```

`test:delivery` 中的 `../artifacts/` 路径相对于 `companion/`。`test:prepare` 从公开 npm 下载固定 DSH 0.2.1-rc.5 和官方 DS Bot 0.2.6（不打补丁）到 ignored 的 `companion/fixture-server/`，不接触用户 profile。动态端口与 HOME/DSH_HOME 相互隔离，测试结束清理子进程。

BRIDGE_TEST_BOT 可指定另一份 DS Bot 源码，BRIDGE_TEST_DEPS 可复用公开测试依赖目录。生产验证与 fixture 分开记录，不能把 mock 通过视作真机验收。

App 测试自带 esbuild，不依赖另一个 DS Bot 仓库的 node_modules。Android 签名脚本只接受你自己提供的 ANDROID_KEYSTORE_PATH、ANDROID_KEY_ALIAS、ANDROID_KEYSTORE_PASSWORD 和 ANDROID_SIGNING_CERT_SHA256。不含任何签名密钥或证书。

## App 电脑端插件

`companion/` 是电脑端 App 插件（0.3.0 起包含原 Mobile Bridge）。`server/` 为认证与传输服务端，`test-server/` 为其单元与集成测试；`src/` 为界面源码，`client.js` 为提交并随包交付的构建产物。修改后运行 `npm --prefix companion run check && npm --prefix companion run lint` 和 `npm --prefix companion run build`；CI 会再次构建并检查 `client.js` 没有漂移。

`npm run pack:companion` 同样要求干净工作树，按白名单输出插件安装包，并记录对应源码提交。

`test:delivery` 在独立 `HOME` / `DSH_HOME` 中安装固定公开 DSH、官方 DS Bot 0.2.6 和本地 `.tgz`。测试使用固定 `pnpm@10.12.1`，通过真实 owner carrier 调用官方插件管理器安装、启停与移除 App 插件，验证停用后监听关闭、重新启用后同一身份与已配对设备无需重新配对、卸载后授权状态保留；结束后清理本轮子进程。所有凭据与诊断仅留在 ignored `companion/fixture/`，不会进入包。

需要手动检查配对界面时运行 `npm run preview:companion`。该命令是明确的持久预览：启动独立 mock 宿主，并把仅供当前测试的登录地址写入权限 `0600` 的 `companion/fixture/ready.json`。使用 `Ctrl+C` 停止，宿主和 mock 服务一起清理；导入 `companion/test/fixture.mjs` 不会自动启动进程。不要将预览登录资料、二维码或测试状态加入 Git。
