# codex看板

codex看板是一个只在本机运行的 Codex 用量看板。它会读取本机 Codex 会话日志，整理出 Token、调用次数、费用估算、额度风险、模型排行、项目排行和速度判断。

## 启动

```bash
npm start
```

打开：

```text
http://127.0.0.1:4174/index.html
```

macOS 也可以双击根目录的 `start-codex-dashboard.command`，它会自动启动本地服务并打开浏览器。

开发时如果想让服务占用当前终端，可以用：

```bash
npm run serve
```

## Release 包使用

如果你下载的是 GitHub Releases 里的 `codex-dashboard-mac.zip`：

1. 解压 zip。
2. 双击 `Open codex看板.command`。
3. 如果 macOS 拦截，打开「系统设置 > 隐私与安全性」，点击「仍要打开」。
4. 浏览器会打开 `http://127.0.0.1:4174/index.html`。

Release 包同样会启动本地服务，并每 60 秒刷新一次数据。当前 Release 包需要本机已经安装 Node.js 18 或更高版本。

## 刷新机制

- 本地服务每 60 秒重新生成一次 `data.js`。
- 页面读取本机生成的数据，不上传服务器。
- 直接打开 `index.html` 文件可以看静态页面，但不会自动刷新实时数据。

## 停止

```bash
npm run stop
```

## 看板模块

- 数据摘要：消耗总 Token、额度风险、调用总量、预计费用。
- Token 趋势：总量、输入、输出、缓存和推理 token。
- 额度与风险：窗口额度、周额度、缓存命中、失败率和风险提示。
- 费用统计：按官方美元价估算，支持 CNY 展示换算。
- 速度判断：体感速度分、开始等待、慢请求和每分钟输出量。
- 排行与分布：项目、会话、模型、时间分布和缓存命中率。

## 隐私

以下文件可能包含项目名、会话 id、时间戳、使用习惯或额度状态，不要提交到 GitHub：

- `data.js`
- `.codexscope-cache.json`
- `.codexscope-server.log`

它们已经写进 `.gitignore`。

## 开发命令

```bash
npm run build:frontend
npm run generate
npm run verify
```

## 来源

本项目基于 `JUk1-GH/CodexScope` 做本地二次改造，当前版本已经定制为 `codex看板`。
