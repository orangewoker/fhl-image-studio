# Android V2.0.2 Codex Handoff Log

Last updated: 2026-06-22

Read this file first when starting a new Codex task for the Android V2.0.2 upgrade.
It is intentionally ASCII-only so shell output stays readable on Windows.

## Scope

- Repo root: current `fhl-image-studio` Android development repository.
- Modify the Android version only.
- Desktop version is reference only. Do not modify desktop files unless the user explicitly confirms a shared-contract change.
- Do not revert existing dirty worktree changes.
- APIMart generation chain should not be changed unless the user explicitly asks.
- For non-trivial debugging or implementation, use `$karpathy-guidelines`.
- For Android validation, prefer `test-android-apps` skills and collect screenshots, UI tree, logcat, crash buffer, and performance evidence.

## Current User-Facing Upgrade State

- Android UI is being aligned toward desktop V2.0.2 while keeping phone/tablet-specific layouts.
- FHL and APIMart one-click configurations both exist.
- Text-model features depend on FHL/GPT-5.5 even if the active image API is APIMart.
- Continuous generation is enabled by default with unlimited API concurrency in the UI.
- Android image generation is moving toward native background execution so tasks can continue after the app leaves the foreground.
- Generated originals should be saved to the phone gallery automatically.
- Latest phone test APK:
  `android-test-builds/FHL-Image-Studio-V2.0.2-Android-phone-test-20260622-001009.apk`
  SHA256: `80D0B45048E29CA8FCC7B375682FF780983A020C7D1B1F95659165E1092964C1`

## Important Product Decisions

- API labels:
  - One-click FHL must show `FHL`.
  - One-click APIMart must show `APIMart`.
  - Manual/other configs may show their own shape or profile label.
- Settings wording:
  - Old Android wording for the Responses shape is `Responses API` / `Responses`.
  - The relay compatibility policy label belongs to request-policy wording, not the API shape name.
- FHL default request shape:
  - User asked to restore the old V2.0.1-style `Responses API SSE keepalive (recommended for CF timeout)` behavior for FHL.
  - Keep async/background support.
  - Do not change APIMart while adjusting FHL.
- Text-model features:
  - AI prompt optimization, reverse prompt, and instruction-based prompt rewrite should use FHL/GPT-5.5.
  - If FHL is not configured, show a user-facing message asking the user to configure FHL API.
- Image-to-image mode:
  - If the user manually switches to image-to-image, deleting all reference images must not return to text-to-image.
  - The reference image upload area should remain resident in image-to-image mode.
- Canvas:
  - The old empty import card should not appear.
  - The canvas page should not show the polling floating overlay because progress is already visible on the home/result preview area.
  - Single-image results should show the API label chip just like other modes.

## Main Changes Already Made

### Android Compose and Prompt UI

- Phone and tablet prompt panels were adjusted toward the desktop layout.
- Prompt collapse/expand:
  - Expanded prompt box should show as much text as practical.
  - Collapsed preview should be scrollable.
  - Controls outside the prompt box should stay visible regardless of prompt collapse state.
  - Button wording should use full labels equivalent to "collapse prompt box" and "expand prompt box".
- Manual fixed prompt area was changed away from button-like layout toward desktop-style vertical layout.
- Instruction-based prompt rewrite was added to Android prompt UI:
  - Persistent block after main prompt/action buttons and before parameter area.
  - Fields/actions: title, guidance input placeholder, clear, precise rewrite.
  - Should not be hidden by prompt-box collapse.
  - Should be usable while image generation is running.

### Reverse Prompt

- Android reverse prompt sheet was styled for dark mode.
- Reverse image preview/upload was changed away from tiny `384px` preview behavior toward clearer 1536-side preview/upload handling.
- The reverse-image work button was made more visually obvious with a breathing yellow highlight while active.
- Reverse prompt should use FHL/GPT-5.5, not APIMart.

### API Configuration

- One-click config buttons should be highlighted/blinking when default config is empty.
- Visible text should read as one-click config for FHL/APIMart.
- If both APIs are configured, tapping the active API selector should open the API selection sheet instead of returning to one-click config.
- If only one API is configured, the selector should not show a dropdown arrow.
- If both APIs are configured, the selector should show a dropdown arrow.

### Continuous Generation and Concurrency

- Continuous generation should behave like desktop:
  - When enabled, the normal image count above should be hidden/ignored.
  - The number of produced images is controlled by how many times the user clicks Generate.
  - Shared concurrency limit is visible and adjustable.
- Running append CTA was widened; cancel button was compressed and made bright red.
- Android defaults enable continuous generation with unlimited concurrency.
- Continuous append metadata is preserved:
  - `requestRunId`
  - `continuousBatchIndex`
  - `batchVariationKey`
  - per-slot `jobId`
- Each generated slot should have isolated variation markers to reduce duplicated returns and cross-batch confusion.

### Canvas and Batch Results

- Fixed issue where one Generate click could show four spinning slots after earlier batches completed or failed.
- Root causes:
  - Old terminal `workspaceJobGroups` were still included in visible canvas slot calculations.
  - FHL Responses/SSE could receive a final image but stay `running` while waiting for a later stream completion event.
- Fixes:
  - `AndroidCanvasStage.tsx` exports `androidCanvasScopedJobGroups`, `androidJobGroupHasLiveSlots`, and `androidJobGroupSlotCount`.
  - Running canvas only uses live queued/running groups.
  - Idle canvas uses only the latest group, so old failed/completed groups do not pollute the current batch.
  - `AndroidCanvasWorkspace.tsx` uses scoped groups for batch slot count.
  - `AndroidJobManager.kt` completes a Responses/SSE slot immediately when a final image event is seen.
- Failed continuous job slots should remain visible after running state clears.
- Canvas current-image actions were added or improved:
  - detail
  - save original
  - copy image
  - share image
  - set as source
  - clear canvas

### Android Native Background Jobs

- Android native background jobs are intended to take over all image generation APIs so the WebView does not have to stay foregrounded.
- `AndroidJobService` / `AndroidJobManager` are the main native task path.
- Registry and payload persistence are used to restore queued/running/succeeded state.
- Queue audit logging was added:
  - App-private path: `files/jobs/android-job-audit.v1.jsonl`
  - Records generation clicks and slot lifecycle without API keys, full prompts, or image data.
  - Useful for diagnosing real-phone manual operations: API mode, API label, size, batch count, run ID, slot ID, status, saved path presence.
- Android originals are published to the system gallery after successful slot completion.

### Gallery Save

- Successful native job slots should save:
  - internal `savedPath`
  - preview/thumb metadata
  - original image published into phone gallery through MediaStore
  - `galleryUri` in the slot where possible

### UI and Styling

- Dark mode fixes were made around reverse prompt, Android settings/upstream UI, and readability.
- Canvas waiting state avoids expensive blur/checker animations.
- Heavy Android panes are only mounted when active.
- Phone touch scrolling was worked on so prompt/text areas can still allow page scrolling on real devices.

## Tests and Builds Run Recently

These commands passed during the latest handoff/build cycle:

```powershell
cd image-studio/frontend
node --test .\test\androidCanvasActions.test.mjs .\test\androidConcurrency.test.mjs .\test\androidBackgroundJobs.test.mjs
```

Result: 30 tests passed.

```powershell
cd image-studio/frontend
npm run build:android
```

Result: passed. Vite reported a chunk-size warning only.

```powershell
cd android-shell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat assembleDebug
```

Result: passed.

The APK was installed and launched in emulator `emulator-5554`; crash buffer was empty.

## Latest Artifact Paths

- Latest phone test APK:
  `android-test-builds/FHL-Image-Studio-V2.0.2-Android-phone-test-20260622-001009.apk`
- APK smoke-test evidence:
  `C:\Users\TANG\AppData\Local\Temp\fhl-phone-test-smoke-20260622-001059`
- Canvas batch investigation evidence:
  `C:\Users\TANG\AppData\Local\Temp\fhl-android-canvas-batch-20260621-230351`

## Useful Debug Commands

Read recent Android native job audit from emulator:

```powershell
$adb='C:\Users\TANG\AppData\Local\Android\Sdk\platform-tools\adb.exe'
$pkg='top.fangtangyuan.fhlstudio.android.debug'
& $adb -s emulator-5554 shell run-as $pkg tail -n 80 files/jobs/android-job-audit.v1.jsonl
```

List current job registry:

```powershell
$adb='C:\Users\TANG\AppData\Local\Android\Sdk\platform-tools\adb.exe'
$pkg='top.fangtangyuan.fhlstudio.android.debug'
& $adb -s emulator-5554 shell run-as $pkg ls -l files/jobs
```

Capture crash buffer:

```powershell
$adb='C:\Users\TANG\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb -s emulator-5554 logcat -b crash -d
```

## Known Risks / Follow-Up

- Do not run paid live generation tests unless the user allows API usage.
- One live validation showed a single Generate click produced one visible slot; after that, the native SSE early-final fix was added and built, but another paid live request was not run.
- If duplicated real images still occur on phone, inspect `android-job-audit.v1.jsonl` first:
  - Confirm one click produces the expected `batchCount`.
  - Confirm each slot has distinct `jobId`, `requestRunId`, and `batchVariationKey`.
  - Confirm final result writes only to its own `jobId`.
- If phone background generation still aborts, check whether the route used native `AndroidJobService` or WebView foreground fetch/SSE.
- If the user reports missing gallery saves, check native slot fields `savedPath` and `galleryUri`, then inspect Android MediaStore publish logs.
- If UI behaves differently on real phone than emulator, prioritize touch/scroll handling and collect a screen recording plus UI tree/logcat.

## Files Often Involved

- Android phone compose:
  `image-studio/frontend/src/platform/android/AndroidPhoneComposePanel.tsx`
- Android pad compose:
  `image-studio/frontend/src/platform/android/AndroidPadComposePanel.tsx`
- Android canvas stage:
  `image-studio/frontend/src/platform/android/canvas/AndroidCanvasStage.tsx`
- Android canvas workspace:
  `image-studio/frontend/src/platform/android/canvas/AndroidCanvasWorkspace.tsx`
- Android settings:
  `image-studio/frontend/src/platform/android/settings/AndroidSettingsPanel.tsx`
- Android upstream config:
  `image-studio/frontend/src/platform/android/upstream/useAndroidUpstreamConfig.ts`
- Runtime/background contracts:
  `image-studio/frontend/src/platform/runtime/browserJobContracts.ts`
  `image-studio/frontend/src/platform/runtime/hostTypes.ts`
- Store/runtime:
  `image-studio/frontend/src/state/studioStore.ts`
  `image-studio/frontend/src/state/browserJobs.ts`
- Native Android jobs:
  `android-shell/app/src/main/java/top/gptcodex/imagestudio/android/AndroidJobManager.kt`
  `android-shell/app/src/main/java/top/gptcodex/imagestudio/android/AndroidJobService.kt`
  `android-shell/app/src/main/java/top/gptcodex/imagestudio/android/AndroidImageStudioBridge.kt`
- Common Android tests:
  `image-studio/frontend/test/androidCanvasActions.test.mjs`
  `image-studio/frontend/test/androidConcurrency.test.mjs`
  `image-studio/frontend/test/androidBackgroundJobs.test.mjs`
  `image-studio/frontend/test/androidPromptCompose.test.mjs`
  `image-studio/frontend/test/androidReversePrompt.test.mjs`
  `image-studio/frontend/test/androidConfiguredState.test.mjs`


## 2026-06-28 Continuation Log

This section summarizes the Android V2.0.2 work discussed after the 2026-06-22 handoff. It exists so a new Codex task can continue without reading the whole chat thread.

### What changed since the previous handoff

- Android V2.0.2 is now the active Android upgrade target. Desktop V2.0.2 remains the reference, but Android implementation should stay mobile-specific.
- RunningHub was brought into the Android API configuration flow:
  - One-click RH entry exists in Android upstream config.
  - Android emulator RH bridge URL should use `http://10.0.2.2:8117`.
  - RH Key remains in the local 8117 bridge module. Android profile does not store the RH Key.
  - Supported RH model keys are `banana2` and `image_g2`.
  - Android configured-state gates accept RH bridge profiles as usable even without a local API key.
- Android native background job path was expanded so image generation routes through native jobs instead of keeping WebView fetch/SSE alive:
  - FHL Responses / Images.
  - APIMart submit, resume, poll, recovery.
  - RunningHub text-to-image and image-to-image.
- Phone-safe concurrency protection is in place:
  - Default native parallel jobs: 1.
  - Max native parallel jobs: 2.
  - UI/profile concurrency is clamped for Android.
  - This is a deliberate heat and jank mitigation. Do not reopen default concurrency to 3+ without real-device thermal evidence.
- Continuous generation is still default-on, but Android now treats it as append-one-more behavior under the concurrency guard.
- Result and canvas flow was adjusted toward the desktop result workflow:
  - Current image dock exposes detail, save original, copy image, share image, set as source, and clear canvas actions.
  - Batch/result grids keep live and failed slots visible with per-slot API labels and pixel-size chips.
  - The live polling overlay is hidden on the canvas page because progress is already visible in the result/compose surface.
- History was upgraded for mobile continuation work:
  - Recent job groups render in Android history like desktop history.
  - Failed/cancelled/running job slots expose apply params, regenerate, and APIMart query actions where applicable.
  - History copy-image actions use Android-friendly copy/share/save paths.
- Prompt and source image workflow was further aligned with desktop:
  - Prompt collapse/expand, prompt prefix, main prompt, and instruction rewrite are present on phone and pad.
  - Prompt text tools use FHL/GPT-5.5 and should not silently use APIMart.
  - Reverse prompt can run while generation is active and can use current image/source fallback.
  - Android picker/reverse prompt preview keeps higher detail around 1536px.
  - Explicit image-to-image mode keeps the source upload area visible even after all references are removed.
- APIMart recovery and error guidance were strengthened:
  - Failed/interrupted APIMart tasks can be queried by existing task id without resubmitting.
  - Android native APIMart probe falls back from official IPv6-prone host to the legacy host when needed.
  - Transient upstream errors can recommend switching API configuration, especially to APIMart async.
- Gallery save behavior is tracked:
  - Successful native jobs publish originals into `Pictures/ImageStudio` through MediaStore where possible.
  - Slots should preserve `savedPath` and `galleryUri`.
- Android workspace header was simplified:
  - Legacy mobile workspace tag/sheet entry is hidden from the phone header.
  - Heavy panes mount only when active to reduce WebView memory and jank.

### 2026-06-28 RunningHub live evidence

The following evidence files are outside this repo root but in the same workspace. Use them before rerunning paid tests:

- RH banana2 text-to-image success:
  `I:\AI\Image-Studio\android-test-builds\v202-rh-banana2-final-success-ui.png`
  `I:\AI\Image-Studio\android-test-builds\v202-rh-banana2-final-success-log.txt`
- RH image_g2 text-to-image success:
  `I:\AI\Image-Studio\android-test-builds\v202-rh-g2-final-success-ui.png`
  `I:\AI\Image-Studio\android-test-builds\v202-rh-g2-final-success-log.txt`
- RH banana2 image-to-image success:
  `I:\AI\Image-Studio\android-test-builds\v202-rh-banana2-img2img-final-success-ui.png`
  `I:\AI\Image-Studio\android-test-builds\v202-rh-banana2-img2img-final-success-log.txt`
- RH banana2 image-to-image direct-bytes success:
  `I:\AI\Image-Studio\android-test-builds\v202-rh-banana2-img2img-directbytes-final-ui.png`
  `I:\AI\Image-Studio\android-test-builds\v202-rh-banana2-img2img-directbytes-final-log.txt`

### Current Android test coverage added or used

Common test files for this phase:

- `image-studio/frontend/test/androidConfiguredState.test.mjs`
- `image-studio/frontend/test/androidConcurrency.test.mjs`
- `image-studio/frontend/test/androidBackgroundJobs.test.mjs`
- `image-studio/frontend/test/androidApimartRecovery.test.mjs`
- `image-studio/frontend/test/androidCanvasActions.test.mjs`
- `image-studio/frontend/test/androidHistoryJobGroups.test.mjs`
- `image-studio/frontend/test/androidHistoryTimeline.test.mjs`
- `image-studio/frontend/test/androidHistoryImageCopy.test.mjs`
- `image-studio/frontend/test/androidImageUpload.test.mjs`
- `image-studio/frontend/test/androidPixelSizeBadges.test.mjs`
- `image-studio/frontend/test/androidPromptCompose.test.mjs`
- `image-studio/frontend/test/androidReversePrompt.test.mjs`
- `image-studio/frontend/test/androidSettingsPresets.test.mjs`
- `image-studio/frontend/test/androidWorkspaceSheet.test.mjs`
- `image-studio/frontend/test/androidSizeSelection.test.mjs`

Useful focused command:

```powershell
cd image-studio/frontend
node --test .\test\androidConfiguredState.test.mjs .\test\androidConcurrency.test.mjs .\test\androidBackgroundJobs.test.mjs .\test\androidApimartRecovery.test.mjs .\test\androidCanvasActions.test.mjs .\test\androidPromptCompose.test.mjs .\test\androidReversePrompt.test.mjs
```

Full frontend command:

```powershell
cd image-studio/frontend
npm test
npm run build:android
```

Android build command:

```powershell
cd android-shell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat assembleDebug
```

### Performance and heat direction

- Customer feedback reported Android heat and jank under generation and multi-concurrency.
- Treat default concurrency 1 / max 2 as a product constraint until real-device thermal testing says otherwise.
- Prefer native job events, small state deltas, file paths, and thumbnails over pushing full base64/data URLs through WebView state.
- Keep heavy canvas/history/settings panes unmounted when inactive.
- For performance validation use emulator for flow regression, but real phone for heat. Capture:
  - `adb shell dumpsys gfxinfo <package>`
  - `adb shell dumpsys meminfo <package>`
  - `adb shell dumpsys thermalservice`
  - logcat and screenshots around long generation runs.

### Important open checks for the next Codex task

- Rebuild a fresh APK after the latest repo changes; do not assume the 2026-06-22 APK contains all 2026-06-28 changes.
- Verify Android UI text encoding. Some shell output can show mojibake, but user-visible strings in the APK must be readable Chinese.
- Re-run at least one no-cost/static build cycle before more paid live generation.
- If testing RH from emulator, ensure the desktop bridge is running and use `10.0.2.2:8117`, not `127.0.0.1:8117` from inside the emulator.
- If testing on a real phone, bridge access needs LAN host/IP routing rather than emulator-only `10.0.2.2`.
- 360 advanced desktop features are not yet fully ported to Android. Keep them as phase 2 unless the user explicitly prioritizes them.

## 2026-06-28 Release Preparation Log

- Android release name: `FHL Image Studio Fangtangyuan Edition V2.0.2`; user-visible Chinese label: `FHL Image Studio 方汤圆版 V2.0.2`.
- The result module should stay high priority on mobile. The user specifically noted that result details are important, ordered, and easier to review when not pushed below bulky collapsible generation controls on phones.
- Gallery publishing was checked in the current code path: successful native jobs publish originals through MediaStore into `Pictures/ImageStudio` where possible, and slots keep `galleryUri`.
- Release builds must start with no configured API key. Do not bundle FHL keys, APIMart keys, RunningHub keys, local bridge secrets, generated images, local profiles, raw logs, or native job audit files.
- RunningHub remains bridge-first for Android. The emulator URL is `http://10.0.2.2:8117`; RH Key stays in the desktop/local 8117 bridge module and is not saved as an Android key.
- The local release keystore should live under `.local/android-release/` and remain ignored by Git. Future Android upgrades must reuse the same keystore.
- GitHub release target: tag `v2.0.2-android`, title `FHL Image Studio 方汤圆版 V2.0.2 Android`, assets named `FHL-Image-Studio-方汤圆版-V2.0.2-Android-Release-YYYYMMDD.apk` and `.zip`.
- Desktop 360/Panorama is confirmed present in the desktop V3/V2.0.2 line but intentionally not ported to Android for this release.
- Release validation completed on 2026-06-28: `npm test` passed with 205 tests, `npm run build:android` passed, `assembleRelease` passed with the local release keystore, `apksigner` verified v2 signing, `aapt` confirmed package/version/label, and emulator `emulator-5554` installed/launched the release APK with an empty crash buffer.
- Release assets generated under ignored `release-assets/`: `FHL-Image-Studio-方汤圆版-V2.0.2-Android-Release-20260628.apk` SHA256 `775E035F266BAAFEACD8C93EB8D67CA405B6F71E5A0FF89F0E2E5F096BB21475`, and matching ZIP SHA256 `33867FE2E8FE475803B4957E855E159C76B5DB3022062A854895DB2222C1D8A2`.

## 2026-06-29 Android V2.0.2.1 Alignment Log

- Scope: sync the desktop V2.0.2.1 FHL Responses / `gpt-image-2` aspect-ratio fix into Android only. Desktop release packages were not touched, GitHub was not uploaded, and configured API keys were not cleared.
- Version alignment:
  - Android Gradle version is now `V2.0.2.1` with debug `versionNameSuffix=-debug` and `versionCode=1050002`.
  - Android app label, frontend header brand, Android about sheet, and Android compatibility matrix now display `FHL Image Studio 方汤圆版 V2.0.2.1`.
- Request-path alignment:
  - Android WebView and remote-kernel paths reuse `shared/kernel/requestModel.js`, so the shared desktop FHL aspect fix enters Android payload construction.
  - Android native background jobs in `AndroidJobManager.kt` now mirror the shared behavior for FHL Responses + `gpt-image-2` + explicit size.
  - The old Android workaround that forced custom FHL Responses sizes through Images was removed.
- FHL Responses / `gpt-image-2` explicit-size behavior:
  - Keep explicit pixel sizes on the `responses` route.
  - Disable `partial_images` by sending `partial_images=0`.
  - Add exact-size English instruction text plus Chinese ratio constraints for square, landscape, and portrait choices.
  - Add visible FHL `2:1` and `1:2` size choices.
- APIMart and RunningHub:
  - APIMart / RunningHub ratio semantics remain independent.
  - No change converts APIMart or RunningHub ratio parameters into FHL pixel sizes.
- Verification completed:
  - `npm test` passed with 213 tests.
  - `npm run build:android` passed with the existing Vite large chunk warning only.
  - `cd android-shell && .\gradlew :app:assembleDebug` passed.
  - `aapt dump badging` confirmed package `top.fangtangyuan.fhlstudio.android.debug`, `versionCode=1050002`, `versionName=V2.0.2.1-debug`, and label `FHL Image Studio 方汤圆版 V2.0.2.1`.
  - The debug APK installed and launched on emulator `emulator-5554`; logcat showed no `AndroidRuntime` fatal crash or ANR.
- Live emulator FHL Responses ratio evidence from `.tmp/android-v2.0.2.1-aspect-qa-results.json`:
  - Text-to-image `1:1`: requested `1024x1024`, route `responses`, actual `1254x1254`, passed.
  - Text-to-image `16:9`: requested `1536x864`, route `responses`, actual `1672x941`, passed.
  - Text-to-image `9:16`: requested `864x1536`, route `responses`, actual `941x1672`, passed.
  - Text-to-image `2:1`: requested `1536x768`, route `responses`, actual `1774x887`, passed.
  - Text-to-image `1:2`: requested `768x1536`, route `responses`, actual `887x1774`, passed.
- Image-to-image and batch coverage:
  - Live single image-to-image `9:16` used route `responses`, saved as `responses-edit`, produced `941x1672`, and passed.
  - Live batch image-to-image with `batchCount=2` was blocked by the Android Responses concurrency guard: `当前还可提交 1 个，本次需要 2 个`.
  - Batch image-to-image payload behavior is covered by the updated unit test instead.
- Evidence files:
  - Manual test APK copy: `I:\AI\Image-Studio\android-test-builds\FHL-Image-Studio-方汤圆版-V2.0.2.1-Android-Debug-20260629.apk`
  - `release-assets/evidence-v2.0.2.1-android/android-v2.0.2.1-launch.png`
  - `release-assets/evidence-v2.0.2.1-android/android-v2.0.2.1-after-aspect-qa.png`
  - `release-assets/evidence-v2.0.2.1-android/android-v2.0.2.1-img2img-batch-blocked.png`
  - `.tmp/android-v2.0.2.1-aspect-qa-results.json`
  - `.tmp/android-v2.0.2.1-img2img-qa-results.json`
- Device note:
  - Emulator flow validation was completed.
  - Real-phone heat and long-run thermal observation were not completed because no real device was confirmed connected in this pass.

### 2026-06-29 Background Completion Notification Patch

- Added native background completion notifications for Android jobs:
  - `AndroidJobNotifications.kt` owns the generation notification channel, foreground-service notification, success notification, and failure notification.
  - Successful native jobs now post `图片已生成` with `已保存到相册 Pictures/ImageStudio，点此回到结果。` when a gallery URI is available.
  - Failed native jobs now post `图片生成失败` so background failures are visible without waiting for WebView polling.
  - Notification taps reopen `MainActivity`.
- Added foreground-return recovery:
  - `MainActivity.onResume()` still calls `AndroidJobManager.resumePendingWork(applicationContext)` and now calls `refreshAndroidJobsForPage()`.
  - `refreshAndroidJobsForPage()` invokes `AndroidJobManager.attach(applicationContext)` and dispatches `image-studio:android-jobs-resume` into the WebView.
  - `androidJobClient.ts` now reattaches native job events on `focus`, `pageshow`, `visibilitychange`, and `image-studio:android-jobs-resume`.
- Verification completed:
  - `npm test` passed with 215 tests.
  - `npm run build:android` passed with the existing Vite large chunk warning only.
  - `cd android-shell && .\gradlew :app:assembleDebug` passed; Kotlin warnings were existing deprecated Android API warnings.
  - `aapt dump badging` confirmed package `top.fangtangyuan.fhlstudio.android.debug`, `versionCode=1050002`, `versionName=V2.0.2.1-debug`, and label `FHL Image Studio 方汤圆版 V2.0.2.1`.
  - Installed the debug APK on emulator `emulator-5554` and granted `POST_NOTIFICATIONS`.
- Live emulator background generation evidence:
  - Scenario: start a real FHL Responses generation in the foreground, wait until the native job enters `running`, press Home, wait with the app in the background, then relaunch.
  - Result: job `android-job-2735d8ef-9ee8-4882-b03f-3a5b7b618d51` succeeded in the background.
  - Requested size `1024x1024`, route `responses`, actual output `1254x1254`.
  - Saved path: `/storage/emulated/0/Android/data/top.fangtangyuan.fhlstudio.android.debug/files/Pictures/ImageStudio/responses-generate-Android-aspect-QA-1-1-a-20260629-155101-879-1.png`.
  - Gallery URI: `content://media/external/images/media/578`.
  - `dumpsys notification --noredact` confirmed a posted notification with title `图片已生成` and text `已保存到相册 Pictures/ImageStudio，点此回到结果。`.
  - Logcat showed no `AndroidRuntime` crash or ANR during the background run.
- Evidence files:
  - Manual test APK copy: `I:\AI\Image-Studio\android-test-builds\FHL-Image-Studio-方汤圆版-V2.0.2.1-Android-Debug-BackgroundNotify-20260629.apk`
  - `release-assets/evidence-v2.0.2.1-android/android-v2.0.2.1-background-notification-after-resume.png`
  - `.tmp/android-v2.0.2.1-background-notification-final.json`
- Test note:
  - An initial automated attempt pressed Home before the native job had entered `running`, leaving a queued job. Relaunching the app resumed that queued job correctly; the accepted live validation used the real-user flow of pressing Home only after foreground submission had reached the native worker.

### 2026-06-30 Android V2.0.2.1 Release Package Log

- Final release assets were generated under ignored `release-assets/`:
  - `FHL-Image-Studio-方汤圆版-V2.0.2.1-Android-Release-20260630.apk`
  - `FHL-Image-Studio-方汤圆版-V2.0.2.1-Android-Release-20260630.zip`
  - `FHL-Image-Studio-方汤圆版-V2.0.2.1-Android-Release-20260630.sha256.txt`
- SHA256:
  - APK: `E85ACE9A1159DF9AA24B2EAD1DA3B6DFBF6C23AF0E9A3F1762353C843EAB23A8`
  - ZIP: `1BF0742C598F08CA515BCF2BCF35B4DE961E6ED0E0685E2DB7E26C307DA7264A`
- Release notes:
  - `RELEASE_NOTES_V2.0.2.1_ANDROID.md`
- Verification completed:
  - `npm test` passed with 215 tests.
  - `npm run build:android` passed with the existing Vite large chunk warning only.
  - `assembleRelease` passed using the local release keystore from `.local/android-release/`.
  - `apksigner verify --verbose --print-certs` verified APK Signature Scheme v2 with the RSA 4096 release certificate.
  - `aapt dump badging` confirmed package `top.fangtangyuan.fhlstudio.android`, `versionCode=1050002`, `versionName=V2.0.2.1`, and label `FHL Image Studio 方汤圆版 V2.0.2.1`.
- Clean release launch smoke:
  - Reinstalled release package ID `top.fangtangyuan.fhlstudio.android` only; debug package data was not cleared.
  - Release package launched on emulator `emulator-5554`; focused app was `top.fangtangyuan.fhlstudio.android/.MainActivity`.
  - Crash buffer was empty.
  - Release package is not debuggable, so `run-as top.fangtangyuan.fhlstudio.android` correctly failed with `package not debuggable`.
  - UIAutomator could not read WebView text on this emulator run, so first-launch API cleanliness is covered by fresh install + static source/asset scan rather than WebView text extraction.
- Final privacy checks:
  - `git ls-files` did not include `.local`, keystore files, APK/ZIP, `.tmp`, `android-test-builds`, or `release-assets`.
  - `git grep` / `rg` scans found no high-confidence API Key, RH Key, GitHub token, keystore, or local runtime config in tracked source/release notes.
