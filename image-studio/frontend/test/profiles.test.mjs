import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const profiles = await import("../src/lib/profiles.ts");
const apiKey = await import("../src/lib/apiKey.ts");
const stateDir = path.resolve(import.meta.dirname, "../src/state");

function makeProfile(name) {
  return {
    id: name,
    name,
    apiMode: "responses",
    requestPolicy: "openai",
    baseURL: "",
    textModelID: "",
    imageModelID: "",
    concurrencyLimit: 0,
    createdAt: 1,
  };
}

test("default profile names start from 配置1 even when 主配置 exists", () => {
  assert.equal(profiles.nextDefaultProfileName([makeProfile("主配置")]), "配置1");
});

test("default profile names use the first available numeric slot", () => {
  assert.equal(
    profiles.nextDefaultProfileName([
      makeProfile("主配置"),
      makeProfile("配置1"),
      makeProfile("配置3"),
    ]),
    "配置2",
  );
});

test("blank profiles use sequential default names", () => {
  const existing = [makeProfile("配置1")];
  assert.equal(profiles.makeBlankProfile("images", existing).name, "配置2");
});

test("new profiles default to 4 concurrency", () => {
  assert.equal(profiles.DEFAULT_CONCURRENCY_LIMIT, 4);
  assert.equal(profiles.makeFHLResponsesProfile().concurrencyLimit, 4);
  assert.equal(profiles.makeBlankProfile("responses").concurrencyLimit, 4);
});


test("FHL one-click defaults to Responses API mode", () => {
  const profile = profiles.makeFHLResponsesProfile();
  assert.equal(profile.name, "FHL-1 Responses");
  assert.equal(profile.apiMode, "responses");
  assert.equal(profile.baseURL, profiles.FHL_BASE_URL);
  assert.equal(profile.imageModelID, profiles.FHL_IMAGE_MODEL_ID);
  assert.equal(profile.imagesNewAPICompat, false);
});

test("FHL images companion profile uses the official images mode", () => {
  const profile = profiles.makeFHLImagesProfile();
  assert.equal(profile.name, "FHL-1 Images");
  assert.equal(profile.apiMode, "images");
  assert.equal(profile.baseURL, profiles.FHL_BASE_URL);
  assert.equal(profile.imageModelID, profiles.FHL_IMAGE_MODEL_ID);
  assert.equal(profile.imagesNewAPICompat, true);
});

test("APIMart profiles use the official docs API root", () => {
  assert.equal(profiles.APIMART_BASE_URL, "https://api.apimart.ai");
  const profile = profiles.makeBlankProfile("apimart");
  assert.equal(profile.apiMode, "apimart");
  assert.equal(profile.baseURL, profiles.APIMART_BASE_URL);
  assert.equal(profile.imageModelID, profiles.APIMART_IMAGE_MODEL_ID);
});

test("APIMart official default keeps legacy domain as a valid route", () => {
  assert.equal(profiles.APIMART_BASE_URL, "https://api.apimart.ai");
  assert.equal(profiles.APIMART_LEGACY_BASE_URL, "https://api.apib.ai");
  assert.equal(profiles.normalizeAPIMartBaseURL("https://api.apib.ai"), profiles.APIMART_LEGACY_BASE_URL);
  assert.equal(profiles.normalizeAPIMartBaseURL("https://api.apib.ai/v1"), profiles.APIMART_LEGACY_BASE_URL);
  assert.equal(profiles.normalizeAPIMartBaseURL("https://api.apimart.ai/v1"), profiles.APIMART_BASE_URL);
  assert.equal(profiles.isAPIMartOfficialBaseURL("https://api.apimart.ai/v1"), true);
  assert.equal(profiles.isAPIMartOfficialBaseURL("https://api.apib.ai/v1"), true);

  const parsed = profiles.tryParseProfile({
    id: "apimart-legacy",
    name: "APIMart",
    apiMode: "apimart",
    requestPolicy: "openai",
    baseURL: "https://api.apib.ai/v1",
    textModelID: "",
    imageModelID: "gpt-image-2",
    concurrencyLimit: 6,
    createdAt: 1,
  });
  assert.ok(parsed);
  assert.equal(parsed.baseURL, profiles.APIMART_LEGACY_BASE_URL);
});

test("RunningHub blank profiles default to the local bridge", () => {
  const profile = profiles.makeBlankProfile("runninghub");
  assert.equal(profile.apiMode, "runninghub");
  assert.equal(profile.baseURL, profiles.RUNNINGHUB_BASE_URL);
  assert.equal(profile.imageModelID, profiles.RUNNINGHUB_DEFAULT_MODEL_ID);
  assert.match(profiles.apiModeLabel("runninghub"), /RunningHub/);
});

test("RunningHub profiles round-trip through parser with their model key intact", () => {
  const parsed = profiles.tryParseProfile({
    id: "runninghub-1",
    name: "RH-1 全能图像2",
    apiMode: "runninghub",
    requestPolicy: "openai",
    baseURL: "http://127.0.0.1:8117",
    textModelID: "",
    imageModelID: "image_g2",
    concurrencyLimit: 2,
    createdAt: 1,
  });
  assert.ok(parsed);
  assert.equal(parsed.apiMode, "runninghub");
  assert.equal(parsed.imageModelID, "image_g2");
  assert.equal(parsed.baseURL, "http://127.0.0.1:8117");
});

test("API key input accepts APIMart env and bearer forms without loose extraction", () => {
  assert.equal(apiKey.normalizeAPIKeyInput("APIMART_API_KEY=sk-apimart123456"), "sk-apimart123456");
  assert.equal(apiKey.normalizeAPIKeyInput("Bearer sk-bearer123456"), "sk-bearer123456");
  assert.equal(apiKey.normalizeAPIKeyInput("  sk-direct123456  "), "sk-direct123456");
  assert.throws(() => apiKey.validateAPIKeyForHeader("说明 sk-apimart123456"), /API Key/);
  assert.throws(() => apiKey.validateAPIKeyForHeader("APIMART_API_KEY=sk-good123456\nEXTRA=1"), /API Key/);
});

test("bootstrap keeps FHL profiles on configured local FHL API mode", () => {
  const storeSource = fs.readFileSync(path.join(stateDir, "studioStore.ts"), "utf8");
  assert.ok(storeSource.includes('cleanBaseURL(profile.baseURL) === FHL_BASE_URL'));
  assert.ok(!storeSource.includes('apiMode: localFHLConfig?.apiMode ?? "images"'));
  assert.ok(storeSource.includes('const localFHLAPIMode: APIMode = localFHLConfig?.apiMode || "responses";'));
  assert.ok(storeSource.includes("apiMode: localFHLAPIMode"));
  assert.ok(storeSource.includes("requestPolicy: localFHLRequestPolicy"));
  assert.ok(storeSource.includes('imagesNewAPICompat: localFHLAPIMode === "images"'));
});

test("profile create and update preserve FHL-like API mode", () => {
  const profilesSource = fs.readFileSync(path.join(stateDir, "studioStore.profiles.ts"), "utf8");
  assert.ok(profilesSource.includes("function isFHLProfileConfig"));
  assert.ok(profilesSource.includes('cleanBaseURL(profile.baseURL) === FHL_BASE_URL'));
  assert.ok(profilesSource.includes('imageModelID.trim() === FHL_IMAGE_MODEL_ID'));
  assert.doesNotMatch(profilesSource, /apiMode:\s*"images",\s*requestPolicy:\s*"openai"/);
  assert.ok(profilesSource.includes('imagesNewAPICompat: rawProfile.apiMode === "images"'));
  assert.ok(profilesSource.includes('imagesNewAPICompat: rawNext.apiMode === "images"'));
});

