# FHL 1K/2K/4K 分辨率请求规律记录

记录时间：2026-06-23

测试对象：

- 上游：`https://www.fhl.mom`
- 模型：`gpt-image-2`
- API 模式：Images API
- request policy：`openai`
- quality：`medium`
- 测试提示词：安全抽象几何图案，避免内容审计影响尺寸判断

## 结论

1. OpenAI 官方规则没有改成“只能出 1K”。官方文档显示 `gpt-image-2` 支持 2K/4K 和自定义尺寸，只要满足最大边、像素数、16 倍数等约束。
2. 早期桌面版代码确实会在 FHL + Images 模式下把部分 2K/4K 请求主动降到 1K 稳定档，例如 `2160x3840 -> 864x1536`、`3840x2160 -> 1536x864`。
3. 已修复桌面版：`gpt-image-2` 首轮请求和重试都保留用户选择的 1K/2K/4K 原始尺寸，不再偷偷降级，也不再绕到 Responses API。
4. 但是 FHL 当前实测仍不会按像素精确返回。它即使收到 2K/4K 请求，也会返回内部固定档位，例如方图约 `1254x1254`，9:16 约 `941x1672`。
5. 所以当前问题分两层：桌面版请求链路已修；FHL 上游实际出图仍是非精确像素档位，这不是提示词能强制解决的。

## 官方 OpenAI 规则核对

2026-06-23 查询 OpenAI 官方文档：

- `gpt-image-2` 支持常见 1K、2K、4K 尺寸，例如 `1024x1024`、`2048x2048`、`3840x2160`、`2160x3840`。
- 自定义尺寸约束包括：宽高必须为 16 的倍数，最大边不超过 `3840`，总像素不超过 `8294400`，宽高比在允许范围内。
- 官方参考：[Image generation guide](https://platform.openai.com/docs/guides/image-generation#customize-image-output)、[gpt-image-2 model page](https://developers.openai.com/api/docs/models/gpt-image-2)

因此，如果官方 OpenAI API 直接返回 1K，需要另查账号、模型、端点或参数；但本次本机没有 `OPENAI_API_KEY`，只验证了 FHL 上游。

### 本次传言逐条判定

1. `size` 按 `auto` 或 `WIDTHxHEIGHT` 校验：属实。官方文档列出的约束是最大边不超过 `3840px`、宽高为 `16px` 倍数、长短边不超过 `3:1`、总像素 `655,360` 到 `8,294,400`。
2. 4K 横图用 `3840x2160`、4K 竖图用 `2160x3840`：属实。官方热门尺寸也列出这两个值；`4096x4096` 不合规，因为最大边超过 `3840`，总像素也超过 `8,294,400`。
3. `gpt-image-2` 不支持 `background: "transparent"`：属实。当前桌面版 Images API 请求没有发送 `background` 字段，所以这不是本项目 2K/4K 不生效的原因。
4. 编辑图片时不要传 `input_fidelity`：属实。官方文档说明 `gpt-image-2` 自动按高保真处理输入图，当前桌面版也没有发送 `input_fidelity` 字段。
5. 这些规则能解释 FHL 只回 1K 桶：不能。规则解释的是“什么请求会被官方 OpenAI 接收/拒绝”，而 FHL 实测是“请求已被接收，但上游返回内部固定像素档位”。

本项目当前要排除的错误原因：

- 不是 `9:16` 写法问题，`2160x3840` 是合法的 4K 竖图尺寸。
- 不是 `4096x4096` 误用，桌面版的 4K 选项是 `3840x2160` / `2160x3840`。
- 不是 `background: "transparent"`，请求 payload 未携带这个字段。
- 不是 `input_fidelity`，请求 payload 未携带这个字段。
- 不是桌面版在 `gpt-image-2` 下主动降档；前端和 CLI 的 FHL 稳定尺寸映射已对 `gpt-image-2` 豁免，首轮和重试都保留原始尺寸。

## FHL 实测结果

输出目录：

```text
output/diagnostics/fhl-1k2k4k-safe-probe-20260623-113159
output/diagnostics/fhl-1k-safe-retry-20260623-114613
output/diagnostics/fhl-2k4k-images-safe-20260623-121133
output/diagnostics/fhl-2k4k-images-high-safe-20260623-121841
output/diagnostics/fhl-2k4k-images-nonstream-safe-20260623-122205
```

| 请求尺寸 | 请求比例 | 实际返回 | 精确匹配 | 比例匹配 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `1024x1024` | 1:1 | `1254x1254` | no | yes | ok，单独重试成功 |
| `2048x2048` | 1:1 | `1254x1254` | no | yes | ok |
| `2880x2880` | 1:1 | `1254x1254` | no | yes | ok |
| `864x1536` | 9:16 | `941x1672` | no | yes | ok |
| `1152x2048` | 9:16 | `941x1672` | no | yes | ok |
| `2160x3840` | 9:16 | `941x1672` | no | yes | ok |

补测：Images API，安全抽象提示词，`quality=medium`，流式请求：

| 请求尺寸 | 请求比例 | 实际返回 | 精确匹配 | 比例匹配 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `2048x2048` | 1:1 | - | no | no | HTTP 524 |
| `2880x2880` | 1:1 | `1254x1254` | no | yes | ok |
| `2048x1152` | 16:9 | `1672x941` | no | yes | ok |
| `3840x2160` | 16:9 | `1672x941` | no | yes | ok |
| `1152x2048` | 9:16 | `941x1672` | no | yes | ok |
| `2160x3840` | 9:16 | `941x1672` | no | yes | ok |

补测：Images API，安全抽象提示词，`quality=high`，流式请求：

| 请求尺寸 | 请求比例 | 实际返回 | 精确匹配 | 比例匹配 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `2048x2048` | 1:1 | `1254x1254` | no | yes | ok |
| `3840x2160` | 16:9 | `1672x941` | no | yes | ok |
| `2160x3840` | 9:16 | `941x1672` | no | yes | ok |

补测：Images API，安全抽象提示词，`quality=medium`，非流式请求：

| 请求尺寸 | 请求比例 | 实际返回 | 精确匹配 | 比例匹配 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `2048x2048` | 1:1 | - | no | no | HTTP 524 |
| `3840x2160` | 16:9 | `1672x941` | no | yes | ok |
| `2160x3840` | 9:16 | `941x1672` | no | yes | ok |

规律：

- FHL 会尽量保留比例意图。
- FHL 不保证按请求像素返回。
- 方图 1K/2K/4K 当前都会落到 `1254x1254`。
- 16:9 的 2K/4K 当前都会落到约 `1672x941`。
- 9:16 的 1K/2K/4K 当前都会落到约 `941x1672`。
- `quality=high` 没有改变返回像素桶。
- `stream=false` 没有改变返回像素桶。
- `2048x2048` 有时会被 FHL/Cloudflare 524 超时；成功时仍是 `1254x1254`，不是 2K。
- 1K/2K/4K 对 FHL 当前链路更像“比例/档位意图”，不是强制像素输出。

## 已修复的桌面版请求链路

已同步修复：

- 前端 remote-kernel：`gpt-image-2` 保留 2K/4K 原始尺寸。
- Go CLI：`gpt-image-2` 保留 2K/4K 原始尺寸。
- dev proxy 调用的 `runtime/cli/gptcodex-image.exe` 已重新编译。
- retry：`gpt-image-2` 重试时不再把尺寸降到 1K，只调整 partial preview / quality 等兜底参数。
- 探针脚本新增 `safe` 提示词，便于复测尺寸而不受内容审计干扰。

## 复测命令

```powershell
cd image-studio/frontend
node .\scripts\probe-fhl-size-behavior.mjs --modes=images --sizes=1024x1024,2048x2048,2880x2880,864x1536,1152x2048,2160x3840 --prompts=safe --quality=medium
```

## 后续选择

如果目标是“请求必须按像素精确返回 2K/4K”，优先测试官方 OpenAI API 直连或其他明确支持精确像素的上游。

如果继续使用 FHL，当前能保证的是桌面版会把正确尺寸发出去；但最终文件需要精确 `2048x2048`、`2160x3840` 等像素时，建议生成后做本地 upscale/resize 到目标尺寸，并在 UI 上明确标注“上游返回尺寸”和“本地输出尺寸”。
