---
name: fhl-image-studio-v2-0-2-1
description: Use when Codex should generate or edit images through the local FHL Studio V2.0.2.1 package, call its package-root `image-cli.cmd`, detect the current CLI status/profile, or operate the package across FHL Images API, APIMart, and RunningHub bridge profiles. Prefer this versioned V2.0.2.1 skill for local package workflows, profile-aware image generation, async polling, output log inspection, and release-package verification. Shared concurrency is a UI/profile setting; default CLI execution stays sequential, but after the first image-to-image reference or character anchor is created, ask the user whether follow-up images should run sequentially or in profile-limited parallel.
---

# FHL Studio Local CLI

Use the local package CLI instead of built-in image generation when this package is available.

## Resolve the package root

Use this order:

1. If the current directory contains `image-cli.cmd`, use the current directory.
2. If this skill is installed globally, read `PACKAGE_ROOT.txt` from the same directory as this `SKILL.md`; use that path only when it contains `image-cli.cmd`.
3. If `FHL_IMAGE_STUDIO_HOME` is set, use that package root only when it contains `image-cli.cmd`.
4. If the current directory contains `程序文件\image-cli.cmd`, use the current directory as a legacy package root.

After resolving the package root, run commands through Windows `cmd /c` from that package root:

```bat
cmd /c "cd /d ^"<packageRoot>^" && image-cli.cmd --status --json"
```

Do not run `image-cli.cmd` from an unrelated Codex project directory. The package root is the source of truth for `config\cli.env.local`, `input\`, `output\`, `output\log\`, and `intermediate\`.

This is the versioned skill for the FHL Studio V2.0.2.1 package line. Use `fhl-image-studio-v2-0-2-1` for this package; future package versions should install their own versioned skill so Codex can distinguish them.

## Correct user workflow

The user should configure API profiles in the desktop app before Codex generates images:

1. Open the package desktop app.
2. Configure and test FHL, APIMart, or RunningHub in the UI.
3. Run `安装CodexSkill.cmd` once to install this global skill and write `PACKAGE_ROOT.txt`.
4. Open any Codex project and use this skill.
5. Run the status command before generation so the current UI-synced API profile is used.

Do not ask the user to paste API keys into chat. The CLI follows the desktop app's synced config.

## Check package and API status first

Before generating or editing, run the package-root status command:

```bat
cmd /c "cd /d ^"<packageRoot>^" && image-cli.cmd --status --json"
```

Use the returned JSON as the source of truth for:

- `packageVersion`
- `apiMode`
- `baseURL`
- `requestPolicy`
- `textModel`
- `imageModel`
- `size`
- `quality`
- `inputDir`
- `outputDir`
- `rawDir`
- `apiKeyConfigured`
- `apiKeySource`

Never print or infer the actual API key. The status command only reports whether a key is configured. When `apiMode` is `runninghub`, `apiKeySource` should be `bridge`, and the RunningHub key lives in the local 8117 bridge module.

## Use UI-first configuration

Before relying on CLI on a machine, open the desktop UI first:

```bat
cmd /c "cd /d ^"<packageRoot>^" && ^"一键启动FHL Studio V2.0.2.1.cmd^""
```

Then let the user do profile setup in the UI:

- choose the intended upstream profile
- paste their own API key into the UI
- run a connection test or one generation

The UI syncs the active profile into `config\cli.env.local`.

Do not ask the user to paste API keys into chat. Do not print or expose key values.
If the user says the UI connection test already succeeded, treat that as sufficient and use the CLI directly from the current `config\cli.env.local`. Do not ask them to repeat profile setup or re-enter base URL, API mode, model IDs, or API keys unless the CLI itself reports missing or invalid config.

## Current upstream source of truth

- `config\cli.env.local` is the current active CLI config when present.
- It may point to FHL, APIMart, or RunningHub.
- `config\cli.env.example` is only the fallback example config.
- Do not hardcode `baseURL`, `apiMode`, or model IDs when `cli.env.local` is present.
- If the user changes API profile in the desktop UI, run `image-cli.cmd --status --json` again before the next generation.

## Run the CLI

Text-to-image:

```bat
cmd /c "cd /d ^"<packageRoot>^" && image-cli.cmd --prompt ^"cinematic portrait^" --size 1024x1024 --quality medium"
```

APIMart text-to-image with the current synced profile:

```bat
cmd /c "cd /d ^"<packageRoot>^" && image-cli.cmd --prompt ^"vertical story illustration^" --size 9:16@1k --quality medium"
```

RunningHub text-to-image with the current synced bridge profile:

```bat
cmd /c "cd /d ^"<packageRoot>^" && image-cli.cmd --api-mode runninghub --prompt ^"clean product photo^" --size 16:9@1k --quality medium"
```

Image-to-image:

```bat
cmd /c "cd /d ^"<packageRoot>^" && image-cli.cmd --mode edit --image ^"input\ref.png^" --prompt ^"keep the subject identity and change the scene^""
```

Multi-reference edit:

```bat
cmd /c "cd /d ^"<packageRoot>^" && image-cli.cmd --mode edit --image ^"input\main.png^" --image ^"input\ref2.png^" --prompt ^"use the first image as the main subject and the later images as references^""
```

## APIMart behavior

When `cli.env.local` sets `IMAGE_STUDIO_API_MODE=apimart`, the CLI should:

- submit `POST /v1/images/generations`
- upload edit sources first when needed
- poll `GET /v1/tasks/{task_id}?language=zh`
- download the final image result without resubmitting the task

## RunningHub behavior

When `cli.env.local` sets `IMAGE_STUDIO_API_MODE=runninghub`, the CLI should:

- use the bridge URL from `IMAGE_STUDIO_UPSTREAM_BASE_URL`, normally `http://127.0.0.1:8117`
- not require or print a local API key; the RunningHub key lives in the bridge module
- submit `POST /api/generate`
- upload edit sources with `POST /api/upload`
- poll `GET /api/task?id=...`
- download the final image through `GET /api/image?url=...`

## Concurrency rule

Treat concurrency as package/UI semantics, not a default CLI behavior.

- Default to one CLI task at a time.
- For story sets, character-consistency work, or image-to-image batches, create the first reference, character anchor, or first accepted source image sequentially before launching later images.
- After that first reference exists, ask the user to choose:
  - sequential generation for the most stable continuity
  - parallel generation up to the current UI/profile shared concurrency limit for faster output
- Only run multiple CLI tasks in parallel when the user chooses parallel mode or explicitly asks for concurrent testing or pressure testing.
- Never exceed the current profile's shared concurrency limit when orchestrating parallel CLI calls.

## Result handling

Read the final stdout JSON.

Important fields:

- `ok`
- `imagePath`
- `rawPath`
- `sourceEvent`
- `elapsedSec`

Every successful CLI image generation must be sent back into the Codex conversation.

- After each CLI command returns `ok:true` with an `imagePath`, immediately post that image with a Markdown image tag and an absolute local path.
- For multi-image story sets or batches, return each completed image as it finishes instead of only listing paths at the end.
- Do not make the user open the folder manually to inspect the result unless the image file cannot be displayed in Codex.

If generation fails, summarize the error and mention `rawPath` when present.

## Useful logs

- `output\log\`
- `output\log\ui-audit\`

Inspect these before guessing about package or browser-side failures.
