# Desktop V2.0.2 Release Notes

## 开源致谢

- Image-Studio 原作者 RoseKhlifa 项目地址：https://github.com/RoseKhlifa/Image-Studio
- 方汤圆修改版项目地址：https://github.com/supart/fhl-image-studio

本版本是基于 Image-Studio 的独立修改发行版，不是原作者官方版本。本发布包采用 AGPLv3，不内置任何 API Key、本机配置、生成图片、测试图片或运行日志。

## 更新重点

- 桌面正式版统一为 `Desktop V2.0.2`，版本号统一为 `V2.0.2 / v2.0.2`。
- 新增桌面 360 工作台入口，支持生成 2:1 全景、外部全景导入、镜头输出管理、手动贴回和外部替换图贴回。
- 360 预览优先使用 WebGL 逐像素渲染，降低大 FOV 下的波浪感；WebGL 不可用时自动回退到自适应加密 canvas 网格。
- 手动贴回升级为 `对齐 / 蒙版 / 色彩` 工作流，支持操控缩放中心点、卷帘对比、原图对比、亮度、对比度、色相、可调羽化和精细手绘蒙版。
- APIMart、FHL、RunningHub 配置链路统一收敛，支持 RH `banana2 / image_g2`、APIMart 任务继续查询、FHL Responses / Images 链路回归验证。
- Codex Skill 和 Go CLI 升级为当前包自识别：`image-cli.cmd --status --json` 可输出当前 API、模型、目录和版本状态，API Key 只显示是否配置。
- Windows 便携包保留 `input/`、`output/`、`output/log/`、`intermediate/` 目录契约，并内置 Go CLI EXE 与稳定 `fhl-image-studio` Skill。
- 批次预览、素材管理、参考图导入、反推图入口、API 快捷配置和多处中文乱码提示做了桌面端体验修复。

## 安全与合规

本次源码和 Windows 便携包已清理：

- 不包含 `config/cli.env.local`
- 不包含 `config/webview/`
- 不包含 API Key、访问令牌、账号配置
- 不包含用户生成图片、测试图片、导入源图
- 不包含运行日志、raw SSE dump、WebView 登录状态
- `config/cli.env.example` 中 API Key 保持为空

RunningHub 仍通过本地 8117 桥接服务接入，不会把 RH Key 写入发布包。

## 校验记录

本地发布前已通过：

```powershell
cd go-cli
go test ./...

cd ..\image-studio
go test ./...

cd frontend
npm test
npm run build
```

发布包安全检查：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-compliance-package.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\check-release-safety.ps1
```

解压 Windows 便携包后，`image-cli.cmd --status --json` 已验证返回 `packageVersion: V2.0.2` 且 `apiKeyConfigured: false`。

## Release

- Release 名称：`Desktop V2.0.2`
- Tag：`v2.0.2`
- Windows 便携包：`FHL-Image-Studio-Desktop-V2.0.2-Windows-Portable.zip`
