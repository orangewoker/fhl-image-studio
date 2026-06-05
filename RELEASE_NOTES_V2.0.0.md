# FHL Image Studio 方汤圆 CLI 魔改版 V2.0.0

## Download

Upload this asset to GitHub Releases:

```text
FHL-Image-Studio方汤圆CLI魔改版V2.0.0-发行版-20260605-152640.zip
```

## Highlights

- Portable Windows release package.
- FHL one-click Responses profile:
  - Base URL: `https://www.fhl.mom`
  - API mode: `responses`
  - Request policy: `openai`
  - Text model: `gpt-5.5`
  - Image model: `gpt-image-2`
- Text-to-image and image-to-image workflows.
- Stable multi-reference image-to-image workflow.
- Codex Skill support for calling the local CLI.
- Generated images should be previewed back in the Codex conversation.
- Browser storage isolation for release packages.
- API Key input hardening against old browser cache and password autofill.

## Security And Privacy

- No built-in API Key.
- No private `cli.env.local`.
- No `fhl-api.local.json`.
- No input images, output images, intermediate images, raw logs, job registry, or UI audit logs.
- Users must configure their own API Key after first launch.

## Recommended First Run

1. Extract the zip.
2. Run `一键启动FHL桌面版.cmd`.
3. Click `一键配置 FHL API`.
4. Paste your own API Key.
5. Run a small UI generation test before using the Codex Skill.

## Attribution

Based on `RoseKhlifa/Image-Studio`, licensed under MIT.
