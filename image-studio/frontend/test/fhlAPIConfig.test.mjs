import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("FHL one-click config creates companion Responses and Images profiles", () => {
  const fhlAPI = source("../src/lib/fhlAPI.ts");
  const profiles = source("../src/lib/profiles.ts");
  const cliConfig = source("../src/lib/cliConfigSync.ts");
  const choiceModal = source("../src/components/panel/FHLAPIChoiceModal.tsx");
  const quickModal = source("../src/components/panel/FHLQuickConfigModal.tsx");
  const desktopHeader = source("../src/components/layout/AppHeaderBrand.tsx");
  const androidHeader = source("../src/components/layout/AppHeader.tsx");
  const settingsPanel = source("../src/components/panel/SettingsPanel.tsx");
  const upstreamConfig = source("../src/components/panel/UpstreamConfigModal.tsx");

  assert.match(profiles, /FHL_PROFILE_NAME = "FHL-1 Responses"/);
  assert.match(profiles, /FHL_IMAGES_PROFILE_NAME = "FHL-1 Images"/);
  assert.match(profiles, /export function makeFHLImagesProfile\(\)/);
  assert.match(fhlAPI, /export async function ensureFHLProfiles/);
  assert.match(fhlAPI, /export async function configureFHLProfilesWithSharedAPIKey/);
  assert.match(fhlAPI, /export async function verifyFHLImageCapability/);
  assert.match(fhlAPI, /probeCurrentUpstream/);
  assert.doesNotMatch(fhlAPI, /requestResponsesOnce/);
  assert.doesNotMatch(fhlAPI, /requestImagesOnce/);
  assert.match(fhlAPI, /FHL_VERIFY_TIMEOUT_MS = 45_000/);
  assert.match(fhlAPI, /apiMode: "responses"/);
  assert.match(fhlAPI, /apiMode: "images"/);
  assert.match(fhlAPI, /连接验证成功（\/v1\/models）/);
  assert.match(fhlAPI, /imagesNewAPICompat: true/);
  assert.match(fhlAPI, /setActive: false/);
  assert.match(choiceModal, /FHL-\.\.\. Responses/);
  assert.match(choiceModal, /两套配置与连接验证/);
  assert.match(quickModal, /configureFHLProfilesWithSharedAPIKey/);
  assert.match(quickModal, /verifyFHLImageCapability/);
  assert.match(quickModal, /正在连接验证 Responses/);
  assert.match(quickModal, /正在连接验证 Images/);
  assert.ok(
    quickModal.indexOf("正在连接验证 Responses") < quickModal.indexOf("正在连接验证 Images"),
    "FHL quick config should validate Responses before Images",
  );
  assert.doesNotMatch(quickModal, /Promise\.all/);
  assert.match(quickModal, /只探测 \/v1\/models，不生成测试图/);
  assert.match(quickModal, /Responses API/);
  assert.match(quickModal, /Images API/);
  assert.match(quickModal, /打开上游配置/);
  assert.match(cliConfig, /const apiMode = input\.apiMode \|\| "images"/);
  assert.match(cliConfig, /apiMode,/);
  assert.match(upstreamConfig, /FHLQuickConfigModal/);
  assert.match(desktopHeader, /FHLQuickConfigModal/);
  assert.match(androidHeader, /FHLQuickConfigModal/);
  assert.match(settingsPanel, /FHLQuickConfigModal/);
});
