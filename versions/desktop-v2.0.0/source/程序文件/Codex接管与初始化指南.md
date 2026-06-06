# Codex 接管与初始化指南

这份文档专门写给“另一台电脑上的 Codex”读取。目标是：客户把整个 `FHL-Image-Studio方汤圆CLI魔改版V2.0.0` 文件夹交给 Codex 后，Codex 能一步一步教用户完成 CLI 配置、测试、文生图和图生图。

## 你要先告诉用户什么

第一次接管时，先告诉用户：

```text
我会使用这个文件夹里的本地 程序文件\image-cli.cmd 生图，不会优先使用 Codex 内置 imagegen。请不要把 API Key 发到聊天窗口里；请先在桌面 UI 里配置并跑通 FHL API，UI 会把 CLI 需要的配置自动同步到 程序文件\config\cli.env.local。
```

## 1. 确认当前目录是包根目录

运行：

```bat
dir 程序文件\image-cli.cmd
```

如果看不到 `程序文件\image-cli.cmd`，停止后告诉用户：

```text
当前目录不是 FHL Image Studio 包根目录。请在 Codex 里打开 FHL-Image-Studio方汤圆CLI魔改版V2.0.0 文件夹本身，然后再让我接管。
```

继续检查：

```bat
dir 程序文件\runtime\cli\gptcodex-image.exe
dir 程序文件\config\cli.env.example
dir input
dir output
```

如果 `程序文件\runtime\cli\gptcodex-image.exe` 不存在，告诉用户这个包不完整，需要重新复制完整交付包。

## 2. 先用桌面 UI 配置并同步 CLI

第一次使用时，不要让用户手动把 API Key 发到聊天窗口，也不要优先要求用户编辑 `cli.env.local`。先指导用户启动 UI：

```bat
cmd /c 一键启动FHL桌面版.cmd
```

让用户在浏览器 UI 里完成：

1. 点击“一键配置 FHL API”
2. 粘贴自己的 API Key
3. 点击测试 API，或成功跑一次 UI 生图

UI 跑通后会自动生成或更新：

```text
程序文件\config\cli.env.local
```

这个文件会同步完整 FHL CLI 配置：

```env
IMAGE_STUDIO_API_KEY=
IMAGE_STUDIO_UPSTREAM_BASE_URL=https://www.fhl.mom
IMAGE_STUDIO_API_MODE=responses
IMAGE_STUDIO_REQUEST_POLICY=openai
IMAGE_STUDIO_TEXT_MODEL=gpt-5.5
IMAGE_STUDIO_IMAGE_MODEL=gpt-image-2
IMAGE_STUDIO_OUTPUT_FORMAT=png
IMAGE_STUDIO_QUALITY=medium
IMAGE_STUDIO_SIZE=1024x1024
IMAGE_STUDIO_PARTIAL_IMAGES=1
IMAGE_STUDIO_INPUT_DIR=.\input
IMAGE_STUDIO_OUTPUT_DIR=.\output
IMAGE_STUDIO_RAW_DIR=.\output\log
```

运行下面命令只检查文件是否存在，不要读取或展示里面的 API Key：

```bat
dir 程序文件\config\cli.env.local
```

如果文件不存在，说明 UI 还没有同步成功。请让用户回到 UI，再测试 API 或成功生图一次。手动复制 `程序文件\config\cli.env.example` 只作为同步失败时的兜底。

重要规则：

- 不要让用户把 `sk-...` 发到聊天窗口。
- 不要把 `程序文件\config\cli.env.local` 复制给别人。
- 不要在回答里展示真实 Key。

## 3. 运行 CLI Smoke Test

配置完成后运行：

```bat
cmd /c 程序文件\image-cli.cmd --prompt "red apple on white background" --size 1024x1024 --quality medium
```

等待 CLI 输出最终 JSON。

成功示例：

```json
{"ok":true,"imagePath":"...\\output\\gptcodex-generate-xxx.png","rawPath":"...\\output\\log\\sse-response-xxx.txt","mode":"generate","apiMode":"responses","size":"1024x1024","quality":"medium","outputFormat":"png","sourceEvent":"final","elapsedSec":98.9}
```

成功后告诉用户：

```text
CLI 已激活成功。以后你可以直接让我用这个工具生成图片，生成结果会保存在 output 文件夹里。
```

同时把 `imagePath` 给用户，并把这张图片传回 Codex 对话框预览。

### 回传预览规则

CLI 成功后，Codex 不能只告诉用户文件路径。必须读取 stdout JSON 里的 `imagePath`，确认它指向本地图片后，用 Markdown 图片语法把图片发回对话框：

```md
![生成图预览](I:/绝对路径/output/gptcodex-generate-xxx.png)
```

如果 `sourceEvent` 是 `final`，说明这是最终成品图。如果 `sourceEvent` 是 `partial`，也可以回传预览，但必须在文字里明确写清楚：这是中间图/非最终图，只能临时参考。

## 4. 解释 CLI JSON

Codex 必须按 JSON 字段判断结果：

| 字段 | 含义 |
|---|---|
| `ok` | 是否成功 |
| `imagePath` | 生成图片路径 |
| `rawPath` | 上游 raw 日志路径 |
| `size` | 请求尺寸 |
| `quality` | 请求质量 |
| `sourceEvent` | 图片来源事件 |
| `elapsedSec` | 耗时 |

补充规则：如果 `sourceEvent` 包含 `partial`，`imagePath` 应指向 `intermediate\`；最终成品图才放在 `output\`。

`sourceEvent` 规则：

- `final`：最终成品图，可以交付。
- `partial`：中间图，只能临时参考，不要当最终成品。

## 5. 文生图怎么教用户说

用户可以这样对 Codex 说：

```text
用本地 FHL Image Studio CLI 生成一张图：卖苹果的小男孩，9:16 竖图，中等质量。
```

Codex 应运行：

```bat
cmd /c 程序文件\image-cli.cmd --prompt "卖苹果的小男孩" --size 864x1536 --quality medium
```

常用尺寸：

| 比例 | size |
|---|---:|
| auto | `auto` |
| 1:1 | `1024x1024` |
| 3:2 | `1536x1024` |
| 2:3 | `1024x1536` |
| 16:9 | `1536x864` |
| 9:16 | `864x1536` |

## 6. 图生图怎么教用户做

先让用户把参考图复制到：

```text
input\
```

例如：

```text
input\ref.png
```

然后运行：

```bat
cmd /c 程序文件\image-cli.cmd --mode edit --image input\ref.png --prompt "保持主体结构，改成高级商业摄影风格"
```

如果用户有多张参考图，可以重复 `--image`，但仍然只发起一次 CLI 请求：

```bat
cmd /c 程序文件\image-cli.cmd --mode edit --image input\ref1.png --image input\ref2.png --prompt "融合参考图风格，生成一张商业海报"
```

## 7. 批量任务怎么做

如果用户要多张图、多个比例或多个 prompt：

- 必须一张一张顺序运行。
- 不要并发开多个 `程序文件\image-cli.cmd`。
- 每次等 JSON 返回后，再启动下一次。
- 每次把 `imagePath` 记录给用户，并把对应图片传回 Codex 对话框预览。

全比例测试顺序：

```text
auto
1024x1024
1536x1024
1024x1536
1536x864
864x1536
```

示例：

```bat
cmd /c 程序文件\image-cli.cmd --prompt "卖苹果的小男孩" --size auto --quality medium
cmd /c 程序文件\image-cli.cmd --prompt "卖苹果的小男孩" --size 1024x1024 --quality medium
cmd /c 程序文件\image-cli.cmd --prompt "卖苹果的小男孩" --size 1536x1024 --quality medium
cmd /c 程序文件\image-cli.cmd --prompt "卖苹果的小男孩" --size 1024x1536 --quality medium
cmd /c 程序文件\image-cli.cmd --prompt "卖苹果的小男孩" --size 1536x864 --quality medium
cmd /c 程序文件\image-cli.cmd --prompt "卖苹果的小男孩" --size 864x1536 --quality medium
```

注意：上面是顺序示例，不要一次性并发执行。

## 8. 常见错误处理

### 当前目录不对

表现：

```text
找不到 程序文件\image-cli.cmd
```

处理：

```text
请用 Codex 打开 FHL-Image-Studio方汤圆CLI魔改版V2.0.0 的包根目录。
```

### CLI 运行文件缺失

表现：

```text
Missing 程序文件\runtime\cli\gptcodex-image.exe
```

处理：

```text
这个包复制不完整。请重新复制完整交付包，确保 程序文件\runtime\cli\gptcodex-image.exe 存在。
```

### API Key 缺失

表现：

```text
api key must not be empty
```

处理：

```bat
copy 程序文件\config\cli.env.example 程序文件\config\cli.env.local
notepad 程序文件\config\cli.env.local
```

让用户自己填 `IMAGE_STUDIO_API_KEY`。

### 上游错误

表现：

```text
server_error
api_error
502
524
timeout
```

处理：

- 先重试同一个命令一次。
- 仍失败时，换简单 prompt 测试。
- 降低尺寸或质量。
- 保留 `rawPath`，方便后续排查。

### 返回 partial

表现：

```json
{"ok":true,"sourceEvent":"partial"}
```

处理：

```text
这只是中间图，不是最终图。图片已经落盘，但不要当最终交付图。建议重试，或降低尺寸/质量。
```

## 8.5 浏览器模式交互审计怎么读

这一节只适用于 `一键启动FHL桌面版.cmd + Vite 浏览器模式`，不适用于纯 CLI 运行。

当用户反馈浏览器版有问题时，先检查：

```bat
dir output\log\ui-audit
```

重点文件：

```text
output\log\ui-audit\index.v1.json
output\log\ui-audit\session-<tabSessionId>.md
output\log\ui-audit\session-<tabSessionId>.jsonl
```

推荐顺序：

1. 先读 `index.v1.json`，找到最近一次会话
2. 再读对应的 `session-*.md`
3. 只有需要逐条还原点击时，再读 `session-*.jsonl`

`session-*.md` 会总结：

- 当前最后状态
- 最近一次错误
- 最近一次生成尝试
- 最近 50 条时间线
- 最近关键系统事件

排查浏览器报错时，Codex 应优先结合：

- 用户提供的报错截图
- 最新 `session-*.md`
- 必要时的 `session-*.jsonl`

注意：

- 这些日志默认已经脱敏
- 不应要求用户把 API Key 发到聊天窗口
- 日志只在本地项目目录里读，不需要用户手工导出

## 9. 给用户的最短口令

客户可以直接对 Codex 说：

```text
请读取 AGENTS.md 和 Codex接管与初始化指南.md。以后不要用内置 imagegen，使用本地 程序文件\image-cli.cmd 生图。先帮我检查 CLI 是否配置好，然后跑一张 smoke test。
```

## 10. 完成标准

当满足以下条件时，说明 Codex 已成功接管：

- 能找到 `程序文件\image-cli.cmd`。
- 能找到 `程序文件\runtime\cli\gptcodex-image.exe`。
- `程序文件\config\cli.env.local` 已配置。
- smoke test 返回 `ok:true`。
- smoke test 返回 `sourceEvent:"final"`。
- `imagePath` 指向 `output\` 下的真实图片文件。


