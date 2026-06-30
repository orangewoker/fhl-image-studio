import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const studioStore = readFileSync(new URL("../src/state/studioStore.ts", import.meta.url), "utf8");
const runtimeHost = readFileSync(new URL("../src/platform/runtime/host.ts", import.meta.url), "utf8");
const androidParametersCSS = readFileSync(new URL("../src/styles/_android-parameters.css", import.meta.url), "utf8");
const androidJobManager = readFileSync(
  new URL("../../../android-shell/app/src/main/java/top/gptcodex/imagestudio/android/AndroidJobManager.kt", import.meta.url),
  "utf8",
);
const androidJobNotifications = readFileSync(
  new URL("../../../android-shell/app/src/main/java/top/gptcodex/imagestudio/android/AndroidJobNotifications.kt", import.meta.url),
  "utf8",
);
const mainActivity = readFileSync(
  new URL("../../../android-shell/app/src/main/java/top/gptcodex/imagestudio/android/MainActivity.kt", import.meta.url),
  "utf8",
);
const androidJobClient = readFileSync(
  new URL("../src/platform/runtime/androidJobClient.ts", import.meta.url),
  "utf8",
);

test("Android shell enables native background jobs when the bridge is available", () => {
  assert.match(
    studioStore,
    /function isAndroidTaskProxyMode\(\): boolean \{\s*return detectHostKind\(\) === "android-shell" && canUseAndroidJobs\(\);\s*\}/,
  );
});

test("Android native background jobs take over all image generation APIs", () => {
  assert.match(studioStore, /if \(isBrowserTaskProxyMode\(\)\) return true;/);
  assert.match(studioStore, /void apiMode;/);
  assert.match(studioStore, /return isAndroidTaskProxyMode\(\);/);
  assert.match(runtimeHost, /return detectHostKind\(\) === "android-shell" && canUseAndroidJobs\(\);/);
  assert.match(runtimeHost, /apiMode: normalizeHostAPIMode\(options\.apiMode\)/);
  assert.match(androidJobManager, /val apiMode = normalizeAPIMode\(payload\.optString\("apiMode", "responses"\)\)/);
  assert.match(androidJobManager, /\.put\("apiMode", apiMode\)/);
  assert.doesNotMatch(androidJobManager, /if \(apiMode != "responses"\)/);
  assert.match(androidJobManager, /"images" -> requestImagesWithRetries\(context, jobId, slotPayload, startedAt\)/);
  assert.match(androidJobManager, /"apimart" -> requestAPIMartWithRetries\(context, jobId, slotPayload, startedAt\)/);
  assert.match(androidJobManager, /private fun requestImagesWithRetries/);
  assert.match(androidJobManager, /private fun requestAPIMartWithRetries/);
});

test("Android native APIMart parser accepts array-wrapped task responses", () => {
  assert.match(androidJobManager, /private fun extractTaskId\(value: Any\?, depth: Int = 0\): String/);
  assert.match(androidJobManager, /if \(value is JSONArray\) \{\s*for \(i in 0 until value\.length\(\)\) \{\s*val nested = extractTaskId\(value\.opt\(i\), depth \+ 1\)/);
  assert.match(androidJobManager, /val nested = extractTaskId\(child, depth \+ 1\)/);
  assert.match(androidJobManager, /private fun statusValueFromPayload\(value: Any\?, key: String\? = null, depth: Int = 0\): String/);
  assert.match(androidJobManager, /if \(value is JSONArray\) \{\s*for \(i in 0 until value\.length\(\)\) \{\s*val status = statusValueFromPayload\(value\.opt\(i\), key, depth \+ 1\)/);
});

test("Android native APIMart submit logs only sanitized request fields", () => {
  const diagnostics = androidJobManager.match(/private fun logAPIMartSubmitDiagnostics[\s\S]*?\n    private fun resultImagesFromPayload/)?.[0] ?? "";
  assert.ok(diagnostics, "APIMart submit diagnostics should exist");
  assert.match(androidJobManager, /logAPIMartSubmitDiagnostics\(baseUrl, body\)/);
  assert.match(diagnostics, /\.put\("baseURLHost", hostForURL\(baseUrl\)\)/);
  assert.match(diagnostics, /\.put\("size", body\.optString\("size"\)\)/);
  assert.match(diagnostics, /\.put\("resolution", body\.optString\("resolution"\)\)/);
  assert.match(diagnostics, /\.put\("official_fallback", body\.optBoolean\("official_fallback", true\)\)/);
  assert.match(diagnostics, /\.put\("image_urls_count", body\.optJSONArray\("image_urls"\)\?\.length\(\) \?: 0\)/);
  assert.doesNotMatch(diagnostics, /apiKey/);
  assert.doesNotMatch(diagnostics, /prompt/);
});

test("Android native APIMart jobs resume polling existing task IDs without resubmitting", () => {
  assert.match(androidJobManager, /val existingAPIMartTaskId = slot\.optString\("apimartTaskId"\)\.trim\(\)/);
  assert.match(androidJobManager, /slotPayload\.put\("apimartTaskId", existingAPIMartTaskId\)/);
  assert.match(androidJobManager, /val existingTaskId = payload\.optString\("apimartTaskId"\)\.trim\(\)/);
  const resumeBranch = androidJobManager.match(/if \(existingTaskId\.isNotBlank\(\)\) \{[\s\S]*?return JobImageResult\(/)?.[0] ?? "";
  assert.ok(resumeBranch, "APIMart resume branch should return through a recovered JobImageResult");
  assert.match(resumeBranch, /pollAPIMartTask\(context, jobId, baseUrl, apiKey, existingTaskId, payload, attempt, startedAt\)/);
  assert.doesNotMatch(resumeBranch, /submitAPIMartTask/);
  assert.doesNotMatch(resumeBranch, /uploadAPIMartImage/);
});

test("Android native background recovery requeues orphan APIMart running tasks safely", () => {
  const reconcile = androidJobManager.match(/private fun reconcilePendingJobsLocked[\s\S]*?\n    private fun markDeadRunningJobsInterruptedLocked/)?.[0] ?? "";
  assert.ok(reconcile, "reconcilePendingJobsLocked should exist");
  assert.match(reconcile, /val isLiveInThisProcess = liveJobIds\.contains\(jobId\) \|\| activeWorkerJobIds\.contains\(jobId\)/);
  assert.match(reconcile, /if \(status == "running" && isLiveInThisProcess\) continue/);
  assert.match(reconcile, /"App 已恢复，继续查询 APIMart 任务 \$apimartTaskId"/);
  assert.match(reconcile, /slot\.put\("apimartTaskStatus", "resume_pending"\)/);
  assert.match(reconcile, /"App 重启后缺少 APIMart 查询参数，无法自动继续任务 \$apimartTaskId。请在历史记录中继续查询或重新生成。"/);
});

test("Android activity checks background job recovery again when returning from background", () => {
  assert.match(
    mainActivity,
    /override fun onResume\(\) \{\s*super\.onResume\(\)\s*AndroidJobManager\.resumePendingWork\(applicationContext\)\s*refreshAndroidJobsForPage\(\)\s*\}/,
  );
  assert.match(mainActivity, /AndroidJobManager\.attach\(applicationContext\)/);
  assert.match(mainActivity, /image-studio:android-jobs-resume/);
});

test("Android native jobs notify users when background generation finishes", () => {
  assert.match(androidJobManager, /AndroidJobNotifications\.notifySuccess\(/);
  assert.match(androidJobManager, /AndroidJobNotifications\.notifyFailure\(context, jobId/);
  assert.match(androidJobNotifications, /fun foregroundNotification\(context: Context\): Notification/);
  assert.match(androidJobNotifications, /fun notifySuccess\(/);
  assert.match(androidJobNotifications, /setContentIntent\(openAppIntent\(context\)\)/);
  assert.match(androidJobNotifications, /setAutoCancel\(true\)/);
  assert.match(androidJobNotifications, /Pictures\/ImageStudio/);
});

test("Android job client reattaches native job events after returning to foreground", () => {
  assert.match(androidJobClient, /window\.addEventListener\("focus", refreshEvents\)/);
  assert.match(androidJobClient, /window\.addEventListener\("pageshow", refreshEvents\)/);
  assert.match(androidJobClient, /image-studio:android-jobs-resume/);
  assert.match(androidJobClient, /document\.visibilityState === "visible"/);
  assert.match(androidJobClient, /void attachAndroidJobEvents\(\)\.catch\(\(\) => undefined\)/);
});

test("Android parameter changes stay mirrored into the active workspace", () => {
  const setFieldStart = studioStore.indexOf("setField: (key, value) => {");
  const setFieldEnd = studioStore.indexOf("setFullscreen: async", setFieldStart);
  assert.ok(setFieldStart >= 0 && setFieldEnd > setFieldStart, "setField body should be present");
  const setFieldBody = studioStore.slice(setFieldStart, setFieldEnd);
  for (const key of ["prompt", "negativePrompt", "mode", "size", "quality", "outputFormat", "seed", "styleTag", "sources"]) {
    assert.match(setFieldBody, new RegExp(`key === "${key}"`));
  }
  assert.match(setFieldBody, /\{\s*\.\.\.w,\s*\[key\]: normalizedValue\s*\} as Workspace/);
});

test("Android parameter modal leaves room below controls for the sticky save button", () => {
  assert.match(androidParametersCSS, /scroll-padding-bottom:\s*calc\(108px \+ var\(--android-safe-bottom-value, 0px\)\)/);
  assert.match(androidParametersCSS, /\.android-parameter-modal-stack[\s\S]*padding:\s*14px 14px calc\(108px \+ var\(--android-safe-bottom-value, 0px\)\)/);
});

test("Android native Images jobs log sanitized FHL request diagnostics", () => {
  assert.match(androidJobManager, /private fun logFHLImagesRequestDiagnostics\(payload: JSONObject\)/);
  assert.match(androidJobManager, /if \(!isFHLBaseURL\(payload\.optString\("baseURL"\)\)\) return/);
  assert.match(androidJobManager, /\.put\("baseURLHost", hostForURL\(payload\.optString\("baseURL"\)\)\)/);
  assert.match(androidJobManager, /\.put\("size", payload\.optString\("size", "1024x1024"\)/);
  assert.match(androidJobManager, /\.put\("sourceCount", payload\.optJSONArray\("sourceImagePaths"\)\?\.length\(\) \?: 0\)/);
  assert.match(androidJobManager, /Log\.i\(logTag, "FHL Images request \$\{diagnostics\}"\)/);
  assert.doesNotMatch(androidJobManager, /Log\.i\(logTag,[\s\S]{0,240}apiKey/);
  assert.doesNotMatch(androidJobManager, /Log\.i\(logTag,[\s\S]{0,240}prompt/);
});

test("Android native Images parser reports Cloudflare JSON errors clearly", () => {
  assert.match(androidJobManager, /private fun describeJSONProblem\(parsed: JSONObject, httpStatus: Int\): String\?/);
  assert.match(androidJobManager, /private fun payloadStatusCode\(parsed: JSONObject\): Int/);
  assert.match(
    androidJobManager,
    /describeJSONProblem\(parsed, 0\)\?\.let \{\s*throw JobRequestException\(it, rawPath, isRetryableRaw\(raw, payloadStatusCode\(parsed\)\)\)\s*\}/,
  );
  assert.match(androidJobManager, /parsed\.optBoolean\("cloudflare_error", false\)/);
  assert.match(androidJobManager, /Cloudflare \$\{if \(status > 0\) status else "错误"\}/);
  assert.match(androidJobManager, /describeJSONProblem\(parsed, status\)/);
});

test("Android native Images requests preserve the submitted pixel size", () => {
  const imagesRequestBody = androidJobManager.match(/private fun buildImagesRequestBody[\s\S]*?\n    private fun logFHLImagesRequestDiagnostics/)?.[0] ?? "";
  assert.ok(imagesRequestBody, "buildImagesRequestBody should exist");
  assert.match(imagesRequestBody, /val size = payload\.optString\("size", "864x1536"\)\.ifBlank \{ "864x1536" \}/);
  assert.doesNotMatch(imagesRequestBody, /repairSizeForOpenAI/);
  assert.match(imagesRequestBody, /\.put\("size", size\)/);
  assert.match(imagesRequestBody, /appendMultipartField\(out, boundary, "size", size\)/);
});

test("Android native Responses requests apply FHL exact ratio constraints", () => {
  const responsesPayload = androidJobManager.match(/private fun buildResponsesPayload[\s\S]*?\n    private fun batchVariationInstruction/)?.[0] ?? "";
  assert.ok(responsesPayload, "buildResponsesPayload should exist");
  assert.match(responsesPayload, /val size = when \{/);
  assert.match(responsesPayload, /parsedSize != null -> repairSizeForOpenAI\(rawSize\)/);
  assert.match(responsesPayload, /val aspectSuffix = fhlExactResponsesAspectPromptSuffix\(payload, size\)/);
  assert.match(responsesPayload, /if \(shouldDisablePartialImagesForFHLExactResponses\(payload, size\)\) 0 else normalizePartialImages/);
  assert.match(responsesPayload, /buildResponsesInstructions\(payload, size\)/);
  assert.match(androidJobManager, /private fun shouldDisablePartialImagesForFHLExactResponses\(payload: JSONObject, size: String\): Boolean/);
  assert.match(androidJobManager, /private fun fhlExactResponsesAspectInstruction\(payload: JSONObject, size: String\): String/);
  assert.match(androidJobManager, /private fun fhlExactResponsesAspectPromptSuffix\(payload: JSONObject, size: String\): String/);
  assert.match(androidJobManager, /The selected output aspect ratio is \$aspect/);
  assert.match(androidJobManager, /竖版画幅/);
  assert.match(androidJobManager, /横版画幅/);
});

test("Android native Responses jobs finish as soon as a final image SSE event arrives", () => {
  assert.match(androidJobManager, /private fun finalFromSSEEvent\(event: JSONObject\): JobImageResult\?/);
  assert.match(androidJobManager, /val final = finalFromSSEEvent\(event\)/);
  assert.match(androidJobManager, /writeRawLog\(context, "sse-response-attempt\$attempt-\$\{jobId\.takeLast\(8\)\}\.txt", raw\.toString\(\)\)/);
  assert.match(androidJobManager, /return final\.copy\(rawPath = rawPath\)/);
  assert.match(androidJobManager, /finalFromSSEEvent\(event\)\?\.let \{ return it \}/);
});

test("Android native queue audit records generation clicks without secrets", () => {
  const submitAudit = androidJobManager.match(/private fun buildSubmitAudit[\s\S]*?\n    private fun buildSlotAudit/)?.[0] ?? "";
  assert.ok(submitAudit, "buildSubmitAudit should exist");
  assert.match(androidJobManager, /private const val auditLogVersion = 1/);
  assert.match(androidJobManager, /private fun auditFile\(context: Context\): File = File\(context\.filesDir, "jobs\/android-job-audit\.v1\.jsonl"\)/);
  assert.match(androidJobManager, /appendJobAudit\(appContext, "submit", buildSubmitAudit\(group, storedPayload\)\)/);
  assert.match(androidJobManager, /appendJobAudit\(context, "slot_\$eventType", buildSlotAudit\(group, slot\)\)/);
  assert.match(androidJobManager, /appendJobAudit\(context, "slot_claimed", buildSlotAudit\(group, slot\)\)/);
  assert.match(androidJobManager, /\.put\("mode", group\.optString\("mode"\)\)/);
  assert.match(androidJobManager, /\.put\("apiMode", group\.optString\("apiMode"\)\)/);
  assert.match(androidJobManager, /\.put\("size", group\.optString\("size"\)\)/);
  assert.match(androidJobManager, /\.put\("batchCount", group\.optInt\("batchCount", 1\)\)/);
  assert.match(androidJobManager, /\.put\("continuousGenerateTest", group\.optBoolean\("continuousGenerateTest", false\)\)/);
  assert.match(androidJobManager, /\.put\("concurrencyLimit", group\.optInt\("concurrencyLimit", 0\)\)/);
  assert.match(androidJobManager, /\.put\("promptChars", payload\.optString\("prompt"\)\.length\)/);
  assert.match(androidJobManager, /Log\.i\(logTag, "Job audit \$\{record\}"\)/);
  assert.doesNotMatch(submitAudit, /\.put\("apiKey"/);
  assert.doesNotMatch(submitAudit, /\.put\("prompt", payload\.optString\("prompt"\)\)/);
});

test("Android native background jobs auto-publish completed originals to gallery", () => {
  assert.match(androidJobManager, /val galleryUri = publishImageToGallery\(context, savedPath\)/);
  assert.match(androidJobManager, /current\.put\("galleryUri", galleryUri\)/);
  assert.match(androidJobManager, /private fun publishImageToGallery\(context: Context, savedPath: String\): String\?/);
  assert.match(androidJobManager, /MediaStore\.Images\.Media\.EXTERNAL_CONTENT_URI/);
  assert.match(androidJobManager, /MediaStore\.MediaColumns\.RELATIVE_PATH, Environment\.DIRECTORY_PICTURES \+ File\.separator \+ "ImageStudio"/);
  assert.match(androidJobManager, /FileInputStream\(source\)\.use \{ input -> input\.copyTo\(output\) \}/);
  assert.match(studioStore, /galleryUri: String\(slot\.galleryUri \|\| existing\?\.galleryUri \|\| ""\) \|\| undefined/);
});
