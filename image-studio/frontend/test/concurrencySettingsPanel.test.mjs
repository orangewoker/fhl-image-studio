import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/panel/ControlPanel.tsx", import.meta.url), "utf8");

test("control panel hides shared concurrency when continuous generation is off", () => {
  assert.match(source, /const showSharedConcurrency = continuousGenerateTest;/);
  assert.match(source, /showSharedConcurrency \? \(/);
  assert.doesNotMatch(source, /continuousGenerateTest \|\| batchImageToImageMode/);
});

test("control panel no longer exposes the pressure helper shortcuts", () => {
  assert.doesNotMatch(source, /鍘嬪姏鍔╂墜/);
  assert.doesNotMatch(source, /闅忔満鎻愪氦/);
  assert.doesNotMatch(source, /鍙湪娴嬭瘯鐗堜娇鐢?/);
});