# Codex 接管规则

你正在 `FHL-Image-Studio方汤圆CLI魔改版 V2.0.0` 包根目录中工作。根目录是小白友好区，内部程序在 `程序文件\`。这个包提供一个本地 CLI 生图工具，目标是让 Codex 通过 `程序文件\image-cli.cmd` 调用 FHL Responses API 生成图片。

## 优先规则

- 优先使用本地 `程序文件\image-cli.cmd` 生图，不要优先使用 Codex 内置 `imagegen`。
- 运行 CLI 时使用 Windows 命令：
  ```bat
  cmd /c 程序文件\image-cli.cmd --prompt "提示词" --size 1024x1024 --quality medium
  ```
- 生成图输入文件放在 `input\`。
- 最终成品图读取 `output\`；中间图读取 `intermediate\`。
- CLI raw 日志在 `output\log\`。
- CLI 成功后只以 stdout JSON 为准，重点读取 `imagePath`、`sourceEvent`、`rawPath`。
- 每次生成成功后，必须把 `imagePath` 指向的图片传回 Codex 对话框预览，使用 Markdown 图片语法和本地绝对路径，例如：`![生成图预览](I:/.../output/xxx.png)` 或 `![中间图预览](I:/.../intermediate/xxx.png)`。
- `sourceEvent:"final"` 才是最终成品图。
- `sourceEvent:"partial"` 或其他包含 `partial` 的来源只是中间图，只能临时参考；它应保存在 `intermediate\`，可以传回预览，但必须明确标注“中间图/非最终图”，不要当最终交付图。
- 多张图、批量比例测试或多个 prompt 必须一张一张顺序运行，不并发。

## 全局 Skill 安装

- 打开本包根目录时，Codex 会自动读取这个 `AGENTS.md`，不需要额外安装 skill。
- 根目录的 `SKILL.md` 是随包提供的正式 Codex skill 文件。
- 如果要在别的项目窗口里也能调用 FHL CLI，需要把根目录 `SKILL.md` 安装到当前用户的 Codex skills 目录：
  ```bat
  cmd /c 安装CodexSkill.cmd
  ```
- 安装后的位置应为：
  ```text
  %USERPROFILE%\.codex\skills\fhl-image-studio\SKILL.md
  ```
- 这个 skill 的名称是 `fhl-image-studio`。
- 安装脚本会把旧的同类 skill `fhl-image-studio-cli` / `fhl-ty-v2` 移到 `.disabled` 目录，避免 Codex 同时发现多个同类入口。
- 安装后重启 Codex 或新开一个 Codex 线程，让 Codex 重新发现 skill。
- 如果 Codex 仍提示找不到 skill，就直接打开本包根目录工作；本文件里的规则等价于本包的接管入口。

## 浏览器缓存隔离

- 本发行版使用固定发布身份 `fhl-image-studio-v2-release-20260604` 作为浏览器存储命名空间。
- 不要改回按 `127.0.0.1:5173` 或文件夹路径共享缓存；否则同一浏览器会读到旧版本 API 配置和历史记录。
- 新发行版如果需要彻底避开旧浏览器缓存，应更换这个发布身份字符串。

## 第一次接管检查

先检查当前目录是否是包根目录：

```bat
dir 一键启动FHL桌面版.cmd
dir 程序文件\image-cli.cmd
dir 程序文件\runtime\cli\gptcodex-image.exe
dir 程序文件\config\cli.env.example
```

如果 `程序文件\image-cli.cmd` 不存在，告诉用户：

```text
请用 Codex 打开 FHL-Image-Studio方汤圆CLI魔改版V2.0.0 的包根目录，而不是它的上级目录或子目录。
```

## API Key 安全规则

- 不要要求用户把 API Key 发到聊天窗口。
- 第一次使用时，优先要求用户先打开桌面 UI：
  ```bat
  cmd /c 一键启动FHL桌面版.cmd
  ```
- 让用户在 UI 里点击“一键配置 FHL API”，粘贴自己的 API Key，并点击测试 API 或跑通一次 UI 生图。
- UI 跑通后会把 FHL CLI 配置自动同步到 `程序文件\config\cli.env.local`，包括 Base URL、API 形态、请求策略、模型、输出格式、质量、尺寸、partial_images 和本机私有 API Key。
- 如果 `程序文件\config\cli.env.local` 不存在，不要先让用户手动编辑；先提示用户按上面的 UI-first 流程跑通。手动复制 `程序文件\config\cli.env.example` 只作为同步失败时的兜底。
- 不要把 `程序文件\config\cli.env.local`、`程序文件\config\fhl-api.local.json`、`output\log\` 分享给别人。

## CLI Smoke Test

UI 已跑通并同步 `程序文件\config\cli.env.local` 后，先运行：

```bat
cmd /c 程序文件\image-cli.cmd --prompt "red apple on white background" --size 1024x1024 --quality medium
```

如果返回 JSON：

```json
{"ok":true,"imagePath":"...","sourceEvent":"final"}
```

告诉用户 CLI 已激活成功，给出 `imagePath`，并把图片用 Markdown 图片语法传回对话框预览。

如果返回 `api key must not be empty`，说明 UI 尚未同步 CLI 配置；请让用户重新启动 `一键启动FHL桌面版.cmd`，在 UI 里测试 API 或成功生图一次。

如果返回上游错误，提示用户稍后重试，或先用更简单 prompt 测试。

## 常用调用

文生图：

```bat
cmd /c 程序文件\image-cli.cmd --prompt "一个直播卖苹果的男孩" --size 1024x1024 --quality medium
```

竖图：

```bat
cmd /c 程序文件\image-cli.cmd --prompt "手机海报风格，一个直播卖苹果的男孩" --size 864x1536 --quality medium
```

图生图：

```bat
cmd /c 程序文件\image-cli.cmd --mode edit --image input\ref.png --prompt "保持主体结构，改成高级商业摄影风格"
```

基础比例顺序测试：

```text
auto
1024x1024
1536x1024
1024x1536
1536x864
864x1536
```

逐条运行，不要并发。

## 详细说明

需要更完整的接管流程时，读取：

```text
程序文件\Codex接管与初始化指南.md
程序文件\桌面使用说明-交付版.md
```

## 浏览器模式审计日志

- 这包的 `一键启动FHL桌面版.cmd + Vite 浏览器模式` 默认开启本地交互审计。
- 日志只写本地，不会上报远端。
- 审计文件固定在：
  ```text
  output\log\ui-audit\index.v1.json
  output\log\ui-audit\session-<tabSessionId>.md
  output\log\ui-audit\session-<tabSessionId>.jsonl
  ```
- 当用户反馈“浏览器版报错 / 上传失败 / 刷新后状态不对”时，Codex 先读：
  1. `output\log\ui-audit\index.v1.json`
  2. 最新的 `session-*.md`
  3. 需要细查时再读对应 `session-*.jsonl`
- `session-*.md` 适合先快速看“报错前点了什么、当时是什么模式、有没有参考图、最近一次 submit 是什么”。
- `session-*.jsonl` 是机器读明细，一行一个事件，适合用 `rg` / 程序化方式排查。
- 这套日志已经做脱敏，不应包含：
  - API Key
  - Authorization
  - base64 图片内容
  - 完整外部绝对路径
- 允许保留的调试信息只有截断后的 prompt 预览、参考图文件名 basename、以及 `memory / input-root / output-root / external-absolute / relative` 这类路径类别。
