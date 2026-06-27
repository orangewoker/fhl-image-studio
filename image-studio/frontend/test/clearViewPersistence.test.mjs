import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mediaSource = await readFile(new URL("../src/state/studioStore.media.ts", import.meta.url), "utf8");

test("clear view removes the active workspace job group cache", () => {
  const actionStart = mediaSource.indexOf("closeHistoryGalleryToEmpty() {");
  assert.notEqual(actionStart, -1, "clear-view action should exist");
  const actionBody = mediaSource.slice(actionStart, mediaSource.indexOf("    setHistoryGallerySort", actionStart));
  assert.match(
    actionBody,
    /jobGroupsByWorkspace:\s*\{\s*\.\.\.state\.jobGroupsByWorkspace,\s*\[state\.activeWorkspaceId\]:\s*\[\]\s*\}/,
  );
  assert.match(
    actionBody,
    /Object\.entries\(state\.batchTasksById\)\.filter\(\(\[, task\]\) => task\.workspaceId !== state\.activeWorkspaceId\)/,
  );
  assert.match(actionBody, /clearedJobGroupsBefore:\s*clearedAt/);
});
