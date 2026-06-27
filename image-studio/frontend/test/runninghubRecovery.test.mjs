import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiSource = await readFile(new URL("../src/lib/runninghubAPI.ts", import.meta.url), "utf8");
const storeSource = await readFile(new URL("../src/state/studioStore.ts", import.meta.url), "utf8");
const storeTypesSource = await readFile(new URL("../src/state/studioStore.types.ts", import.meta.url), "utf8");
const canvasStageSource = await readFile(new URL("../src/components/canvas/CanvasStage.tsx", import.meta.url), "utf8");
const gridSource = await readFile(new URL("../src/components/canvas/BatchResultGrid.tsx", import.meta.url), "utf8");
const canvasCss = await readFile(new URL("../src/styles/_canvas.css", import.meta.url), "utf8");
const kernelSource = await readFile(new URL("../src/platform/runtime/remote-kernel/runninghub.ts", import.meta.url), "utf8");

test("runninghub api helpers cover recovery payloads and proxied result download", () => {
  assert.match(apiSource, /export type RunningHubBridgeTask/);
  assert.match(apiSource, /export function runningHubSizeSelection\(/);
  assert.match(apiSource, /export async function recoverRunningHubTask\(/);
  assert.match(apiSource, /export async function fetchRunningHubResultImage\(/);
  assert.match(apiSource, /aspect_ratio: sizeSelection\.aspectRatio/);
  assert.match(apiSource, /resolution: sizeSelection\.resolution/);
});

test("studio store exposes runninghub recovery and reuses the normal success path", () => {
  assert.match(storeTypesSource, /recoverRunningHubResult: \(taskId: string\) => Promise<HistoryItem \| null>/);
  assert.match(storeSource, /recoverRunningHubResult: async \(taskId\) => \{/);
  assert.match(storeSource, /recoverRunningHubTask\(baseURL, \{/);
  assert.match(storeSource, /fetchRunningHubResultImage\(baseURL, firstImage\)/);
  assert.match(storeSource, /updateTaskFromHistoryItem\(/);
  assert.match(storeSource, /mergeWorkspaceBatchResult\(current, task\.workspaceId, historyItem, nextHistory\)/);
  assert.match(storeSource, /autoPastePanoramaRoundtripResult\(historyItem, \{/);
  assert.match(storeSource, /runningHubRecoveryHistoryId\(task\.id\)/);
});

test("canvas stage marks recoverable runninghub failures and passes the action down", () => {
  assert.match(canvasStageSource, /function runningHubRecoveryState\(/);
  assert.match(canvasStageSource, /runningHubRecoverable: runningHubRecovery\.recoverable/);
  assert.match(canvasStageSource, /runningHubRecoveryLabel: runningHubRecovery\.label/);
  assert.match(
    canvasStageSource,
    /onRecoverRunningHub=\{\(\{ taskId \}\) => \{\s*void recoverRunningHubResult\(taskId\);\s*\}\}/,
  );
});

test("batch grid and canvas styles include runninghub recovery affordances", () => {
  assert.match(gridSource, /runningHubRecoveryLabel\?: string/);
  assert.match(gridSource, /className=\{`batch-grid-recover-button \$\{canRetry \? "stacked" : "solo"\}`\}/);
  assert.match(gridSource, /重新同步 RH 结果/);
  assert.match(canvasCss, /\.batch-grid-recovery-chip/);
  assert.match(canvasCss, /\.batch-grid-recover-button/);
  assert.match(canvasCss, /can-recover-runninghub/);
});

test("runninghub remote kernel waits as long as the bridge timeout budget", () => {
  assert.match(kernelSource, /const RUNNINGHUB_MAX_WAIT_MS = 900_000;/);
});
