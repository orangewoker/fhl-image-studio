# FHL Image Studio 方汤圆修改版 V2.0.1

> 开源致谢：Image-Studio 原作者 RoseKhlifa
>
> 原项目地址：https://github.com/RoseKhlifa/Image-Studio
>
> 方汤圆修改版项目地址：https://github.com/supart/fhl-image-studio

FHL Image Studio 方汤圆修改版是基于 Image-Studio 的独立修改发行版，面向桌面端图片生成、图生图、编辑和提示词工作流。本仓库为桌面版 `V2.0.1` 封板源码，采用 AGPLv3 发布，不内置任何 API Key、测试图片或个人本机配置。

本项目与上游原项目无隶属、背书或维护关系。请在二次分发、公开部署或网络服务使用时遵守 AGPLv3 的源码提供义务。

## 主要功能

- 文生图、图生图、编辑模式，支持多参考图。
- 提示词模块：复制、清空、模板/历史、基础 AI 优化、指令改写提示词。
- 反推提示词：导入图片后上传给支持视觉输入的文本模型，返回中文文生图 prompt。
- 工作区：多标签工作区分别保存 prompt、参数、源图、当前结果和运行状态。
- 历史记录：本地 IndexedDB 保存，支持搜索、筛选、复用参数、设置源图和导入导出。
- 画布：缩放、拖动、蒙版、标注、裁剪/旋转/翻转、对比查看。
- 参数：比例、尺寸、质量、输出格式、出图张数、seed、negative prompt、风格模板。
- 上游配置：支持 OpenAI 兼容 Responses API / Images API 路径，桌面端 API Key 走系统安全存储。
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

## 运行开发版

要求：

- Node.js 18 或 20+
- Go 1.25+
- Wails CLI v2.12+，用于桌面构建

Windows 预览：

```powershell
.\start-ui.cmd
```

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

## API 配置

本仓库不包含任何可用 API Key。首次运行后，请在应用内的 FHL API / 上游配置界面填写：

- Base URL
- API Key
- 文本模型 ID
- 图片模型 ID
- Responses API 或 Images API 模式

桌面端会尽量使用系统安全存储保存 API Key。示例配置只保留 `.example` 文件，真实配置请放在本机私有路径，切勿提交到 GitHub。

## 发布源码不包含

本次封板发布源码已排除：

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
