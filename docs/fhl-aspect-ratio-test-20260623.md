# FHL 9:16 比例匹配测试记录

日期：2026-06-23

## 结论

这轮测试里，FHL 的两种 API 形态都能稳定生成接近 9:16 的竖幅图。

关键经验：

1. 比例控制主要靠请求参数 `size`，不是靠提示词里的“竖幅 / 9:16”措辞。
2. 上游会按自己的输出栅格归一化像素尺寸，所以不要把“实际像素必须等于 864x1536 或 1152x2048”当成成功标准。
3. 本轮四张测试图实际都输出为 `941x1672`，宽高比 `0.562799`；9:16 的目标比值是 `0.562500`，误差约 `0.053%`，可判定为比例匹配成功。
4. 如果最终交付必须是精确像素，例如 `864x1536`、`1080x1920`、`1152x2048`，建议生成后再做一次本地缩放/裁切到目标画布。
5. `HTTP 502` 是上游/Cloudflare 问题，不是比例参数失败；遇到时顺序重试，不要并发压测。

## 测试矩阵

| 编号 | FHL 形态 | 请求 size | 提示词是否写 9:16 | 实际链路 | 实际像素 | 比例误差 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Images API | `864x1536` | 是 | `images_api` | `941x1672` | `0.053%` | 成功 |
| 2 | Responses API | `1152x2048` | 是 | `final` | `941x1672` | `0.053%` | 成功 |
| 3 | Images API | `1152x2048` | 是 | 自动改走 Responses，`fhl_exact_size_via_responses:1152x2048` | `941x1672` | `0.053%` | 成功 |
| 4 | Images API | `864x1536` | 否 | `images_api` | `941x1672` | `0.053%` | 成功 |

## 实测命令

Images API 直接测试，推荐用这个确认 FHL Images 形态是否正常：

```bat
cmd /c "image-cli.cmd" --api-mode images --size 864x1536 --quality medium --prompt "A cute kitten fishing by a quiet river, children's book illustration, bright colors, simple safe scene."
```

Responses API 测试：

```bat
cmd /c "image-cli.cmd" --api-mode responses --size 1152x2048 --quality medium --prompt "A cute kitten fishing by a quiet river, vertical 9:16 children's book illustration, bright colors, simple safe scene."
```

Images API 请求 2K 9:16 时，本版本会自动改走 Responses：

```bat
cmd /c "image-cli.cmd" --api-mode images --size 1152x2048 --quality medium --prompt "A cute kitten fishing by a quiet river, vertical 9:16 children's book illustration, bright colors, simple safe scene."
```

原因在 CLI 逻辑：FHL `images` 形态只把 `864x1536` 等基础尺寸视作安全 exact size；`1152x2048` 会被标记为高风险 exact size，自动走 Responses 以提高稳定性。

## 可复用判断标准

使用宽高比判断，不用精确像素判断。

推荐标准：

```text
actualRatio = width / height
targetRatio = 9 / 16 = 0.5625
errorPct = abs(actualRatio - targetRatio) / targetRatio * 100
errorPct <= 1% 视为比例匹配成功
```

本轮实测：

```text
941 / 1672 = 0.562799
误差约 0.053%
```

## 复用到其他设备

1. 先在桌面 UI 里选择目标 FHL profile，并让 UI 同步 `config\cli.env.local`。
2. 用 CLI 顺序跑，不要并发：

```bat
cmd /c "image-cli.cmd" --api-mode images --size 864x1536 --quality medium --prompt "safe vertical test scene"
cmd /c "image-cli.cmd" --api-mode responses --size 1152x2048 --quality medium --prompt "safe vertical test scene, vertical 9:16"
```

3. 用无依赖脚本检查比例：

```bat
node scripts\check-image-ratio.mjs output\your-image.png 9:16
```

4. 如果 `passWithin1Pct=true`，说明比例目标成立。
5. 如果连续 3 次都是 `HTTP 502`、`rate_limit_exceeded` 或 `upstream_error`，先放弃本轮测试，换时间或换 profile；这不是提示词比例写法问题。

## 提示词写法建议

推荐把比例放在参数里：

```text
--size 864x1536
```

提示词里只做弱提醒：

```text
vertical 9:16 composition
```

不要依赖这些话强行控制像素：

```text
必须严格输出 1152x2048
不要改变尺寸
```

上游通常会保证接近目标比例，但不保证最终文件像素完全等于请求尺寸。
