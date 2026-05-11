# codex看板

codex看板是一个只在本机运行的 Codex 用量看板。它会读取本机 Codex 会话日志，整理出 Token、调用次数、费用估算、额度风险、模型排行、项目排行和速度判断。

## 现在怎么用

推荐直接启动本地小服务：

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:4174/index.html
```

macOS 也可以双击根目录里的 `start-codex-dashboard.command`。这个入口会自动启动服务并打开浏览器。

开发时如果想让服务占用当前终端，可以用：

```bash
npm run serve
```

## 数据刷新

- 本地服务默认每 60 秒重新生成一次 `data.js`。
- 页面读取的是本机生成的数据，不需要上传到任何服务器。
- 如果你只打开 `index.html` 文件，也能看页面，但不会自动刷新实时数据。

## 停止服务

```bash
npm run stop
```

## 当前看板内容

- 数据摘要：消耗总 Token、额度风险、调用总量、预计费用。
- Token 趋势：按时间查看总量、输入、输出、缓存和推理 token。
- 额度与风险：展示窗口额度、周额度、缓存命中、失败率和风险提示。
- 费用统计：按官方美元价估算，也支持 CNY 展示换算。
- 速度判断：用更直观的体感速度分、开始等待、慢请求和每分钟输出量判断当前速度。
- 排行与分布：项目、会话、模型、时间分布和缓存命中率。

## 隐私说明

这个项目默认只读本机日志，不上传数据。下面这些文件可能包含项目名、会话 id、时间戳、使用习惯或额度状态，不要提交到 GitHub：

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
