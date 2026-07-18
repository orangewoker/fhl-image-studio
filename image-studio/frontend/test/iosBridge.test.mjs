import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const bootstrap = read("../public/ios-bridge.js");
const index = read("../index.html");
const nativeInvoke = read("../src/platform/android/nativeInvoke.ts");
const jobClient = read("../src/platform/runtime/androidJobClient.ts");
const canvasStage = read("../src/platform/android/canvas/AndroidCanvasStage.tsx");
const themeRuntime = read("../src/state/studioStore.shared.ts");
const styles = read("../src/styles/index.css");
const iosShell = read("../../../ios-shell/lib/src/fhl_studio_app.dart");

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

test("iOS locks page and canvas pinch zoom while retaining responsive width", () => {
  assert.match(index, /width=device-width/);
  assert.match(index, /maximum-scale=1\.0/);
  assert.match(index, /user-scalable=no/);
  assert.match(index, /viewport-fit=cover/);
  assert.match(bootstrap, /root\.dataset\.nativePlatform = "ios"/);
  assert.match(bootstrap, /"gesturestart", "gesturechange", "gestureend"/);
  assert.match(canvasStage, /nativeIOSDisablesPinchZoom\(\)/);
  assert.match(iosShell, /\.\.enableZoom\(false\)/);
});

test("iOS native shell and frontend use a forced pure-white base surface", () => {
  assert.match(bootstrap, /root\.style\.backgroundColor = "#ffffff"/);
  assert.match(themeRuntime, /nativeIOSUsesWhiteAppearance\(\)/);
  assert.match(styles, /:root\[data-native-platform="ios"\][\s\S]*--bg: #ffffff;/);
  assert.match(styles, /html\[data-native-platform="ios"\] body,[\s\S]*background-image: none !important;/);
  assert.match(iosShell, /scaffoldBackgroundColor: Colors\.white/);
  assert.match(iosShell, /\.\.setBackgroundColor\(Colors\.white\)/);
});
