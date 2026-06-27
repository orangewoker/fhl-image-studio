# Desktop V2.0.2 Release Notes

副标题：正式版发布收尾更新（2026-06-18）

这轮更新主要围绕四件事展开：

1. 批处理任务更稳，失败任务可以批量清空，返回批次预览也恢复正常。
2. APIMart 和 FHL 的配置兼容更完整，CLI / Skill 可以直接跟随当前活动 profile 工作。
3. 素材管理、反推图和结果预览的交互更顺手，信息更完整。
4. GitHub 发布前把编码、错误提示、文档和本地工具链整理到可交付状态。

## 2026-06-27 补充收尾

- CLI 增加 `image-cli.cmd --status --json` 只读状态命令，Codex 可以自动识别当前包版本、活动 API、模型和输入输出目录，API Key 只显示是否已配置。
- `fhl-image-studio` Skill 改为稳定单入口，不创建版本号 skill；包升级时覆盖安装同名 Skill，并通过 CLI status 区分当前版本。
- Go CLI 继续封装为 `runtime\cli\gptcodex-image.exe`，`image-cli.cmd` 作为固定入口保留 `input / output / output\log / intermediate` 目录契约。
- 正式发布整理补齐 GitHub Actions CI、源码发布暂存脚本、Windows 便携包打包脚本和 release safety 扫描；源码包保留目录骨架但不包含 API Key、WebView 缓存、生成图片、测试输出和日志。
- Fresh package 下 `image-cli.cmd --status --json` 已验证返回 `packageVersion: V2.0.2` 且 `apiKeyConfigured: false`。

- 360 全景升级为独立工作台入口：左侧模式模块下方可进入 `360 工作台`，支持生成 2:1 全景、导入外部全景、编辑当前全景和打开最近全景。
- 360 查看器补齐项目化输出管理：镜头导出图、编辑镜头图、贴回后的新全景图归到同一张全景源图下，普通历史和批次预览仍保留。
- 手动贴回链路大幅缩短：带有 roundtrip 的镜头编辑图在大图预览右上角直接显示 `手动贴回`、`导入贴回`，外部同比例替换图也能直接进入贴回。
- 手动贴回弹窗升级为 `对齐 / 蒙版 / 色彩` 工作流，支持操控缩放中心点、原图/修改图对比、卷帘对比、亮度/对比度/色相、可调羽化和精细手绘蒙版。
- 全景预览优先使用 WebGL 逐像素渲染，减少大 FOV 下的波浪感；WebGL 不可用时回退自适应加密 canvas 网格。
- APIMart 增加“重新同步 APIMart 结果”，新任务保存 `task_id`，失败或终图缺失时可查询后台任务并把图片拉回桌面版历史。
- RunningHub 一键配置入口改为 `已有 API / 获取 API` 选择弹窗，`获取 API` 使用完整链接 `https://www.runninghub.cn/call-api/api-detail/2046503667076751361?inviteCode=rh-v1507`，设置页与上游配置按钮统一缩写为 `RH`。
- FHL 经实测确认 Responses 链路可出图；桌面端 FHL 比例、取消按钮位置和批次预览返回路径同步做了体验修正。

## 本轮重点更新

### 1. 批处理与批次预览

- 新增“清空失败/终图缺失 N”按钮。
  - 只清空当前工作区当前批次中可重试的失败、异常、终图缺失任务。
  - 清空后的格子保留在批次预览里，并以灰色 `已取消` 状态展示。
  - 已清空格子不会再进入“一键重试”的数量统计和执行列表。
- “一键重试”文案改为“重试当前批次失败任务 N”，更直观。
- 修复 `Ctrl+V` 粘贴参考图后“回到批次预览”失效的问题，只要当前标签页已有批次会话，就可以正常切回本批次结果。
- 连续生成模式关闭时，如果当前已有排队或生成中的任务，再点“生成”会给出明确提示，不再默默并发提交。

### 2. 输出图信息与可见性

- 为所有输出成功的图像增加真实像素尺寸角标。
  - 批次结果格子支持显示。
  - 单图大图预览支持显示。
  - 历史/完整相册缩略图与时间线支持显示。
  - Android 历史缩略图同步支持显示。
- 批次格子和历史项的 API 来源标识统一为 `FHL / APIMart / Images`，避免 FHL 一键配置后仍显示 `Images` 的误导。

### 3. 素材管理与反推图体验

- 素材管理右侧详情预览从小缩略图改为全宽全图预览。
  - 图片宽度贴合右侧详情栏。
  - 高度按原图比例自动展开。
  - 超长图继续使用右侧栏滚动查看，不增加额外嵌套滚动。
- 把未分组素材拖入某个分组后，不再自动切换中间视图到该分组；只有显式点击查看才切换。
- 反推提示词图片槽新增右键菜单“粘贴图像”。
  - 支持读取系统剪贴板中的 PNG / JPEG / WebP / `image/*`。
  - 复用现有反推图导入链路。
  - 无图或权限不支持时给出明确 toast 提示。
- `ContextMenu` 为“粘贴图像”补上剪贴板图标，避免右键菜单图标错乱。

### 4. APIMart / FHL 配置与尺寸链路

#### APIMart

- 默认 APIMart 一键配置继续使用官方域名 `https://api.apimart.ai`。
- 同时保留对旧模块已验证链路 `https://api.apib.ai` 的兼容，不再强制改回新域名。
- 配置测试改为官方 `GET /v1/balance`，不再使用非官方 fake task 探针。
- 新增 `APIMART_API_KEY=...` 粘贴清洗支持，并继续兼容 `Bearer sk-...`。
- 本地预览下新增 legacy proxy，旧域名 profile 可走独立代理复现旧模块线路。

#### FHL / Images API

- FHL 一键配置保持在 Images API 兼容模式下运行，但快速比例集收敛为当前稳定可控的标准集合：
  - `auto / 1:1 / 3:2 / 2:3 / 16:9 / 9:16 / 7:4 / 4:7`
- 2K / 4K 和 exact size 统一接入 OpenAI 图片尺寸归一化与修复链。
- 手动比例与自动适配彻底拆开；用户选手动比例后，不再被 `autoAspectResolution` 残留值覆盖。
- 对高风险 FHL exact size，会自动转去更稳定的 Responses 提交路径，减少返回尺寸漂移。

### 5. Codex Skill / CLI 链路恢复

- 恢复并升级根目录 Skill 资产：
  - `AGENTS.md`
  - `SKILL.md`
  - `安装CodexSkill.cmd`
  - `image-cli.cmd`
- `image-cli.cmd` 改成薄包装，不再硬编码 FHL 参数，而是默认读取 `config/cli.env.local`。
- Go CLI 新增 `apimart` 模式，支持跟随当前 profile 走 APIMart 异步提交与轮询。
- `syncCLIConfig` 不再跳过 APIMart，活动 profile 的 `baseURL / apiMode / requestPolicy / model / size / quality / outputFormat` 都会同步给 CLI。
- Skill 文档明确共享并发属于 UI / profile 语义，CLI 默认顺序执行；只有用户明确要求时才组织并发任务。

### 6. 桌面端导出与错误提示

- 历史图和结果详情补回原生拖拽导出入口，平台能力可用时可直接拖出图片文件。
- 修复 Go CLI 在 FHL / Images API 链路里的中文报错乱码，用户现在能直接看到可读的中文错误信息。

## GitHub 发布建议写法

建议把这版标记为正式发布版 `V2.0.2`。

推荐摘要：

- 批处理失败任务支持批量清空并保留灰色取消格子。
- 修复粘贴参考图后无法返回批次预览的问题。
- 360 工作台支持外部全景导入、镜头输出管理、手动/外部贴回和精细蒙版贴图。
- APIMart / RunningHub 结果可以重新同步后台已完成任务，减少前端漏接终图造成的失败。
- APIMart 兼容官方域名与旧域名，配置探针切换到 `/v1/balance`。
- RunningHub 一键配置提供 `已有 API / 获取 API` 两入口，按钮统一缩写为 `RH`。
- FHL 比例、2K/4K 尺寸和手动比例优先级链路继续收敛。
- 素材管理右侧支持全图预览，反推图支持右键粘贴剪贴板图片。
- Codex Skill / CLI 链路恢复，支持随当前活动 profile 调用 FHL、APIMart 或 RunningHub。
- 输出图统一显示真实像素尺寸。

## 发布说明

- 本版仍不内置任何 API Key、本机配置、生成图、测试图或运行日志。
- 如果 FHL 上游高峰期返回 429 或“服务繁忙”，属于上游额度或账号池状态，不是本地 UI 配置被篡改。
- APIMart 已兼容新旧域名，但仍建议优先使用官方文档默认域名 `https://api.apimart.ai`。
