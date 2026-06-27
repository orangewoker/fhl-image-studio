import assert from "node:assert/strict";
import test from "node:test";
import { sortBatchGridSlotsForDisplay } from "../src/components/canvas/batchGridDisplayOrder.ts";

function entry(id, slot, originalIndex) {
  return { id, slot, originalIndex };
}

test("batch grid display order puts generating slots before queued and terminal slots", () => {
  const ordered = sortBatchGridSlotsForDisplay([
    entry("done", { type: "result" }, 0),
    entry("queued", { type: "pending", status: "queued" }, 1),
    entry("failed", { type: "failed" }, 2),
    entry("running", { type: "pending", status: "running" }, 3),
    entry("cancelled", { type: "pending", status: "cancelled" }, 4),
  ], true);

  assert.deepEqual(ordered.map((item) => item.id), ["running", "queued", "failed", "done", "cancelled"]);
});

test("batch grid display order treats stream previews as active generation", () => {
  const ordered = sortBatchGridSlotsForDisplay([
    entry("done", { type: "result" }, 0),
    entry("preview", { type: "preview" }, 1),
    entry("localQueued", { type: "pending", status: "local_queued" }, 2),
  ], true);

  assert.deepEqual(ordered.map((item) => item.id), ["preview", "localQueued", "done"]);
});

test("batch grid display order groups missing final images with failures before results", () => {
  const ordered = sortBatchGridSlotsForDisplay([
    entry("done", { type: "result" }, 0),
    entry("missingFinal", { type: "pending", status: "succeeded_no_image" }, 1),
    entry("failed", { type: "failed" }, 2),
  ], true);

  assert.deepEqual(ordered.map((item) => item.id), ["missingFinal", "failed", "done"]);
});

test("batch grid display order preserves current view order within the same priority", () => {
  const ordered = sortBatchGridSlotsForDisplay([
    entry("firstResult", { type: "result" }, 0),
    entry("secondResult", { type: "result" }, 1),
    entry("thirdResult", { type: "result" }, 2),
  ], true);

  assert.deepEqual(ordered.map((item) => item.id), ["firstResult", "secondResult", "thirdResult"]);
});

test("batch grid display order can reverse the current view order within the same priority", () => {
  const ordered = sortBatchGridSlotsForDisplay([
    entry("firstResult", { type: "result" }, 0),
    entry("secondResult", { type: "result" }, 1),
    entry("thirdResult", { type: "result" }, 2),
  ], false);

  assert.deepEqual(ordered.map((item) => item.id), ["thirdResult", "secondResult", "firstResult"]);
});
