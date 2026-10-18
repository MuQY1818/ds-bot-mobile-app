# 开发与检查

使用 Node.js 24 与 npm，原生构建额外需要 Xcode 或 Android SDK。仓库不包含签名、真实聊天、设备身份或运行态数据。

```sh
npm run setup
npm --prefix bridge run test:prepare
npm run check
npm --prefix bridge run test:integration
npm run audit
npm run pack:bridge
npm --prefix bridge run test:delivery -- ../artifacts/ds-bot-mobile-bridge-0.0.6.tgz
```

最后一条路径相对于 bridge/。test:prepare 从公开 npm 下载固定 DSH 0.2.1-rc.2 和 DS Bot 0.1.7，只给 ignored fixture 内的副本应用审查补丁；保留原版拒绝测试。不接触用户 profile。动态端口与 HOME/DSH_HOME 相互隔离，测试结束清理子进程。

BRIDGE_TEST_BOT 可指定另一份已经审查的 DS Bot 源码，BRIDGE_TEST_DEPS 可复用公开测试依赖目录。生产验证与 fixture 分开记录，不能把 mock 通过视作真机验收。

App 测试自带 esbuild，不依赖另一个 DS Bot 仓库的 node_modules。Android 签名脚本只接受你自己提供的 ANDROID_KEYSTORE_PATH、ANDROID_KEY_ALIAS、ANDROID_KEYSTORE_PASSWORD 和 ANDROID_SIGNING_CERT_SHA256。不含任何签名密钥或证书。

npm run pack:bridge 要求干净 Git 工作树，按明确文件白名单打包，生成源码 commit、SHA256SUMS 和 release 元数据。每次版本修改必须更新 bridge/package.json 与 lock，保留旧 tag/制品。
