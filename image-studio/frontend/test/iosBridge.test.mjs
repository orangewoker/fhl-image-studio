import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const bootstrap = read("../public/ios-bridge.js");
const index = read("../index.html");
const nativeInvoke = read("../src/platform/android/nativeInvoke.ts");
const jobClient = read("../src/platform/runtime/androidJobClient.ts");

test("iOS Flutter bootstrap exposes the mobile native invoke bridge", () => {
  assert.match(index, /<script src="\.\/ios-bridge\.js"><\/script>/);
  assert.match(bootstrap, /window\.FlutterBridge/);
  assert.match(bootstrap, /window\.AndroidImageStudio = \{/);
  assert.match(bootstrap, /channel\.postMessage\(JSON\.stringify/);
  assert.match(bootstrap, /getDisplayMetricsJson/);
  assert.match(bootstrap, /getDeviceDiagnosticsJson/);
});

test("iOS uses the foreground remote kernel instead of Android background services", () => {
  assert.match(bootstrap, /supportsBackgroundJobs: false/);
  assert.match(nativeInvoke, /hasAndroidBackgroundJobBridge/);
  assert.match(nativeInvoke, /bridge\.supportsBackgroundJobs !== false/);
  assert.match(jobClient, /return hasAndroidBackgroundJobBridge\(\)/);
});
