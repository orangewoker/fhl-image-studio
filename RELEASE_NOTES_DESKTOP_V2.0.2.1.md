# Desktop V2.0.2.1 Release Notes

## Summary

V2.0.2.1 is a desktop maintenance update after the V2.0.2 feature set. This build focuses on the aspect-ratio selection fix for FHL Responses / `gpt-image-2` and keeps the V2.0.2 desktop workflow, 360 tools, CLI, Skill, APIMart, and RunningHub bridge capabilities.

## Fixed

- Fixed unstable aspect-ratio matching when using FHL Responses with `gpt-image-2` and explicit size selection.
- Verified real generation results for `1:1`, `16:9`, `9:16`, `2:1`, and `1:2` in the Codex browser workflow.

## Added

- Added desktop E2E test mode for packaged EXE builds. `--e2e` opens the normal desktop window and a localhost browser mirror; `--e2e-only` starts only the browser mirror at `http://127.0.0.1:9230/`.
- Added safe frontend E2E hooks and DOM readiness markers so Codex browser automation can verify packaged UI loading, fill prompts, open settings, and regression-test common desktop flows.
- Documented the E2E startup command in `README.md` and `docs/desktop-e2e-test-mode.md`.

## Version Metadata

- Desktop display version: `V2.0.2.1`
- Wails product version: `2.0.2.1`
- Go CLI package version: `V2.0.2.1`
- Go CLI client version / User-Agent: `2.0.2.1`
- Codex Skill name: `fhl-image-studio-v2-0-2-1`
- Windows portable package name: `FHL-Image-Studio-Desktop-V2.0.2.1-Windows-Portable`

## Notes

- No API keys or private local settings should be included in release packages.
- RunningHub remains configured through the local `8117` bridge. RH keys are not written into the desktop package.
