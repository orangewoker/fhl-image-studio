import assert from "node:assert/strict";
import test from "node:test";

import { displayStatusFromContinuousSlot } from "../src/state/batchGridStatus.ts";

function slot(status) {
  return {
    jobId: `job-${status}`,
    groupId: "group-1",
    workspaceId: "ws-1",
    batchIndex: 0,
    status,
    createdAt: 1,
    updatedAt: 1,
    finishedAt: status === "queued" || status === "running" ? undefined : 2,
  };
}

test("displayStatusFromContinuousSlot marks missing continuous grid holes", () => {
  assert.equal(displayStatusFromContinuousSlot(undefined), "missing");
});

test("displayStatusFromContinuousSlot keeps queued and running distinct", () => {
  assert.equal(displayStatusFromContinuousSlot(slot("queued")), "queued");
  assert.equal(displayStatusFromContinuousSlot(slot("running")), "running");
});

test("displayStatusFromContinuousSlot marks succeeded slots without image separately", () => {
  assert.equal(displayStatusFromContinuousSlot(slot("succeeded")), "succeeded_no_image");
});

test("displayStatusFromContinuousSlot keeps failed and interrupted retryable", () => {
  assert.equal(displayStatusFromContinuousSlot(slot("failed")), "failed");
  assert.equal(displayStatusFromContinuousSlot(slot("interrupted")), "failed");
});
