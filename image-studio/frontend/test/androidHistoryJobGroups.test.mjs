import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (url, encoding) => readFileSync(url, encoding).replace(/\r\n/g, "\n");

const historyRail = readSource(new URL("../src/components/history/HistoryRail.tsx", import.meta.url), "utf8");
const windowsHistoryRail = readSource(new URL("../src/components/history/WindowsHistoryRail.tsx", import.meta.url), "utf8");
const jobGroup = readSource(new URL("../src/platform/android/history/AndroidHistoryJobGroup.tsx", import.meta.url), "utf8");
const storeTypes = readSource(new URL("../src/state/studioStore.types.ts", import.meta.url), "utf8");
const imageActions = readSource(new URL("../src/state/studioStore.images.ts", import.meta.url), "utf8");
const store = readSource(new URL("../src/state/studioStore.ts", import.meta.url), "utf8");
const css = readSource(new URL("../src/styles/_android-history.css", import.meta.url), "utf8");
const domain = readSource(new URL("../src/types/domain.ts", import.meta.url), "utf8");
const profiles = readSource(new URL("../src/lib/profiles.ts", import.meta.url), "utf8");
const contracts = readSource(new URL("../src/platform/runtime/browserJobContracts.ts", import.meta.url), "utf8");
const canvasStage = readSource(new URL("../src/platform/android/canvas/AndroidCanvasStage.tsx", import.meta.url), "utf8");
const batchGrid = readSource(new URL("../src/components/canvas/BatchResultGrid.tsx", import.meta.url), "utf8");
const workspaceRuntime = readSource(new URL("../src/state/workspaceRuntime.ts", import.meta.url), "utf8");
const androidJobManager = readSource(new URL("../../../android-shell/app/src/main/java/top/gptcodex/imagestudio/android/AndroidJobManager.kt", import.meta.url), "utf8");

test("Android history renders recent job groups like desktop history", () => {
  assert.match(historyRail, /AndroidHistoryJobGroup/);
  assert.match(historyRail, /recentJobGroups\.length > 0/);
  assert.match(historyRail, /className="android-history-jobs-card"/);
  assert.match(historyRail, /historyById=\{historyById\}/);
  assert.match(historyRail, /onApplySlotParams=\{applyJobSlotParams\}/);
  assert.match(historyRail, /onRegenerateSlot=\{\(group, slot\) => \{ void regenerateJobSlot\(group, slot\); \}\}/);
  assert.match(historyRail, /queryAPIMartRecoveryTask\(taskId\)/);
});

test("history rails use shared API mode labels so APIMart is not shown as Images", () => {
  for (const source of [historyRail, windowsHistoryRail]) {
    assert.match(source, /apiModeShortLabel\(profile\.apiMode\)/);
    assert.match(source, /apiModeLabel\(apiMode\)/);
    assert.doesNotMatch(source, /profile\.apiMode === "responses" \? "Responses" : "Images"/);
    assert.doesNotMatch(source, /apiMode === "responses" \? "Responses API" : "Images API"/);
  }
});

test("Android job group cards expose running failed cancelled recovery and apply-param actions", () => {
  assert.match(jobGroup, /JobGroupSnapshot/);
  assert.match(jobGroup, /JobSlotSnapshot/);
  assert.match(jobGroup, /groupStateLabel/);
  assert.match(jobGroup, /slotStateLabel/);
  assert.match(jobGroup, /canApplyParams/);
  assert.match(jobGroup, /onApplySlotParams\(group, slot\)/);
  assert.match(jobGroup, /onRegenerateSlot\(group, slot\)/);
  assert.match(jobGroup, /android-history-job-apply/);
  assert.match(jobGroup, /android-history-job-regenerate/);
  assert.match(jobGroup, /android-history-job-query/);
  assert.match(jobGroup, /pixelSizeLabel\(item\)/);
});

test("Android batch result API badges prefer configured provider labels", () => {
  assert.match(profiles, /export function upstreamConfigShortLabel/);
  assert.match(profiles, /kind === "fhl"[\s\S]*return "FHL"/);
  assert.match(profiles, /kind === "apimart"[\s\S]*return "APIMart"/);
  assert.match(profiles, /kind === "images" \? "OpenAI v1" : "Responses"/);
  assert.match(domain, /apiLabel\?: string;/);
  assert.match(contracts, /apiLabel\?: string;/);
  assert.match(store, /upstreamConfigShortLabel/);
  assert.match(store, /const submitAPIShortLabel = upstreamConfigShortLabel/);
  assert.match(store, /apiLabel: submitAPIShortLabel/);
  assert.match(store, /apiLabel: snapshot\.apiLabel/);
  assert.match(store, /apiLabel: group\.apiLabel \|\| undefined/);
  assert.match(store, /apiLabel: "APIMart"/);
  assert.match(workspaceRuntime, /apiLabel\?: string;/);
  assert.match(workspaceRuntime, /batchIndex\?: number;/);
  assert.match(canvasStage, /firstBatchAPIItemLabel\(batchResults\)/);
  assert.match(canvasStage, /runningMetaByBatchIndex/);
  assert.match(canvasStage, /apiLabelForBatchIndex/);
  assert.match(canvasStage, /recoveryTask\s*\?\s*"APIMart"/);
  assert.match(canvasStage, /function isGenericAPIShortLabel\(label: string\)/);
  assert.match(canvasStage, /trimmed === "Images"[\s\S]*trimmed === "Responses API"/);
  assert.match(canvasStage, /function preferredProviderAPIShortLabel\(label: string, providerLabel: string\)/);
  assert.match(canvasStage, /const selectedBatchProviderLabel = selectedAPIProviderFitsBatch \? selectedAPIProviderLabel : ""/);
  assert.match(canvasStage, /preferredProviderAPIShortLabel\(batchItemApiLabel, selectedBatchProviderLabel\)/);
  assert.match(canvasStage, /preferredProviderAPIShortLabel\(activeJobGroup\?\.apiLabel\?\.trim\(\) \|\| "", selectedBatchProviderLabel\)/);
  assert.match(canvasStage, /const batchApiLabel = preferredBatchItemApiLabel/);
  assert.match(canvasStage, /const selectedAPIShortLabel = upstreamConfigShortLabel/);
  assert.match(canvasStage, /const selectedAPIProviderLabel = providerAPIShortLabel\(selectedAPIShortLabel\)/);
  assert.match(canvasStage, /selectedAPIProviderLabel === "FHL"/);
  assert.match(batchGrid, /apiLabelForGridSlot/);
  assert.match(batchGrid, /slot\.item\.apiLabel\?\.trim\(\)/);
  assert.match(batchGrid, /slot\.jobGroup\?\.apiLabel\?\.trim\(\)/);
  assert.match(jobGroup, /apiShortLabel\(group\.apiMode, group\.apiLabel\)/);
  assert.match(androidJobManager, /\.put\("apiLabel", payload\.optString\("apiLabel", "FHL"\)/);
});

test("Android failed job slot params are restored through the store without submit", () => {
  assert.match(storeTypes, /JobSlotSnapshot/);
  assert.match(storeTypes, /applyJobSlotParams: \(group: JobGroupSnapshot, slot: JobSlotSnapshot\) => void/);
  assert.match(storeTypes, /regenerateJobSlot: \(group: JobGroupSnapshot, slot: JobSlotSnapshot\) => Promise<void>/);
  assert.match(imageActions, /sourceImagesFromJobPaths/);
  assert.match(imageActions, /applyJobSlotParams\(group: JobGroupSnapshot, slot: JobSlotSnapshot\)/);
  assert.match(imageActions, /regenerateJobSlot\(group: JobGroupSnapshot, slot: JobSlotSnapshot\)/);
  assert.match(imageActions, /prompt: group\.prompt/);
  assert.match(imageActions, /mode: group\.mode/);
  assert.match(imageActions, /size: group\.size/);
  assert.match(imageActions, /quality: group\.quality/);
  assert.match(imageActions, /outputFormat: group\.outputFormat/);
  assert.match(imageActions, /sources: sourceImages/);
  assert.match(imageActions, /未重新生成/);
  const applyJobSlotParams = imageActions.match(
    /applyJobSlotParams\(group: JobGroupSnapshot, slot: JobSlotSnapshot\) \{[\s\S]*?\n    \},\n\n    async regenerateJobSlot/,
  );
  assert.ok(applyJobSlotParams, "applyJobSlotParams action should be present");
  assert.doesNotMatch(applyJobSlotParams[0], /submit\(/);
  const regenerateJobSlot = imageActions.match(
    /regenerateJobSlot\(group: JobGroupSnapshot, slot: JobSlotSnapshot\) \{[\s\S]*?\n    \},\n\n    async regenerateFromHistory/,
  );
  assert.ok(regenerateJobSlot, "regenerateJobSlot action should be present");
  assert.match(regenerateJobSlot[0], /this\.applyJobSlotParams\(group, slot\)/);
  assert.match(regenerateJobSlot[0], /submit\(\)/);
  assert.match(store, /applyJobSlotParams: \(group, slot\) => imageActions\.applyJobSlotParams\(group, slot\)/);
  assert.match(store, /regenerateJobSlot: async \(group, slot\) => imageActions\.regenerateJobSlot\(group, slot\)/);
});

test("Android history job group has mobile and pad scoped styling", () => {
  assert.match(css, /\.android-history-jobs-card/);
  assert.match(css, /\.android-history-job-group/);
  assert.match(css, /\.android-history-job-slot/);
  assert.match(css, /\.android-history-job-actions/);
  assert.match(css, /\.android-history-job-apply/);
  assert.match(css, /\.android-history-job-regenerate/);
  assert.match(css, /\.android-history-job-query/);
  assert.match(css, /data-target-platform="android-pad"[\s\S]*\.android-history-jobs-card/);
});
