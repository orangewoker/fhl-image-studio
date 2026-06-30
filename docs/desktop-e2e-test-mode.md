# 桌面 E2E 测试模式

桌面版 `V2.0.2.1` 新增测试模式，用来让 Codex 浏览器或普通浏览器自动化工具接管打包后的核心 UI 流程，减少每次封装后纯人工点测。

## 启动方式

从包根运行：

```cmd
scripts\start-desktop-e2e.cmd
```

或直接运行打包后的 EXE：

```cmd
"image-studio\build\bin\FHL Studio 方汤圆版 V2.0.2.1.exe" --e2e --e2e-port 9230
```

只启动浏览器镜像，不打开桌面窗口：

```cmd
"image-studio\build\bin\FHL Studio 方汤圆版 V2.0.2.1.exe" --e2e-only --e2e-port 9230
```

然后在 Codex 浏览器或普通浏览器打开：

```text
http://127.0.0.1:9230/
```

## 自动化入口

测试模式页面会暴露：

```js
window.__imageStudioE2E
```

常用方法：

```js
window.__imageStudioE2E.getStateSummary()
window.__imageStudioE2E.waitForIdle()
window.__imageStudioE2E.setPrompt("test prompt")
window.__imageStudioE2E.setSize("1024x1024")
window.__imageStudioE2E.openSettings()
window.__imageStudioE2E.openResultGrid()
```

`getStateSummary()` 只返回状态摘要，不返回完整图片 base64 或 API Key。

## Codex 浏览器兼容通道

如果浏览器自动化上下文读不到页面内的 `window.__imageStudioE2E`，可以检查 DOM 标记：

```js
document.documentElement.dataset.e2e
document.documentElement.dataset.e2eHarness
document.documentElement.dataset.e2eCommandBridge
document.querySelector('meta[name="image-studio-e2e-status"]')?.content
```

也可以通过 `postMessage` 命令通道调用同一套安全命令：

```js
function callImageStudioE2E(command, args = []) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const onMessage = (event) => {
      const data = event.data || {};
      if (data.source !== "image-studio-e2e" || data.direction !== "response" || data.id !== id) return;
      window.removeEventListener("message", onMessage);
      data.ok ? resolve(data.result) : reject(new Error(data.error || "E2E command failed"));
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "image-studio-e2e", direction: "request", id, command, args }, window.location.origin);
  });
}

await callImageStudioE2E("getStateSummary");
await callImageStudioE2E("setPrompt", ["测试提示词"]);
await callImageStudioE2E("setSize", ["1024x1024"]);
```

## 能测试什么

- 打包后的前端资源是否能正常加载。
- 关键 UI 是否能在 Codex 浏览器里点击、输入、截图。
- 参考图、导入图、媒体注册、读图路径是否能通过打包后的 Go 后端桥接。
- 画布当前图、批次预览、错误信息、弹窗状态是否符合预期。

## 注意

- E2E 镜像只监听 `127.0.0.1`，普通用户不加 `--e2e` 不会开启。
- 镜像桥接不会暴露 API Key，也不会把 `Generate/Edit` 作为本地 Wails 任务桥进去；生图自动化仍建议走远程 browser job 或专门的 mock upstream。
- 发布前建议至少跑一次参考图双击预览、比例选择、API 配置弹窗、360 工作台入口的浏览器自动化 smoke test。
