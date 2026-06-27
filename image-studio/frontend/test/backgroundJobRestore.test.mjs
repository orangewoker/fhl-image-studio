import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const storeSource = readFileSync(path.join(frontendRoot, "src", "state", "studioStore.ts"), "utf8");

test("bootstrap reconciles restored batch tasks from browser job registry", () => {
  assert.match(storeSource, /let restoredBatchTasksById = restoredSession\?\.batchTasksById \?\? \{\};/);
  assert.match(
    storeSource,
    /for \(const group of jobGroupsByWorkspace\[workspace\.id\] \?\? \[\]\) \{\s+restoredBatchTasksById = updateTasksFromJobGroup\(/s,
  );
  assert.match(
    storeSource,
    /taskRuntimePatchForWorkspace\(workspace\.id, workspace\.batchTaskIds \?\? \[\], restoredBatchTasksById\)/,
  );
});
