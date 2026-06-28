import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const store = readFileSync(new URL("../src/state/studioStore.ts", import.meta.url), "utf8");
const workspaceActions = readFileSync(new URL("../src/state/studioStore.workspaces.ts", import.meta.url), "utf8");
const sharedStore = readFileSync(new URL("../src/state/studioStore.shared.ts", import.meta.url), "utf8");
const profiles = readFileSync(new URL("../src/lib/profiles.ts", import.meta.url), "utf8");
const fhlAPI = readFileSync(new URL("../src/lib/fhlAPI.ts", import.meta.url), "utf8");
const apimartAPI = readFileSync(new URL("../src/lib/apimartAPI.ts", import.meta.url), "utf8");
const upstreamForm = readFileSync(new URL("../src/platform/android/upstream/AndroidUpstreamProfileForm.tsx", import.meta.url), "utf8");
const phoneCompose = readFileSync(new URL("../src/platform/android/AndroidPhoneComposePanel.tsx", import.meta.url), "utf8");
const padCompose = readFileSync(new URL("../src/platform/android/AndroidPadComposePanel.tsx", import.meta.url), "utf8");
const layoutCss = readFileSync(new URL("../src/styles/_layout.css", import.meta.url), "utf8");
const phoneParams = readFileSync(new URL("../src/platform/android/parameters/AndroidPhoneParameterSection.tsx", import.meta.url), "utf8");
const padParams = readFileSync(new URL("../src/platform/android/parameters/AndroidPadParameterSection.tsx", import.meta.url), "utf8");
const primitives = readFileSync(new URL("../src/platform/android/parameters/AndroidParameterPrimitives.tsx", import.meta.url), "utf8");
const parameterEditor = readFileSync(new URL("../src/platform/android/parameters/AndroidParameterEditor.tsx", import.meta.url), "utf8");
const parameterOptions = readFileSync(new URL("../src/platform/android/parameters/parameterOptions.ts", import.meta.url), "utf8");
const browserJobs = readFileSync(new URL("../src/state/browserJobs.ts", import.meta.url), "utf8");
const contracts = readFileSync(new URL("../src/platform/runtime/browserJobContracts.ts", import.meta.url), "utf8");
const domain = readFileSync(new URL("../src/types/domain.ts", import.meta.url), "utf8");
const hostTypes = readFileSync(new URL("../src/platform/runtime/hostTypes.ts", import.meta.url), "utf8");
const remoteTypes = readFileSync(new URL("../src/platform/runtime/remote-kernel/types.ts", import.meta.url), "utf8");
const requestPayloads = readFileSync(new URL("../src/platform/runtime/remote-kernel/requestPayloads.ts", import.meta.url), "utf8");
const apimart = readFileSync(new URL("../src/platform/runtime/remote-kernel/apimart.ts", import.meta.url), "utf8");
const requestModel = readFileSync(new URL("../../../shared/kernel/requestModel.js", import.meta.url), "utf8");
const androidJobManager = readFileSync(new URL("../../../android-shell/app/src/main/java/top/gptcodex/imagestudio/android/AndroidJobManager.kt", import.meta.url), "utf8");

test("Android upstream config exposes the shared concurrency limit stepper", () => {
  assert.match(upstreamForm, /concurrencyLimit/);
  assert.match(upstreamForm, /Math\.max\(1, phoneSafeConcurrency - 1\)/);
  assert.match(upstreamForm, /Math\.min\(2, phoneSafeConcurrency \+ 1\)/);
});

test("Android compose summary shows active profile concurrency limit", () => {
  for (const source of [phoneCompose, padCompose]) {
    assert.match(source, /activeProfileId/);
    assert.match(source, /activeProfileConcurrencyLimit = profiles\.find\(\(profile\) => profile\.id === activeProfileId\)\?\.concurrencyLimit \?\? 1/);
    assert.match(source, /activeConcurrencyLimit = Math\.min\(2, Math\.max\(1, Math\.floor\(Number\(activeProfileConcurrencyLimit\) \|\| 1\)\)\)/);
    assert.match(source, /concurrencyLimit=\{activeConcurrencyLimit\}/);
  }
  for (const source of [phoneParams, padParams]) {
    assert.match(source, /concurrencyLimit: number;/);
    assert.match(source, /concurrencyLimit,/);
  }
  assert.match(primitives, /key: "concurrency"/);
  assert.match(primitives, /label: continuousGenerateTest === true \? "连续并发" : "并发上限"/);
  assert.match(primitives, /value: `\$\{limit\} 并发`/);
});

test("submit still enforces profile concurrency before starting jobs", () => {
  assert.match(store, /const rawConcurrencyLimit = normalizeConcurrencyLimit\(activeProfile\?\.concurrencyLimit \?\? 0\);/);
  assert.match(store, /Math\.min\(2, Math\.max\(1, rawConcurrencyLimit \|\| 1\)\)/);
  assert.match(store, /const activeCount = workspaceRunningCount\(s, effectiveAPIMode\);/);
  assert.match(store, /if \(available <= 0\)/);
  assert.match(store, /else if \(!appendingContinuousRun && available < batchCount\)/);
  assert.match(store, /errorMessage: `\$\{apiLabel\} 并发限制 \$\{concurrencyLimit\}/);
});

test("one-click presets preserve existing profile concurrency settings", () => {
  assert.match(fhlAPI, /fhlProfile\.concurrencyLimit > 0 \? Math\.min\(2, fhlProfile\.concurrencyLimit\) : DEFAULT_CONCURRENCY_LIMIT/);
  assert.match(apimartAPI, /existing\.concurrencyLimit > 0 \? Math\.min\(2, existing\.concurrencyLimit\) : DEFAULT_CONCURRENCY_LIMIT/);
});

test("Android parameters expose continuous generation mode", () => {
  assert.match(parameterEditor, /AndroidToggleSetting/);
  assert.match(parameterEditor, /label="连续出图模式"/);
  assert.match(parameterEditor, /setField\("continuousGenerateTest", next\)/);
  assert.match(parameterEditor, /!\s*continuousGenerateTest \? \(/);
  assert.match(parameterEditor, /label="连续并发"/);
  assert.match(parameterEditor, /ANDROID_CONTINUOUS_CONCURRENCY_OPTIONS/);
  assert.match(parameterEditor, /onConcurrencyLimitChange/);
  assert.match(parameterOptions, /ANDROID_CONTINUOUS_CONCURRENCY_OPTIONS/);
  assert.match(primitives, /key: "continuous"/);
  assert.match(primitives, /label: "连续生成"/);
  assert.match(primitives, /label: continuousGenerateTest === true \? "连续并发" : "并发上限"/);
  for (const source of [phoneParams, padParams]) {
    assert.match(source, /continuousGenerateTest: boolean;/);
    assert.match(source, /continuousGenerateTest=\{continuousGenerateTest\}/);
    assert.match(source, /onConcurrencyLimitChange/);
  }
  for (const source of [phoneCompose, padCompose]) {
    assert.match(source, /continuousGenerateTest/);
    assert.match(source, /updateProfile/);
    assert.match(source, /concurrencyLimit: normalized/);
    assert.match(source, /追加生成/);
  }
});

test("Android defaults enable continuous generation with phone-safe API concurrency", () => {
  assert.match(store, /continuousGenerateTest: true/);
  assert.match(store, /const ANDROID_CONTINUOUS_DEFAULT_KEY = storageKey\("gptcodex\.androidContinuousDefault\.v1"\);/);
  assert.match(store, /runtimePlatform\.isAndroid && shouldApplyAndroidContinuousDefault\(\)/);
  assert.match(store, /continuousGenerateTest: restoredActiveWorkspace\.continuousGenerateTest \?\? true/);
  assert.match(workspaceActions, /continuousGenerateTest: true/);
  assert.match(workspaceActions, /continuousGenerateTest: newWorkspace\.continuousGenerateTest \?\? true/);
  assert.match(sharedStore, /continuousGenerateTest: raw\.continuousGenerateTest !== false/);
  assert.match(profiles, /export const DEFAULT_CONCURRENCY_LIMIT = 1;/);
  assert.match(profiles, /export function makeFHLResponsesProfile[\s\S]*concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT/);
  assert.match(profiles, /export function makeAPIMartProfile[\s\S]*concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT/);
  assert.match(fhlAPI, /concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT/);
  assert.match(apimartAPI, /concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT/);
});

test("Android parameters expose separate size and aspect controls", () => {
  assert.match(parameterEditor, /<AndroidParameterBlock title="画幅比例">/);
  assert.match(parameterEditor, /label="尺寸"/);
  assert.doesNotMatch(parameterEditor, /label="分辨率"/);
  assert.match(primitives, /\{ key: "aspect", label: "比例", value: activeAspectLabel \}/);
  assert.match(primitives, /\{ key: "resolution", label: "尺寸", value: activeResolutionLabel \}/);
  assert.match(primitives, /ariaLabel="画幅比例"/);
});

test("Android submit allows appending only when continuous mode is enabled", () => {
  assert.match(store, /const appendingContinuousRun = s\.isRunning && s\.continuousGenerateTest === true/);
  assert.match(store, /s\.isRunning && !s\.continuousGenerateTest/);
  assert.match(store, /连续生成模式关闭时不会并发提交/);
  assert.match(store, /const selectedBatchCount = normalizeBatchCount\(s\.batchCount\);/);
  assert.match(store, /const requestedBatchCount = s\.continuousGenerateTest === true \? 1 : selectedBatchCount;/);
  assert.match(store, /batchCount: selectedBatchCount/);
  assert.match(store, /batchCount = available/);
  assert.match(store, /batchIndexOffset \+ i/);
  assert.match(store, /continuousGenerateTest: s\.continuousGenerateTest === true/);
  assert.match(store, /continuousBatchIndex: appendingContinuousRun \? existingJobsTotal : 0/);
});

test("Android running append CTA gives more room to append and makes cancel bright red", () => {
  for (const source of [phoneCompose, padCompose]) {
    assert.match(source, /android-running-cta-row/);
    assert.match(source, /android-running-append-button/);
    assert.match(source, /android-running-cancel-button/);
  }
  assert.match(layoutCss, /grid-template-columns: minmax\(0, 1fr\) 78px/);
  assert.match(layoutCss, /background: linear-gradient\(180deg, #ff4d4f, #dc2626\)/);
  assert.match(layoutCss, /color: #fff/);
});

test("Android background job groups keep continuous append metadata and aggregate running groups", () => {
  assert.match(domain, /continuousGenerateTest\?: boolean/);
  assert.match(domain, /continuousBatchIndex\?: number/);
  assert.match(domain, /requestRunId\?: string/);
  assert.match(domain, /concurrencyLimit\?: number/);
  assert.match(contracts, /continuousGenerateTest\?: boolean/);
  assert.match(contracts, /continuousBatchIndex\?: number/);
  assert.match(contracts, /requestRunId\?: string/);
  assert.match(contracts, /concurrencyLimit\?: number/);
  assert.match(androidJobManager, /val continuousBatchIndex = payload\.optInt\("continuousBatchIndex", 0\)\.coerceAtLeast\(0\)/);
  assert.match(androidJobManager, /\.put\("concurrencyLimit", payload\.optInt\("concurrencyLimit", 0\)\.coerceAtLeast\(0\)\)/);
  assert.match(androidJobManager, /\.put\("batchIndex", continuousBatchIndex \+ index\)/);
  assert.match(androidJobManager, /\.put\("requestRunId", requestRunId\)/);
  assert.match(store, /concurrencyLimit,/);
  assert.match(browserJobs, /const runningGroups = groups/);
  assert.match(browserJobs, /runningGroups\.flatMap/);
  assert.match(browserJobs, /runningGroups\.reduce\(\(sum, group\) => sum \+ group\.batchCount, 0\)/);
});

test("Android native background worker claims queued slots with phone-safe concurrency", () => {
  assert.match(androidJobManager, /private const val nativeDefaultParallelJobs = 1/);
  assert.match(androidJobManager, /private const val nativeMaxParallelJobs = 2/);
  assert.match(androidJobManager, /private val activeWorkerJobIds = ConcurrentHashMap\.newKeySet<String>\(\)/);
  assert.match(androidJobManager, /runWorkerConcurrent\(context\)/);
  assert.match(androidJobManager, /private fun runWorkerConcurrent\(context: Context\)/);
  assert.match(androidJobManager, /while \(activeWorkerJobIds\.size < parallelLimit\)/);
  assert.match(androidJobManager, /val next = claimNextQueuedSlot\(context\) \?: break/);
  assert.match(androidJobManager, /thread\(name = "fhl-studio-android-job-\$\{jobId\.takeLast\(8\)\}"\)/);
  assert.match(androidJobManager, /activeWorkerJobIds\.remove\(jobId\)/);
  assert.match(androidJobManager, /private fun claimNextQueuedSlot\(context: Context\): Pair<JSONObject, JSONObject>\?/);
  assert.match(androidJobManager, /if \(slot\.optString\("status"\) != "queued"\) continue/);
  assert.match(androidJobManager, /slot\.put\("status", "running"\)/);
  assert.match(androidJobManager, /private fun nativeParallelLimit\(context: Context\): Int/);
  assert.match(androidJobManager, /configuredLimit\.coerceIn\(1, nativeMaxParallelJobs\)/);
  assert.match(androidJobManager, /payloadLimit = hydratePayload\(context, group\.optString\("groupId"\)\)\?\.optInt\("concurrencyLimit", 0\) \?: 0/);
});

test("Android background slots isolate random batch requests to avoid duplicate images", () => {
  assert.match(hostTypes, /requestRunId\?: string/);
  assert.match(hostTypes, /batchVariationKey\?: string/);
  assert.match(remoteTypes, /requestRunId\?: string/);
  assert.match(remoteTypes, /batchVariationKey\?: string/);
  assert.match(store, /const requestRunId = cryptoIDFallback\(\);/);
  assert.match(store, /requestRunId,/);
  assert.match(store, /batchVariationKey: `\$\{requestRunId\}-\$\{batchIndex \+ 1\}`/);
  assert.match(contracts, /requestRunId\?: string/);
  assert.match(androidJobManager, /seedForRandomBatchSlot\(jobId, batchIndex\)/);
  assert.match(androidJobManager, /slotPayload\.put\("batchIndex", batchIndex\)/);
  assert.match(androidJobManager, /slotPayload\.put\("requestRunId", requestRunId\)/);
  assert.match(androidJobManager, /slotPayload\.put\("batchVariationKey", "\$requestRunId-\$\{jobId\.takeLast\(12\)\}-\$\{batchIndex \+ 1\}"\)/);
  assert.match(androidJobManager, /slotPayload\.put\("apiMode", apiMode\)/);
  assert.match(androidJobManager, /"images" -> requestImagesWithRetries\(context, jobId, slotPayload, startedAt\)/);
  assert.match(androidJobManager, /"apimart" -> requestAPIMartWithRetries\(context, jobId, slotPayload, startedAt\)/);
  assert.match(androidJobManager, /"runninghub" -> requestRunningHubWithRetries\(context, jobId, slotPayload, startedAt\)/);
  assert.match(androidJobManager, /content\.put\(JSONObject\(\)\.put\("type", "input_text"\)\.put\("text", variation\)\)/);
  assert.match(androidJobManager, /Request isolation: this is an independent generation task/);
  assert.match(androidJobManager, /distinct non-duplicate final image/);
  assert.match(androidJobManager, /UUID\.nameUUIDFromBytes\("\$jobId:\$batchIndex"\.toByteArray\(Charsets\.UTF_8\)\)/);
  assert.match(requestModel, /export function buildBatchVariationInstruction\(payload\)/);
  assert.match(requestModel, /You must return a distinct non-duplicate final image/);
  assert.match(requestModel, /content\.push\(\{ type: "input_text", text: variation \}\)/);
  assert.match(requestPayloads, /promptWithBatchVariation\(request\.payload\)/);
  assert.match(apimart, /prompt: promptWithBatchVariation\(request\.payload\)/);
});

test("Android non-background result writes are keyed by their own job id", () => {
  assert.match(store, /const itemID = browserHistoryId\(jobId\);/);
  assert.match(store, /\.\.\.store\.getState\(\)\.history\.filter\(\(entry\) => entry\.id !== historyItem\.id\)/);
  assert.match(store, /\[\.\.\.state\.batchResults\.filter\(\(item\) => item\.id !== historyItem\.id\), historyItem\]/);
  assert.match(store, /\.sort\(\(a, b\) => \(a\.batchIndex \?\? 0\) - \(b\.batchIndex \?\? 0\)\)/);
});
