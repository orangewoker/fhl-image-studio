import assert from "node:assert/strict";
import test from "node:test";

const sourceContextSelection = await import("../src/state/sourceContextSelection.ts");
const historySources = await import("../src/state/historySourceImages.ts");

function makeWorkspace(id, sources = [{ path: "I:\\current\\source.png", name: "source.png", size: 1 }]) {
  return {
    id,
    name: id,
    promptPrefix: "keep prefix",
    prompt: "keep prompt",
    optimizationGuidance: "keep guidance",
    negativePrompt: "keep negative",
    mode: "generate",
    size: "1024x1024",
    quality: "medium",
    outputFormat: "png",
    seed: 7,
    batchCount: 1,
    continuousGenerateTest: false,
    editSourceMode: "manual",
    batchProcess: {
      inputDir: "",
      outputMode: "source_dir",
      outputDir: "",
      concurrency: 4,
      retryOnFailure: false,
      autoAspectResolution: "1k",
      discoveredSources: [],
    },
    styleTag: "",
    sources,
    currentImageId: null,
    batchResultIds: [],
    batchTaskIds: ["task-1"],
    selectedBatchTaskId: null,
    resultGridOpen: true,
    historyGalleryOpen: false,
    historyGallerySort: "newest",
    runningJobIds: [],
    jobsTotal: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
    progress: null,
    streamPreview: null,
    streamPreviews: {},
    lastLogLine: "",
    errorMessage: null,
    errorRawPath: null,
    lastPayload: null,
  };
}

function makeState(workspaces) {
  return {
    activeWorkspaceId: workspaces[0].id,
    workspaces,
  };
}

test("sourceImagesFromPaths keeps every task source path in order", () => {
  const restored = historySources.sourceImagesFromPaths([
    "I:\\batch\\one.png",
    "I:\\batch\\two.webp",
  ]);

  assert.deepEqual(restored.map((source) => source.path), [
    "I:\\batch\\one.png",
    "I:\\batch\\two.webp",
  ]);
  assert.deepEqual(restored.map((source) => source.name), [
    "one.png",
    "two.webp",
  ]);
});

test("history selection patch restores source images without touching prompt params", () => {
  const state = makeState([makeWorkspace("ws-1")]);
  const patch = sourceContextSelection.sourceContextPatchFromHistoryItem(state, {
    id: "result-1",
    prompt: "old prompt",
    mode: "edit",
    size: "1536x1024",
    quality: "high",
    createdAt: Date.now(),
    sourceImages: [
      { path: "I:\\batch\\picked-a.png", name: "picked-a.png", size: 1 },
      { path: "I:\\batch\\picked-b.png", name: "picked-b.png", size: 2 },
    ],
  });

  assert.equal(patch.selectedBatchTaskId, null);
  assert.equal(patch.mode, "edit");
  assert.equal(patch.editSourceMode, "manual");
  assert.deepEqual(patch.sources?.map((source) => source.path), [
    "I:\\batch\\picked-a.png",
    "I:\\batch\\picked-b.png",
  ]);
  assert.equal("prompt" in patch, false);
  assert.equal(patch.workspaces[0].mode, "edit");
  assert.equal(patch.workspaces[0].editSourceMode, "manual");
  assert.deepEqual(patch.workspaces[0].sources.map((source) => source.path), [
    "I:\\batch\\picked-a.png",
    "I:\\batch\\picked-b.png",
  ]);
});

test("batch task selection patch restores task sources and highlights the task", () => {
  const state = makeState([makeWorkspace("ws-1")]);
  const patch = sourceContextSelection.sourceContextPatchFromBatchTask(state, {
    id: "task-1",
    workspaceId: "ws-1",
    prompt: "queued prompt",
    mode: "edit",
    size: "1024x1024",
    quality: "medium",
    outputFormat: "png",
    sourceImagePaths: ["I:\\batch\\queued-source.png"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "queued",
    slotIndex: 0,
    apiMode: "responses",
  });

  assert.equal(patch.selectedBatchTaskId, "task-1");
  assert.equal(patch.mode, "edit");
  assert.equal(patch.editSourceMode, "manual");
  assert.deepEqual(patch.sources?.map((source) => source.path), ["I:\\batch\\queued-source.png"]);
  assert.equal(patch.workspaces[0].selectedBatchTaskId, "task-1");
  assert.deepEqual(patch.workspaces[0].sources.map((source) => source.path), ["I:\\batch\\queued-source.png"]);
});

test("batch task selection preserves the batch source strip while highlighting the task", () => {
  const workspace = makeWorkspace("ws-1", [{ path: "I:\\keep\\batch-cover.png", name: "batch-cover.png", size: 1 }]);
  workspace.mode = "edit";
  workspace.editSourceMode = "batch";
  workspace.batchProcess.discoveredSources = [
    { path: "I:\\batch\\queued-source.png", name: "queued-source.png", size: 1, selected: true },
  ];
  const state = makeState([workspace]);
  const patch = sourceContextSelection.sourceContextPatchFromBatchTask(state, {
    id: "task-1",
    workspaceId: "ws-1",
    prompt: "queued prompt",
    mode: "edit",
    size: "1024x1024",
    quality: "medium",
    outputFormat: "png",
    sourceImagePaths: ["I:\\batch\\queued-source.png"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "failed",
    slotIndex: 0,
    apiMode: "responses",
  });

  assert.equal(patch.selectedBatchTaskId, "task-1");
  assert.equal("sources" in patch, false);
  assert.equal("mode" in patch, false);
  assert.equal("editSourceMode" in patch, false);
  assert.equal(patch.workspaces[0].mode, "edit");
  assert.equal(patch.workspaces[0].editSourceMode, "batch");
  assert.deepEqual(patch.workspaces[0].sources.map((source) => source.path), ["I:\\keep\\batch-cover.png"]);
  assert.equal(patch.workspaces[0].selectedBatchTaskId, "task-1");
});

test("non-edit batch task selection keeps current sources while only updating selection", () => {
  const state = makeState([makeWorkspace("ws-1", [{ path: "I:\\keep\\current.png", name: "current.png", size: 1 }])]);
  const patch = sourceContextSelection.sourceContextPatchFromBatchTask(state, {
    id: "task-1",
    workspaceId: "ws-1",
    prompt: "text only",
    mode: "generate",
    size: "1024x1024",
    quality: "medium",
    outputFormat: "png",
    sourceImagePaths: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "failed",
    slotIndex: 0,
    apiMode: "responses",
  });

  assert.equal(patch.selectedBatchTaskId, "task-1");
  assert.equal("sources" in patch, false);
  assert.equal("mode" in patch, false);
  assert.equal("editSourceMode" in patch, false);
  assert.deepEqual(patch.workspaces[0].sources.map((source) => source.path), ["I:\\keep\\current.png"]);
  assert.equal(patch.workspaces[0].selectedBatchTaskId, "task-1");
});
