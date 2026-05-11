# codex看板定制说明

这个目录是基于 `JUk1-GH/CodexScope` 的本地二次改造版本，当前产品名固定为 `codex看板`。

## 当前定制重点

- 默认本地服务地址：`http://127.0.0.1:4174/index.html`
- 本地服务每 60 秒刷新一次真实 Codex 用量数据。
- UI 已改成更贴近 macOS 的简洁看板风格，并支持系统浅色/深色模式。
- 保留原始数据读取逻辑，主要改造展示、交互和本地启动体验。

## 不要提交的本地文件

- `data.js`
- `.codexscope-cache.json`
- `.codexscope-server.log`
- `.codexscope-server.pid`
- `dist/`

这些文件要么包含本机隐私数据，要么是本地运行产物。
