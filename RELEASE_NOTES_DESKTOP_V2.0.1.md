# Desktop V2.0.1 Release Notes

## 开源致谢

- Image-Studio 原作者 RoseKhlifa 项目地址：https://github.com/RoseKhlifa/Image-Studio
- 方汤圆修改版项目地址：https://github.com/supart/fhl-image-studio

本版本是基于 Image-Studio 的独立修改发行版，不是原作者官方版本。本发布包采用 AGPLv3，不内置任何 API Key。

## 更新重点

- 桌面版封板为 `V2.0.1`，版本号统一到 `2.0.1 / V2.0.1`。
- 顶部新增明显的开源致谢条，直接展示原作者和修改版项目来源。
- 提示词模块重新整理，主提示词、复制、清空、模板/历史、基础 AI 优化、反推提示词、指令改写和风格模板集中在同一个模块内。
- 基础 `AI 优化` 与 `指令改写提示词` 分离：
  - `AI 优化`：只用基础系统提示词润色 prompt。
  - `精准修改`：将用户填写的修改指令作为必须执行的改写要求。
- 新增 `反推提示词`：
  - 支持导入或拖入反推专用图片。
  - 反推按钮只在有图时显示。
  - 输出中文文生图 prompt，不自动生成图片。
- 优化长提示词输入体验，主提示词和指令输入框自动增高。
- 优化部分按钮和选中态视觉，减少操作歧义。

## 合规与安全

本 Release 源码和发布包不包含：

- API Key、访问令牌、真实账号配置。
- 用户生成图片、测试图、导入源图。
- 运行日志、浏览器任务日志、raw SSE dump。
- `input/`、`output/`、`intermediate/`、`output/log/`。
- `node_modules/`、`frontend/dist/`、`build/bin/`、`.local`、Gradle 缓存。

用户需要自行配置 API Key 和上游 API。请勿将本机私有配置提交到公开仓库。

## 建议校验

```powershell
cd .\image-studio\frontend
npm test
npm run build

cd ..\..
go test ./...
powershell -ExecutionPolicy Bypass -File .\scripts\check-compliance-package.ps1
```

## Tag

`desktop-v2.0.1`
