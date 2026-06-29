# CHANGELOG

## Desktop V2.0.2.1 - 2026-06-29

- 修复桌面版 FHL Responses / `gpt-image-2` 明确尺寸下的比例选择不稳定问题。
- 对 `1:1`、`16:9`、`9:16`、`2:1`、`1:2` 做了 Codex 浏览器真实出图验证，输出尺寸已经按选择比例生成。
- 版本号升级为 `V2.0.2.1`，同步更新桌面显示版本、Wails 产品版本、Go CLI packageVersion、CLI User-Agent 版本、便携包产物名和 Skill 说明。
- Codex Skill 改为版本化命名 `fhl-image-studio-v2-0-2-1`，安装脚本会把旧的稳定名 `fhl-image-studio` 移入 `.disabled` 目录，避免多版本混淆。
- 新增 Android 对齐交接文档 `docs/android-v2.0.2.1-handoff.md`，把桌面小版本修复内容整理成可直接发送给另一个 Codex 窗口的提示词。

## Desktop V2.0.2 正式发布整理 - 2026-06-27

本次记录 V2.0.2 正式发布前已经补齐的 360 项目化工作台、精细贴回、APIMart/RH 恢复、一键配置入口、CLI/Skill 与发布整理。

### Added

- 新增 CLI 只读状态命令 `image-cli.cmd --status --json`，可返回当前 `packageVersion / apiMode / baseURL / model / size / inputDir / outputDir / rawDir`，并仅用布尔值表示 API Key 是否已配置。
- RunningHub CLI 状态识别新增 `apiKeySource=bridge`、`runningHubBridgeReachable`、`runningHubAPIKeyConfigured`，只读检查本地 8117 桥接配置，不打印 RH Key。
- `fhl-image-studio` Codex Skill 改为稳定单入口策略，不新增版本号 sibling skill；每次生成前先通过 CLI status 自动识别当前包版本与活动 API profile。
- 新增左侧 `360 工作台`入口，位于模式模块下方，可直接选择生成 2:1 全景、导入外部全景、编辑当前全景或打开最近全景。
- 新增外部 360 导入链路，导入图片会持久化为历史项并可进入 360 查看器；用户仍可自行决定是否关闭不合适比例的图片。
- 新增 360 输出管理，镜头导出图、编辑镜头图、贴回后的全景图统一挂在同一张全景源图下，普通历史工作流不受影响。
- 新增大图预览快捷入口：对带有 `panoramaRoundtrip` 的镜头编辑图显示 `手动贴回`、`导入贴回`，减少从详情或输出管理里层层进入的操作。
- 新增外部替换图贴回能力，可导入与原镜头同宽高比的 PNG/JPG/WebP 外部编辑图，自动归入同一 360 项目并进入手动贴回弹窗。
- 新增手动贴回精细工具：平移、缩放、旋转、滚轮缩放、方向键微调、`+ / -` 微调、可调羽化、原图按住对比、卷帘对比、明暗/对比度/色相调整。
- 新增 `操控缩放模式`，支持拖动缩放中心点后按距离比例缩放，中心点使用空心十字坐标标记。
- 新增精细贴图蒙版模式，支持画笔/擦除、画笔大小、软边、撤销/重做、清空、蒙版效果预览；启用空蒙版时会阻止直接贴回。
- 新增 360 WebGL 逐像素预览渲染，优先减少三角网格造成的波浪感，WebGL 不可用时自动回退自适应加密 canvas 网格。
- 新增 RunningHub API 选择弹窗，`一键配置 RH` 会先进入 `已有 API / 获取 API` 两个入口；`获取 API` 使用完整 RunningHub 链接并复制到剪贴板。

### Changed

- 360 镜头编辑会自动切到图生图模式，只保留当前镜头图 1 张源图，尺寸比例跟随重新打镜头时选择的比例，默认提示词改为 `修改画面，保持构图不变，`。
- 360 输出尺寸新增“最长边”模式，默认最长边 2048，并自动计算短边尺寸。
- 360 输出管理入口从查看器内部上移到大图预览工具栏，按钮文案统一为 `360输出管理`。
- 批次结果单击改为选图，双击才进入大图预览，避免查看参考图后丢失批次预览路径。
- 反推图片导入框改为更醒目的黄色系样式，与普通参考图入口区分。
- RunningHub 在设置和上游配置中的按钮改为右侧同排布局，英文统一缩写为大写 `RH`。

### Fixed

- 修复 RunningHub `banana2` 图生图 CLI 路径误把提交响应里的源图 `imageUrls` 当作结果图下载的问题；现在必须轮询 `/api/task` 成功后再取真正输出图。

- 修复 360 工作台导入外部全景后无法进入 360 查看器的问题。
- 修复从全景大图预览切到参考图大图后无法回到批次预览的问题。
- 修复手动贴回弹窗中高比例编辑图显示不全的问题，预览会优先把完整编辑图放入画框。
- 修复蒙版模式下确认前无法查看实际贴回效果的问题，补充“确认蒙版效果”的预览路径。
- 修复蒙版模式下边缘羽化语义不清的问题：启用精细蒙版后，羽化主要作用于蒙版边缘，而不是整张贴图边缘。
- 修复 APIMart / RunningHub / FHL 一键配置入口风格不一致的问题，均先走 API 状态选择或明确配置入口。

### Verified

- `npm test`：409 个测试通过，覆盖 APIMart/RH 恢复、360 roundtrip、WebGL fallback、精细贴回蒙版、外部贴回入口、批次预览保持等路径。
- `npm run build`：桌面版构建通过，仅保留既有 Vite chunk size / dynamic import 提示。
- `cd go-cli && go test ./...`：Go CLI 单测通过。
- `cd image-studio && go test ./...`：桌面后端单测通过。
- Codex 浏览器实测：RH 一键配置入口、360 手动贴回入口、批次预览返回、FHL Responses 实际出图、APIMart/RH 结果重新同步路径。

## Desktop V2.0.2 Codex 增量记录 - 2026-06-26

本次记录桌面版在本轮联调中已经落地并验证通过的改动，重点覆盖 APIMart、RunningHub、FHL 配置链路、360 全景工作流和批次预览稳定性。

### Added

- 新增 RunningHub 桥接 provider，一键创建 `RH-1 全能图像2`、`RH-1 全能图像G2` 两套配置，支持文生图与图生图，结果通过本地桥接模块代理取回并写入历史。
- 新增 RunningHub 结果重新同步能力，可从桥接任务恢复后台已完成但前端未收到的结果，并保持当前批次预览不被切走。
- 新增 APIMart 结果重新同步能力，保存首次提交返回的 `task_id`，失败/终图缺失时可调用任务查询接口重新拉取图片并写回历史。
- 新增 APIMart 原始响应日志入口的 task_id 解析与手动重同步，旧日志中存在 `task_...` 时可直接补救拉回结果。
- 新增 FHL 单 Key 双配置快速接入，粘贴一次 key 后自动写入 `FHL-N Responses` 与 `FHL-N Images`，并分别做真实权限验证反馈。
- 新增桌面 360 全景查看入口：识别 2:1 全景图后可进入 360 查看器，支持镜头朝向、FOV、比例和输出尺寸设置。
- 新增 TY360 风格镜头导出与 roundtrip 元数据，导出的镜头图可继续进入现有编辑链路。
- 新增全景编辑贴回链路，编辑后的镜头图可自动或手动贴回原始 2:1 全景图，并默认使用 10% 边缘羽化遮盖轻微偏色或错位。

### Changed

- APIMart 尺寸请求改为按 `比例@分辨率` 语义发送，向上游提交 `size: "9:16"` 与 `resolution: "1k/2k/4k"`，不再把像素尺寸误当 APIMart `size`。
- RunningHub 尺寸能力改为 provider + mode aware，文生图与图生图分别使用 RH 文档对应比例集合，分辨率统一支持 `1k / 2k / 4k`。
- 切换 RH / FHL / APIMart profile 时只切换上游配置，不再清空 `resultGridOpen`、`selectedBatchTaskId` 或工作区批次视图状态。
- 360 查看器补齐原 TY360 的全景模式镜头框叠加层，比例、FOV、roll 与右上角输出预览都从同一个 shot 状态读取。
- 360 取景框拖动与控制手柄保持当前选择比例，修复 9:16 被拖成 16:9、初始打开比例不匹配等交互问题。
- FHL / APIMart / RunningHub 相关错误提示统一使用可读简体中文，并补充上游原文关键信息，便于区分权限、账号池、任务未完成和图片过期。

### Fixed

- 修复 APIMart 成功提交但前端未拿到终图时无法从后台恢复结果的问题。
- 修复 APIMart 恢复成功后自动跳到单图预览、打断当前批次网格的问题。
- 修复切换 RunningHub API profile 会从批次预览自动掉到单图预览的问题。
- 修复 RunningHub 后台任务完成但桌面版未同步时只能手动查桥接模块、无法回写历史的问题。
- 修复 360 查看器重置镜头后缺少“添加镜头”入口、全景模式缺少实时预览框、控制手柄不可用等问题。
- 修复 360 编辑 roundtrip 中第 1 张导出镜头图、第 2 张编辑镜头图、第 3 张贴回全景图的历史链路与 parent/source 追踪。
- 修复多处中文乱码文案，尤其是尺寸、上游配置、状态栏、失败日志和 360 相关提示。

### Verified

- `npm test`：387 个测试全部通过，覆盖 APIMart 恢复、RunningHub 恢复、profile 切换保留批次预览、尺寸能力、360 roundtrip 与贴回羽化等路径。
- `npm run build`：桌面版构建通过，仅保留既有 Vite chunk size / dynamic import 提示。
- 浏览器实测：APIMart 重新同步可把后台任务结果拉回历史；切换 RH / FHL / APIMart profile 时批次网格保持打开。
- FHL 实测诊断：`FHL-1 Responses` 返回 `Image generation is not enabled for this group`，`FHL-1 Images` 返回 `No available compatible accounts`，确认当前失败来自 FHL 上游权限/账号池而不是桌面版本地请求链路。

## Desktop V2.0.2 发布候选整理 - 2026-06-18

本轮重点放在批处理稳定性、APIMart/FHL 兼容、素材管理体验、Codex Skill/CLI 链路恢复，以及 GitHub 发布前的文档与错误提示修整。

### Added

- 批次维护新增“清空失败/终图缺失 N”操作，会把当前工作区中可重试的失败、异常、终图缺失任务批量标记为 `cancelled`，保留灰色格子但移出一键重试池。
- 反推提示词图片槽新增右键菜单“粘贴图像”，可直接读取系统剪贴板中的第一张图片导入反推图。
- 输出图右下角新增真实像素尺寸角标，覆盖批次结果、单图预览、完整相册/历史时间线，以及 Android 历史缩略图。
- 恢复并升级 Codex Skill/CLI 资产：`AGENTS.md`、`SKILL.md`、`安装CodexSkill.cmd`、`image-cli.cmd`，让本地 CLI 可跟随当前活动 profile 在 FHL 和 APIMart 之间切换。
- 桌面端历史图和结果详情补回原生拖拽导出接口，平台能力允许时可直接拖到资源管理器或其他应用。

### Changed

- “一键重试”文案调整为“重试当前批次失败任务 N”，继续保留失败数量显示。
- 批次格子、历史图和相关角标的 API 来源显示统一为 `FHL / APIMart / Images`，避免 FHL 一键配置下仍显示 `Images`。
- 素材管理中，把未分组素材拖入某个分组后，不再自动切换中间视图；只有显式点击查看才切换。
- 素材管理右侧未分组单图详情改为全宽全图预览，过高时沿用右侧栏滚动。
- APIMart 配置探针改为官方 `GET /v1/balance`，同时兼容 `https://api.apimart.ai` 和已验证可用的 `https://api.apib.ai`。
- FHL 一键配置继续落在 Images API 兼容链路，但尺寸/比例矩阵收敛到当前可控的标准集合，并把高风险 exact size 自动转去更稳定的 Responses 提交链路。
- 连续生成模式关闭时，生成按钮不再隐式并发提交；改为弹出明确提示，引导用户先开启连续生成模式。
- 上游配置列表选中态改为蓝框高亮，同时保留 `R / A / I` 模式徽章，降低误选 profile 的风险。

### Fixed

- 修复 `Ctrl+V` 粘贴参考图后“回到批次预览”按钮失效的问题。
- 修复失败、终图缺失任务无法一键清空、已清空任务仍混入一键重试列表的问题。
- 修复反推图上下文菜单缺少剪贴板图标和粘贴入口的问题。
- 修复素材管理右侧竖图、长图预览过小、显示不全的问题。
- 修复 FHL 尺寸链路中手动比例可能被 `autoAspectResolution` 残留覆盖的问题。
- 修复 APIMart 配置测试使用非官方探针、旧域名被误判为无效的问题。
- 修复 Go CLI / Images API / FHL 链路中的中文报错乱码问题，确保实际运行时返回可读中文错误。

## Desktop V2.0.2 - 2026-06-08

- 发布 Windows x64 桌面 EXE 便携包，默认输出目录、WebView 数据目录和代理策略适配便携模式。
- 增加 Wails 便携包、中文启动器和合规发布材料。
- 优化 AI 优化、反推提示词失败时的中文错误提示。

## Desktop V2.0.1 - 2026-06-07

- 重排提示词编辑区，梳理 AI 优化、精确改写、反推提示词、模板/历史 等入口。
- 增强 prompt 优化和反推提示词的返回解析兼容性。
- 补齐 GitHub、NOTICE、COMPLIANCE、RELEASE_NOTES 等发布合规材料。

## Desktop V2.0.0

- 首个桌面魔改版发布，包含 FHL API 配置、文生图/图生图、历史记录与基础画布能力。
