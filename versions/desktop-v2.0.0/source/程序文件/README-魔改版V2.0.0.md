# FHL-Image-Studio 方汤圆CLI魔改版 V2.0.0

这是基于上游 `Image-Studio1.0.7` 重建的独立 Windows 魔改包，不再继续修旧的 `FHL-Image-Studio方汤圆魔改版1.0.0`。

完整交付、换电脑使用、Codex 接管说明见：

```text
AGENTS.md
Codex接管与初始化指南.md
桌面使用说明-交付版.md
```

## 核心功能

- 人工 UI 模式：双击 `一键启动FHL桌面版.cmd`，打开 `http://127.0.0.1:5173/` 使用浏览器 UI 生图。
- Codex CLI 模式：运行 `程序文件\image-cli.cmd`，让 Codex 直接从命令行生成图片。
- 默认 FHL Responses API：
  - BASE_URL: `https://www.fhl.mom`
  - API 形态: `responses`
  - 请求策略: `openai`
  - 文本模型: `gpt-5.5`
  - 图像模型: `gpt-image-2`
- 输入图固定放根目录 `input\`。
- UI/CLI 最终成品图固定放根目录 `output\`；中间图/partial 图固定放根目录 `intermediate\`。
- CLI raw 日志固定放 `output\log\`。

## 和原版的区别

- 顶栏品牌改为 `FHL-Image-Studio方汤圆CLI魔改版`。
- 顶栏增加 FHL QQ 群 `207550870` 和复制群号按钮。
- 顶栏增加“一键配置 FHL API”按钮；未配置时高亮闪烁，配置后停止闪烁。
- 新增 Codex 可调用的非交互 CLI：`程序文件\image-cli.cmd`。
- 新增 `AGENTS.md` 和 `Codex接管与初始化指南.md`，方便别的电脑上的 Codex 自动接管。
- 浏览器模式默认开启本地交互审计，自动记录点击、提交、错误和任务收尾事件，日志落在 `output\log\ui-audit\`。
- UI 中间预览图会被高斯模糊，并提示 `服务器信号图像已返回，等待最后结果...`。
- 保留上游 1.0.7 的基础比例逻辑，不迁移 1.0.0 里实验过的扩展比例限制。

## Windows 一键启动 UI

双击根目录：

```bat
一键启动FHL桌面版.cmd
```

启动后打开：

```text
http://127.0.0.1:5173/
```

这个启动器只启动 React/Vite UI，不启动 Wails 桌面壳。当前包已包含便携 Node 和 `node_modules` 时，目标电脑不需要安装 Node/npm。

## 配置 API

本机私有配置文件：

```text
程序文件\config\cli.env.local
程序文件\config\fhl-api.local.json
```

这两个文件只留在本机，不要提交、不要分享。发给别人时，优先让对方先运行 `一键启动FHL桌面版.cmd`，在 UI 里点击“一键配置 FHL API”，粘贴自己的 API Key，并测试 API 或成功生图一次。

UI 跑通后会自动同步 CLI 配置到 `程序文件\config\cli.env.local`，同步内容包括 FHL Base URL、Responses API、OpenAI 请求策略、`gpt-5.5 / gpt-image-2`、默认输出参数和本机私有 API Key。只有 UI 同步失败时，才需要手动复制 `程序文件\config\cli.env.example` 作为兜底。

## 浏览器模式交互审计

浏览器调试链路默认常开本地交互审计，专门用于排查“我刚刚点了什么，为什么后面报错了”这类问题。

文件位置：

```text
output\log\ui-audit\index.v1.json
output\log\ui-audit\session-<tabSessionId>.md
output\log\ui-audit\session-<tabSessionId>.jsonl
```

推荐排查顺序：

1. 先看 `index.v1.json` 找到最新会话
2. 再看对应 `session-*.md` 的会话摘要
3. 需要逐条还原点击和系统事件时，再看对应 `session-*.jsonl`

脱敏规则：

- 不记录 API Key
- 不记录 Authorization header
- 不记录 base64 图片内容
- 不记录完整外部绝对路径
- 只保留截断 prompt 预览、参考图 basename、路径类别

## Codex CLI 调用

文生图：

```bat
程序文件\image-cli.cmd --prompt "一个直播卖苹果的男孩" --size 1024x1024 --quality medium
```

图生图：

```bat
程序文件\image-cli.cmd --mode edit --image input\ref.png --prompt "改成赛博朋克风格"
```

CLI 成功时 stdout 只输出 JSON，最终图保存到 `output\`，中间图保存到 `intermediate\`，raw 响应保存到 `output\log\`。Codex 应读取 JSON 里的 `imagePath`，并把该图片用 Markdown 图片语法传回对话框预览，例如 `![生成图预览](I:/.../output/xxx.png)` 或 `![中间图预览](I:/.../intermediate/xxx.png)`。如果 `sourceEvent` 包含 `partial`，预览时必须标注这是中间图/非最终图。

换电脑后，推荐先让 Codex 读取：

```text
AGENTS.md
Codex接管与初始化指南.md
```

然后对 Codex 说：

```text
请检查这个 CLI 是否配置好，并跑一张 smoke test。不要让我把 API Key 发到聊天窗口。
```

如果是浏览器版报错，推荐直接再补一句：

```text
请顺便读取 output\log\ui-audit\ 里的最新交互摘要，一起分析问题。
```

## 当前已测比例

提示词 `卖苹果的小男孩` 已按顺序逐张测试通过：

| 比例 | CLI size | 结果 |
|---|---:|---|
| auto | `auto` | final |
| 1:1 | `1024x1024` | final |
| 3:2 | `1536x1024` | final |
| 2:3 | `1024x1536` | final |
| 16:9 | `1536x864` | final |
| 9:16 | `864x1536` | final |

## 分发给别人

建议保留这些内容：

- `一键启动FHL桌面版.cmd`
- `程序文件\image-cli.cmd`
- `runtime\node\node.exe`
- `程序文件\runtime\cli\gptcodex-image.exe`
- `image-studio\frontend\node_modules\`
- `image-studio\frontend\`
- `go-cli\`
- `shared\`
- `AGENTS.md`
- `Codex接管与初始化指南.md`
- `程序文件\config\cli.env.example`
- `README-魔改版V2.0.0.md`
- `桌面使用说明-交付版.md`

不要分享：

- `程序文件\config\cli.env.local`
- `程序文件\config\fhl-api.local.json`
- `image-studio\frontend\.local\`
- `output\log\`
- `intermediate\`
- 任何包含 API Key 的截图或日志


