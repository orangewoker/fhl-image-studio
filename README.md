# FHL Image Studio 方汤圆修改版 V2.0.2

> 开源致谢：Image-Studio 原作者 RoseKhlifa
>
> 原项目地址：https://github.com/RoseKhlifa/Image-Studio
>
> 方汤圆修改版项目地址：https://github.com/supart/fhl-image-studio

FHL Image Studio 方汤圆修改版是基于 Image-Studio 的独立修改发行版，面向桌面端图片生成、图生图、编辑和提示词工作流。本仓库为桌面版 `V2.0.2` 正式发布源码，采用 AGPLv3 发布，不内置任何 API Key、测试图片或个人本机配置。

本项目与上游原项目无隶属、背书或维护关系。请在二次分发、公开部署或网络服务使用时遵守 AGPLv3 的源码提供义务。

## 主要功能

- 文生图、图生图、编辑模式，支持多参考图。
- 提示词模块：复制、清空、模板/历史、基础 AI 优化、指令改写提示词。
- 反推提示词：导入图片后上传给支持视觉输入的文本模型，返回中文文生图 prompt。
- 工作区：多标签工作区分别保存 prompt、参数、源图、当前结果和运行状态。
- 历史记录：本地 IndexedDB 保存，支持搜索、筛选、复用参数、设置源图和导入导出。
- 画布：缩放、拖动、蒙版、标注、裁剪/旋转/翻转、对比查看。
- 360 工作台：支持 2:1 全景生成、外部全景导入、重新打镜头、输出管理、手动贴回、外部替换图贴回和精细蒙版贴图。
- 参数：比例、尺寸、质量、输出格式、出图张数、seed、negative prompt、风格模板。
- 上游配置：支持 FHL、APIMart、RH 以及 OpenAI 兼容 Responses API / Images API 路径；桌面端 API Key 走系统安全存储，RH Key 可写入本地 8117 桥接模块。
- 4K/画布优化：默认优先使用轻量预览源渲染，保留原图用于保存、分享和后续编辑。

## 目录结构

```text
.
├── image-studio/          # Wails 桌面应用：Go 后端 + React/TypeScript 前端
├── go-cli/                # FHL 图像生成 CLI 与共享客户端
├── shared/                # 前端/CLI 共享内核
├── cloudflare-worker/     # 可选中转 Worker
├── config/                # 示例配置，仅保留 .example
├── scripts/               # 构建、验证、封包和合规扫描脚本
├── docs/                  # 开发与功能文档
├── LICENSES/              # 上游历史许可证记录
├── LICENSE                # AGPLv3
├── NOTICE.md              # 来源与致谢
├── COMPLIANCE.md          # 合规说明
└── CHANGELOG.md           # 版本更新记录
```

## 运行源码版

要求：

- Node.js 18 或 20+
- Go 1.25+
- Wails CLI v2.12+，用于桌面构建

Windows 预览：

```powershell
.\start-ui.cmd
```

Windows 正式便携包：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-windows-portable-v2.0.2.ps1
```

生成后的用户包使用 `一键启动FHL Studio V2.0.2.cmd` 启动，不依赖 Node、Vite 或 5173 预览服务。生成内容默认保存在便携包内的 `output/`，导入图在 `input/`，中间文件在 `intermediate/`，日志在 `output/log/`。

发布源码暂存：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\prepare-release-source-v2.0.2.ps1
```

这个脚本会复制一份干净源码树用于 GitHub 发布，保留当前架构目录和占位文件，但排除 `cli.env.local`、`config/webview/`、生成图片、日志、缓存和 EXE。

### CLI / Codex Skill

包根 `image-cli.cmd` 是 Codex 和手动 CLI 的固定入口，会调用 `runtime\cli\gptcodex-image.exe`，并默认读写包根 `input/`、`output/`、`output/log/` 与 `intermediate/`。

```powershell
.\image-cli.cmd --status --json
```

`--status --json` 只读返回当前包版本、活动 API、模型、尺寸与目录状态；API Key 只显示是否已配置，不会打印明文。`fhl-image-studio` Skill 使用这个状态自动跟随桌面 UI 当前同步的 profile。

前端检查：

```powershell
cd .\image-studio\frontend
npm ci
npm test
npm run build
```

Wails 桌面构建：

```powershell
cd .\image-studio
wails build
```

发布安全检查：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-compliance-package.ps1 -Root .
```

CI 会在 GitHub Actions 中分别执行 Go、前端和发布安全检查；打 `v2.0.2` tag 时会构建 Windows 便携包并上传 Release 附件。

## API 配置

本仓库不包含任何可用 API Key。首次运行后，请在应用内的 FHL API / 上游配置界面填写：

- Base URL
- API Key
- 文本模型 ID
- 图片模型 ID
- Responses API 或 Images API 模式

一键配置入口：

- FHL：可选择已有 API 或获取 API，已有 Key 时自动创建 Responses / Images 两套 profile。
- APIMart：可选择已有 API 或获取 API，已有 Key 时切到 APIMart 异步 profile。
- RH：可选择已有 API 或获取 API，已有 API 时默认使用 `http://127.0.0.1:8117` 桥接地址并创建 `RH-1 全能图像2`、`RH-1 全能图像G2` 两套 profile。

桌面端会尽量使用系统安全存储保存 API Key。示例配置只保留 `.example` 文件，真实配置请放在本机私有路径，切勿提交到 GitHub。

## 发布源码不包含

本次发布源码和便携包准备流程会排除：

- `input/`、`output/`、`intermediate/`
- `output/log/`
- `node_modules/`
- `image-studio/frontend/dist/`
- `image-studio/build/bin/`
- `.local/`、`*.local`、`*.local.json`
- `cli.env.local`、`fhl-api.local.json`
- 测试生成图、运行日志、浏览器任务日志、API Key、本机缓存

## 合规

- 发布协议：GNU Affero General Public License v3.0
- 上游来源：RoseKhlifa/Image-Studio
- 修改版地址：supart/fhl-image-studio
- 无内置 API Key
- 无内置用户图片、测试图、运行日志或个人配置

详细说明见 [COMPLIANCE.md](./COMPLIANCE.md) 和 [NOTICE.md](./NOTICE.md)。
