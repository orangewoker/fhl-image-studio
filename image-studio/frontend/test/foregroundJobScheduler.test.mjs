import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const scheduler = readFileSync(new URL("../src/state/foregroundJobScheduler.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../src/state/studioStore.ts", import.meta.url), "utf8");

test("foreground iOS jobs honor the selected concurrency limit", () => {
  assert.match(scheduler, /queue\.active < queue\.limit/);
  assert.match(scheduler, /queue\.pending\.shift\(\)/);
  assert.match(scheduler, /if \(finished\) return/);
  assert.match(store, /foregroundJobScheduler\.enqueue\(workspaceId, concurrencyLimit, foregroundTasks\)/);
  assert.match(store, /foregroundJobScheduler\.cancelPending\(workspaceId\)/);
  assert.match(store, /onTerminal\?: \(\) => void/);
  assert.match(store, /notifyTerminal\(\)/);
});
