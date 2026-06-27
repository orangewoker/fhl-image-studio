# 使用与上游配置

## 首次启动

首次启动会自动打开「上游配置」。也可以之后从设置里重新打开。

需要填写:

1. API 形态:Responses API 或 Images API。
2. BASE_URL:你自己的 OpenAI 兼容中转站地址。
3. API Key。
4. 文本模型 ID:Responses API 与 prompt 优化会用到，默认 `gpt-5.5`。
5. 图像模型 ID:两种 API 形态都会用到，默认 `gpt-image-2`。
6. 测试连接:保存前建议先点一次。

本应用不内置任何默认上游，也不会向除你配置的 BASE_URL 以外的生成服务发请求。

## 一键配置

设置页和「上游配置」里提供一键配置入口：

- FHL：先选择 `已有 API` 或 `获取 API`。已有 Key 时粘贴一次 Key，会自动创建 Responses / Images 两套配置并分别验证。
- APIMart：先选择 `已有 API` 或 `获取 API`。已有 Key 时会切到 APIMart 异步 profile，并移动到 API Key 输入位置。
- RH：先选择 `已有 API` 或 `获取 API`。已有 API 时默认使用本地桥接地址 `http://127.0.0.1:8117`，并创建 `RH-1 全能图像2`、`RH-1 全能图像G2` 两套配置。获取 API 会打开并复制完整 RunningHub 链接。

RH 的 API Key 真源在 8117 桥接模块里，不走桌面版常规 keyring。桌面版只负责代填桥接地址、代写桥接 Key、创建 profile 和验证能力矩阵。

## API 形态怎么选

### Responses API

调用 `/v1/responses`，通过模型内置的 `image_generation` 工具触发图像生成，SSE 流式接收事件。

适合:

- 图像推理容易超过 100 秒。
- 上游在 Cloudflare / Nginx 后面，常见 524/504。
- 你的 key 有文本模型权限，例如默认的 `gpt-5.5`。

特点:

- SSE 事件会持续到达，网关更不容易把连接判定为空闲。
- 本地有 3 次自动重试和 15 秒 backoff。
- 如果 final image 未拿到但已经收到 `partial_image_b64`，会尽量保存最后一个部分结果。
- 生成请求默认要求上游按原始 prompt 传给图像工具，不再提供提示词改写开关。细节见 [no-prompt-revision](./no-prompt-revision/README.md)。

### Images API

调用标准图像接口:

- `/v1/images/generations`:文生图。
- `/v1/images/edits`:图生图，multipart 上传。

适合:

- 上游不支持 Responses API。
- key 只绑定 image 分组。
- 只需要最大兼容性。

限制:

- 一次性 JSON 响应，没有 SSE 保活。
- 长推理在 Cloudflare 后面仍有 524/504 风险。
- 多参考图、seed、negative prompt 是否生效取决于上游兼容实现。

## 参数策略

在上游 profile 中可以选择请求策略:

| 策略 | 行为 |
|---|---|
| OpenAI 标准 | 默认策略，只发送 OpenAI 官方公开字段，适合 OpenAI 直连或严格兼容实现。 |
| 兼容中转扩展 | 额外发送 relay 常见扩展字段，例如 seed / negative_prompt，适合明确知道上游支持这些字段的场景。 |

字段映射:

- Responses 模式:
  - `mask` 走 `input_image_mask`。
  - `seed` / `negative_prompt` 只在兼容中转扩展策略下附带发送。
- Images Edits 模式:
  - `mask` 作为 multipart file。
  - `seed` / `negative_prompt` 只在兼容中转扩展策略下附带发送。
  - 多参考图中第二张及之后使用兼容字段发送，标准 OpenAI 实现可能忽略。

## 基本流程

文生图:

1. 选择「文生图」。
2. 输入 prompt。
3. 选择比例、质量、输出格式、风格。
4. 根据需要设置 seed 或 negative prompt。
5. 点击「生成」，或使用 `Cmd+Enter` / `Ctrl+Enter`。

图生图:

1. 拖入本地图片、粘贴剪贴板图片，或点击添加图片。
2. 切换到「图生图」。
3. 输入修改要求。
4. 如需蒙版，在画板里切换到蒙版工具绘制。
5. 点击「生成」。

生成成功后，toast 会提供查看详情入口；详情抽屉里可以查看图片预览、全部参数、原始 prompt、优化后 prompt、保存路径与 raw 响应路径。

## 360 工作台

左侧「模式」模块下方有 `360 工作台`入口。它用于生成、导入、查看、重新打镜头和贴回 2:1 全景图。

常用流程：

1. 点击 `360 工作台`。
2. 选择 `生成 360 全景图`，或导入外部全景图。
3. 进入 360 查看器后调整镜头方向、FOV、比例和输出尺寸。
4. 导出镜头图后进入图生图编辑。
5. 编辑完成后，在大图预览右上角点击 `手动贴回`，或用 `导入贴回`导入外部替换图。
6. 在手动贴回弹窗里做对齐、蒙版和色彩调整，确认后生成新的 2:1 全景图。

详细说明见 [360 工作台与全景贴回](./panorama-360.md)。

## 结果重新同步

当任务在上游后台成功，但桌面版前端没有收到最终图片时，可使用重新同步：

- RH 失败卡片或失败日志中显示 `重新同步 RH 结果`。
- APIMart 失败卡片或失败日志中显示 `重新同步 APIMart 结果`。

重新同步成功后会把图片写入历史、更新批次任务状态，并尽量保持当前批次预览不被切到单图预览。

## 输出与历史

- 生成图片默认落到输出目录的 `images/` 子目录。
- 原始响应和排错日志默认落到输出目录的 `log/` 子目录。
- 历史元数据保存在 IndexedDB。
- 历史可以导出为 JSON，也可以重新导入。

具体路径见 [troubleshooting.md](./troubleshooting.md)。
