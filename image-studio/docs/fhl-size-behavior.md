# FHL 图像尺寸规律记录

记录时间：2026-06-22 / 2026-06-23  
测试对象：FHL `https://www.fhl.mom`，`gpt-image-2`，`gpt-5.5`，`quality=medium`

## 结论

1. 这次 9:16 失败不是前端选择器写错。前端确实提交了 `1152x2048`。
2. 问题出在 FHL 上游对 Responses `image_generation` 工具的尺寸执行不稳定：请求 `1152x2048` 可能返回横图或非目标尺寸。
3. 提示词能影响构图方向，但不能保证最终像素。写上 `vertical 9:16 portrait image, tall canvas` 后，比例更容易接近 9:16，但尺寸仍会漂移。
4. FHL Images API 对 9:16 候选尺寸更稳定：一组 9:16 输入基本会返回约 `940x1670` 的竖图，比例接近 9:16，但不是精确像素。
5. 本项目已将 FHL + Images 模式下的 `1152x2048` / `2160x3840` 首轮稳定到 `864x1536`，避免继续绕到 Responses 生成横图。

## 关键证据

最近页面任务日志：

| 页面选择 | 前端提交 | 实际路由 | 上游返回 |
| --- | --- | --- | --- |
| 9:16 @ 2K | `1152x2048` | `fhl_exact_size_via_responses:1152x2048` | 多张 `1536x1024` 横图 |

直接 API 测试摘要：

| API | 提示词 | 请求尺寸 | 实际返回 | 结论 |
| --- | --- | --- | --- | --- |
| Responses | 普通小猫 | `1152x2048` | `1402x1122` | 尺寸和比例都不可靠 |
| Responses | 明确竖版 | `1152x2048` | `941x1672` | 比例接近 9:16，像素不精确 |
| Responses | 普通小猫 | `864x1536` | `1536x1024` | 会漂到横图 |
| Responses | 普通小猫 | `1024x1536` | `1536x1024` | 会漂到横图 |
| Images | 普通小猫 | `864x1536` | `941x1672` | 9:16 比例可用，像素不精确 |
| Images | 明确竖版 | `864x1536` | `941x1672` | 9:16 比例可用，像素不精确 |
| Images | 普通小猫 | `1024x1536` | `1024x1536` | 精确，但这是 2:3，不是 9:16 |
| Images | 明确竖版 | `1024x1536` | `1024x1536` | 精确，但这是 2:3，不是 9:16 |
| Images | 普通小猫 | `1024x1024` | `1254x1254` | 保持方图比例，像素不精确 |
| Images | 明确竖版 | `1024x1024` | `941x1672` | 提示词会覆盖方图倾向 |

Images 9:16 候选尺寸扫描：

| 请求尺寸 | 实际返回 |
| --- | --- |
| `720x1280` | `941x1672` |
| `768x1360` | `942x1670` |
| `864x1536` | `941x1672` |
| `896x1600` | `938x1676` |
| `960x1712` | `939x1675` |
| `1088x1936` | `940x1673` |
| `1152x2048` | `941x1672` |

规律：FHL Images 对 9:16 更像是“接受比例意图”，然后输出内部固定档位，不能按请求像素放大到 2K。

## 推荐策略

用户选择 9:16 时：

1. 优先走 FHL Images API，不优先走 Responses。
2. 对 FHL Images 的 9:16 大尺寸请求，使用 `864x1536` 作为稳定输入。
3. 提示词里仍建议补一句竖版约束，例如：`竖版 9:16 构图，tall portrait canvas, vertical composition`。
4. 不承诺精确输出 `1152x2048`。当前上游更可靠的结果是接近 `941x1672` 的 9:16 竖图。
5. 如果必须要精确像素，生成后再做本地裁切/缩放到目标尺寸。

## 复用测试方法

脚本位置：

```powershell
image-studio/frontend/scripts/probe-fhl-size-behavior.mjs
```

前提：

```text
image-studio/frontend/.local/fhl-api.local.json
```

里面配置 FHL `baseURL`、`apiKey`、`textModelID`、`imageModelID`。脚本输出会自动脱敏，不打印 API Key。

常用复测命令：

```powershell
cd image-studio/frontend
node .\scripts\probe-fhl-size-behavior.mjs --modes=images --sizes=720x1280,768x1360,864x1536,896x1600,960x1712,1088x1936,1152x2048 --prompts=portrait --quality=medium
```

对比 Responses：

```powershell
node .\scripts\probe-fhl-size-behavior.mjs --modes=responses --sizes=864x1536,1024x1536,1152x2048 --prompts=neutral,portrait --quality=medium
```

输出目录：

```text
output/diagnostics/fhl-size-probe-YYYYMMDD-HHMMSS/
```

每次测试会生成：

| 文件 | 用途 |
| --- | --- |
| `results.json` | 脱敏后的完整测试记录 |
| `summary.md` | 可读表格 |
| 生成图片 | 用于人工复核比例和内容 |

## 已应用到代码的规则

FHL + Images 模式下：

| 原始请求 | 实际发送 |
| --- | --- |
| `1152x2048` | `864x1536` |
| `2160x3840` | `864x1536` |

宽幅等其它未验证比例仍保持旧策略，不在本轮扩大修改范围。
