import assert from "node:assert/strict";
import test from "node:test";

import {
  continuousRuntimeStateFromJobGroups,
  filterVisibleJobGroupsForWorkspace,
  latestContinuousSlotsByIndex,
  runtimeStateFromJobGroups,
} from "../src/state/browserJobs.ts";

function makeSlot(batchIndex, status) {
  return {
    jobId: `job-${batchIndex}`,
    groupId: "group-1",
    workspaceId: "ws-1",
    batchIndex,
    status,
    createdAt: batchIndex,
    updatedAt: batchIndex,
    finishedAt: batchIndex,
    stage: status === "failed" ? "生成失败 / 未返回" : "完成",
  };
}

test("runtimeStateFromJobGroups keeps completed batch slot count after a group finishes", () => {
  const slots = [
    makeSlot(0, "succeeded"),
    makeSlot(1, "failed"),
    makeSlot(2, "succeeded"),
    makeSlot(3, "succeeded"),
    makeSlot(4, "failed"),
    makeSlot(5, "succeeded"),
    makeSlot(6, "failed"),
    makeSlot(7, "succeeded"),
    makeSlot(8, "failed"),
  ];

  const runtime = runtimeStateFromJobGroups([
    {
      groupId: "group-1",
      workspaceId: "ws-1",
      createdAt: 100,
      mode: "generate",
      apiMode: "fhl",
      prompt: "prompt",
      batchCount: 9,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      slotIds: slots.map((slot) => slot.jobId),
      slots,
      statusSummary: {
        queued: 0,
        running: 0,
        succeeded: 5,
        failed: 4,
        cancelled: 0,
        interrupted: 0,
      },
    },
  ]);

  assert.deepEqual(runtime.runningJobs, []);
  assert.equal(runtime.isRunning, false);
  assert.equal(runtime.jobsTotal, 9);
  assert.equal(runtime.jobsCompleted, 9);
});

test("filterVisibleJobGroupsForWorkspace hides groups cleared from a workspace view", () => {
  const oldGroup = {
    groupId: "old-group",
    workspaceId: "ws-1",
    createdAt: 100,
    mode: "generate",
    apiMode: "responses",
    prompt: "old",
    batchCount: 1,
    size: "1024x1024",
    quality: "medium",
    outputFormat: "png",
    slotIds: [],
    slots: [],
    statusSummary: { queued: 0, running: 0, succeeded: 1, failed: 0, cancelled: 0, interrupted: 0 },
  };
  const newGroup = {
    ...oldGroup,
    groupId: "new-group",
    createdAt: 300,
    prompt: "new",
  };

  assert.deepEqual(
    filterVisibleJobGroupsForWorkspace({ clearedJobGroupsBefore: 200 }, [oldGroup, newGroup]).map((group) => group.groupId),
    ["new-group"],
  );
});

test("runtimeStateFromJobGroups normalizes stale mojibake progress text", () => {
  const slot = {
    ...makeSlot(0, "running"),
    status: "running",
    stage: "绛夊緟涓婃父杩斿洖",
    elapsedSec: 10,
    bytes: 0,
  };

  const runtime = runtimeStateFromJobGroups([
    {
      groupId: "group-1",
      workspaceId: "ws-1",
      createdAt: 100,
      mode: "generate",
      apiMode: "responses",
      prompt: "prompt",
      batchCount: 1,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      slotIds: [slot.jobId],
      slots: [slot],
      statusSummary: {
        queued: 0,
        running: 1,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
        interrupted: 0,
      },
    },
  ]);

  assert.equal(runtime.progress.stage, "等待上游返回");
  assert.equal(runtime.lastLogLine, "等待上游返回");
});

test("continuousRuntimeStateFromJobGroups aggregates continuous single-image groups", () => {
  const firstSlots = [
    { ...makeSlot(0, "succeeded"), jobId: "job-a", groupId: "group-a", createdAt: 100, updatedAt: 120 },
  ];
  const secondSlots = [
    { ...makeSlot(0, "running"), jobId: "job-b", groupId: "group-b", createdAt: 200, updatedAt: 230, stage: "处理中", elapsedSec: 8, bytes: 2048 },
  ];
  const thirdSlots = [
    { ...makeSlot(0, "queued"), jobId: "job-c", groupId: "group-c", createdAt: 300, updatedAt: 300, stage: "排队中" },
  ];

  const runtime = continuousRuntimeStateFromJobGroups([
    {
      groupId: "group-c",
      workspaceId: "ws-1",
      createdAt: 300,
      mode: "generate",
      apiMode: "responses",
      prompt: "prompt c",
      batchCount: 1,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      continuousGenerateTest: true,
      continuousBatchIndex: 2,
      slotIds: thirdSlots.map((slot) => slot.jobId),
      slots: thirdSlots,
      statusSummary: { queued: 1, running: 0, succeeded: 0, failed: 0, cancelled: 0, interrupted: 0 },
    },
    {
      groupId: "group-b",
      workspaceId: "ws-1",
      createdAt: 200,
      mode: "generate",
      apiMode: "responses",
      prompt: "prompt b",
      batchCount: 1,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      continuousGenerateTest: true,
      continuousBatchIndex: 1,
      slotIds: secondSlots.map((slot) => slot.jobId),
      slots: secondSlots,
      statusSummary: { queued: 0, running: 1, succeeded: 0, failed: 0, cancelled: 0, interrupted: 0 },
    },
    {
      groupId: "group-a",
      workspaceId: "ws-1",
      createdAt: 100,
      mode: "generate",
      apiMode: "responses",
      prompt: "prompt a",
      batchCount: 1,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      continuousGenerateTest: true,
      continuousBatchIndex: 0,
      slotIds: firstSlots.map((slot) => slot.jobId),
      slots: firstSlots,
      statusSummary: { queued: 0, running: 0, succeeded: 1, failed: 0, cancelled: 0, interrupted: 0 },
    },
  ]);

  assert.deepEqual(runtime.runningJobs, ["job-b", "job-c"]);
  assert.equal(runtime.isRunning, true);
  assert.equal(runtime.jobsTotal, 3);
  assert.equal(runtime.jobsCompleted, 1);
  assert.equal(runtime.progress.stage, "排队中");
});

test("continuousRuntimeStateFromJobGroups keeps retry in the original slot", () => {
  const oldFailed = {
    ...makeSlot(0, "failed"),
    jobId: "job-old-18",
    groupId: "group-old-18",
    createdAt: 100,
    updatedAt: 100,
  };
  const retryRunning = {
    ...makeSlot(0, "running"),
    jobId: "job-retry-18",
    groupId: "group-retry-18",
    createdAt: 300,
    updatedAt: 320,
    stage: "重新生成中",
  };
  const neighborFailed = {
    ...makeSlot(0, "failed"),
    jobId: "job-old-20",
    groupId: "group-old-20",
    createdAt: 200,
    updatedAt: 200,
  };
  const groups = [
    {
      groupId: "group-retry-18",
      workspaceId: "ws-1",
      createdAt: 300,
      mode: "generate",
      apiMode: "responses",
      prompt: "retry prompt 18",
      batchCount: 1,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      continuousGenerateTest: true,
      continuousBatchIndex: 17,
      slotIds: [retryRunning.jobId],
      slots: [retryRunning],
      statusSummary: { queued: 0, running: 1, succeeded: 0, failed: 0, cancelled: 0, interrupted: 0 },
    },
    {
      groupId: "group-old-20",
      workspaceId: "ws-1",
      createdAt: 200,
      mode: "generate",
      apiMode: "responses",
      prompt: "failed prompt 20",
      batchCount: 1,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      continuousGenerateTest: true,
      continuousBatchIndex: 19,
      slotIds: [neighborFailed.jobId],
      slots: [neighborFailed],
      statusSummary: { queued: 0, running: 0, succeeded: 0, failed: 1, cancelled: 0, interrupted: 0 },
    },
    {
      groupId: "group-old-18",
      workspaceId: "ws-1",
      createdAt: 100,
      mode: "generate",
      apiMode: "responses",
      prompt: "failed prompt 18",
      batchCount: 1,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      continuousGenerateTest: true,
      continuousBatchIndex: 17,
      slotIds: [oldFailed.jobId],
      slots: [oldFailed],
      statusSummary: { queued: 0, running: 0, succeeded: 0, failed: 1, cancelled: 0, interrupted: 0 },
    },
  ];

  const runtime = continuousRuntimeStateFromJobGroups(groups);
  const latestByIndex = latestContinuousSlotsByIndex(groups);

  assert.equal(runtime.jobsTotal, 20);
  assert.equal(runtime.jobsCompleted, 1);
  assert.equal(runtime.jobsFailed, 1);
  assert.deepEqual(runtime.runningJobs, ["job-retry-18"]);
  assert.equal(latestByIndex.get(17).slot.jobId, "job-retry-18");
  assert.equal(latestByIndex.get(19).slot.jobId, "job-old-20");
});

test("latestContinuousSlotsByIndex replaces a failed retry slot with succeeded result", () => {
  const oldFailed = {
    ...makeSlot(0, "failed"),
    jobId: "job-old-18",
    groupId: "group-old-18",
    createdAt: 100,
    updatedAt: 100,
  };
  const retrySucceeded = {
    ...makeSlot(0, "succeeded"),
    jobId: "job-retry-18",
    groupId: "group-retry-18",
    createdAt: 300,
    updatedAt: 340,
  };
  const groups = [
    {
      groupId: "group-retry-18",
      workspaceId: "ws-1",
      createdAt: 300,
      mode: "generate",
      apiMode: "responses",
      prompt: "retry prompt 18",
      batchCount: 1,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      continuousGenerateTest: true,
      continuousBatchIndex: 17,
      slotIds: [retrySucceeded.jobId],
      slots: [retrySucceeded],
      statusSummary: { queued: 0, running: 0, succeeded: 1, failed: 0, cancelled: 0, interrupted: 0 },
    },
    {
      groupId: "group-old-18",
      workspaceId: "ws-1",
      createdAt: 100,
      mode: "generate",
      apiMode: "responses",
      prompt: "failed prompt 18",
      batchCount: 1,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      continuousGenerateTest: true,
      continuousBatchIndex: 17,
      slotIds: [oldFailed.jobId],
      slots: [oldFailed],
      statusSummary: { queued: 0, running: 0, succeeded: 0, failed: 1, cancelled: 0, interrupted: 0 },
    },
  ];

  const runtime = continuousRuntimeStateFromJobGroups(groups);
  const latestByIndex = latestContinuousSlotsByIndex(groups);

  assert.equal(runtime.jobsTotal, 18);
  assert.equal(runtime.jobsCompleted, 1);
  assert.equal(runtime.jobsFailed, 0);
  assert.deepEqual(runtime.runningJobs, []);
  assert.equal(latestByIndex.get(17).slot.jobId, "job-retry-18");
});

test("continuousRuntimeStateFromJobGroups keeps completed continuous window size", () => {
  const groups = [
    {
      groupId: "group-last",
      workspaceId: "ws-1",
      createdAt: 300,
      mode: "generate",
      apiMode: "responses",
      prompt: "prompt 32",
      batchCount: 1,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      continuousGenerateTest: true,
      continuousBatchIndex: 31,
      slotIds: ["job-32"],
      slots: [{ ...makeSlot(0, "succeeded"), jobId: "job-32", groupId: "group-last", updatedAt: 340 }],
      statusSummary: { queued: 0, running: 0, succeeded: 1, failed: 0, cancelled: 0, interrupted: 0 },
    },
    {
      groupId: "group-first",
      workspaceId: "ws-1",
      createdAt: 100,
      mode: "generate",
      apiMode: "responses",
      prompt: "prompt 1",
      batchCount: 1,
      size: "864x1536",
      quality: "medium",
      outputFormat: "png",
      continuousGenerateTest: true,
      continuousBatchIndex: 0,
      slotIds: ["job-1"],
      slots: [{ ...makeSlot(0, "succeeded"), jobId: "job-1", groupId: "group-first", updatedAt: 120 }],
      statusSummary: { queued: 0, running: 0, succeeded: 1, failed: 0, cancelled: 0, interrupted: 0 },
    },
  ];

  const runtime = continuousRuntimeStateFromJobGroups(groups);

  assert.equal(runtime.jobsTotal, 32);
  assert.equal(runtime.jobsCompleted, 2);
  assert.equal(runtime.isRunning, false);
});
