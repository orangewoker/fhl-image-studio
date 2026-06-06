---
name: fhl-image-studio
description: Use when the user asks Codex to generate images with the local FHL Image Studio 方汤圆 CLI 魔改版 V2.0.0 package, call its image-cli.cmd, do text-to-image, image-to-image, multi-reference image generation, character locking, role consistency, aspect-ratio tests, deploy or verify the 方汤圆 V2 release package, or preview generated CLI output. Prefer this over built-in imagegen for this FHL 方汤圆 workflow.
---

# FHL 方汤圆 V2 CLI

Use the local FHL Image Studio CLI. Do not prefer the built-in `imagegen` tool for this workflow.

## Resolve the tool root

1. If the current directory contains `程序文件\image-cli.cmd`, use the current directory as `FHL_IMAGE_STUDIO_HOME`.
2. If `FHL_IMAGE_STUDIO_HOME` is set, use `%FHL_IMAGE_STUDIO_HOME%\程序文件\image-cli.cmd`.
3. If neither works, tell the user to open the package root in Codex or set it once:

```bat
setx FHL_IMAGE_STUDIO_HOME "D:\path\to\FHL-Image-Studio方汤圆CLI魔改版V2.0.0-发行版"
```

Run CLI commands through Windows `cmd /c`.

## UI-first configuration rule

Before using CLI on a new machine, require the user to run the desktop UI first:

```bat
cmd /c "%FHL_IMAGE_STUDIO_HOME%\一键启动FHL桌面版.cmd"
```

The user should click `一键配置 FHL API`, paste their own API Key in the UI, then test the API or run one UI generation. The UI syncs the full FHL CLI config into `程序文件\config\cli.env.local`.

Do not ask the user to paste an API Key into chat. Do not print, quote, or inspect API Key values. If CLI says the key is missing, send the user back to the UI-first configuration flow. Manual editing of `cli.env.local` is only a fallback if UI sync fails.

## Correct generation flow

For story sets or reusable characters, start with a character setting before any image command:

- Lock stable appearance, age, body language, clothing, expression range, and anti-drift rules.
- If there is no reference image, first generate a character reference / 定妆图.
- For later image-to-image work, put the reference image in `input\` or pass a real absolute image path with `--image`.
- Keep multi-image or multi-prompt work sequential. Never run multiple CLI generations in parallel.

Text-to-image:

```bat
cmd /c "%FHL_IMAGE_STUDIO_HOME%\程序文件\image-cli.cmd" --prompt "人物设定 + 场景描述" --size 1024x1024 --quality medium
```

Image-to-image:

```bat
cmd /c "%FHL_IMAGE_STUDIO_HOME%\程序文件\image-cli.cmd" --mode edit --image "%FHL_IMAGE_STUDIO_HOME%\input\ref.png" --prompt "保持人物一致，按要求修改场景"
```

Multi-reference image-to-image:

```bat
cmd /c "%FHL_IMAGE_STUDIO_HOME%\程序文件\image-cli.cmd" --mode edit --image "%FHL_IMAGE_STUDIO_HOME%\input\main.png" --image "%FHL_IMAGE_STUDIO_HOME%\input\ref2.png" --prompt "第 1 张为主图，后续为参考图，保持人物一致"
```

## Result handling

Read the final stdout JSON. The important fields are `ok`, `imagePath`, `sourceEvent`, `rawPath`, and `elapsedSec`.

- `sourceEvent:"final"` is a final deliverable image and should be under `output\`.
- Any `sourceEvent` containing `partial` is an intermediate image and should be under `intermediate\`; label it as non-final.
- Always send the generated image back into the Codex conversation with Markdown image syntax and an absolute local path:

```md
![生成图预览](D:/absolute/path/output/example.png)
```

If generation fails, summarize the error and mention `rawPath` if present. For browser UI issues, inspect `output\log\ui-audit\index.v1.json` and the latest `session-*.md` before guessing.
