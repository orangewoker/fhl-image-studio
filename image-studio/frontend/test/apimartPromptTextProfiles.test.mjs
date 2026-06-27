import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const {
  APIMART_BASE_URL,
} = await import("../src/lib/profiles.ts");
const { resolvePromptTextCapability } = await import("../src/lib/promptTextProfiles.ts");
const apimartAPISource = await readFile(new URL("../src/lib/apimartAPI.ts", import.meta.url), "utf8");

function makeProfile(overrides = {}) {
  return {
    id: "profile-1",
    name: "Profile",
    apiMode: "responses",
    requestPolicy: "openai",
    baseURL: "https://www.fhl.mom",
    textModelID: "gpt-5.5",
    imageModelID: "gpt-image-2",
    concurrencyLimit: 4,
    imagesNewAPICompat: false,
    createdAt: 1,
    ...overrides,
  };
}

test("APIMart one-click config preserves an existing textModelID", () => {
  assert.match(apimartAPISource, /textModelID:\s*existing\.textModelID/);
  assert.doesNotMatch(
    apimartAPISource,
    /await store\.updateProfile\(existing\.id,[\s\S]*?textModelID:\s*""/,
  );
});

test("APIMart one-click config preserves an existing APIMart base URL", () => {
  assert.match(
    apimartAPISource,
    /await store\.updateProfile\(existing\.id,[\s\S]*?baseURL:\s*existing\.baseURL,/,
  );
  assert.match(
    apimartAPISource,
    /return store\.createProfile\(\{[\s\S]*?baseURL:\s*APIMART_BASE_URL,/,
  );
});

test("APIMart prompt text capability prefers its own text model", () => {
  const capability = resolvePromptTextCapability({
    apiMode: "apimart",
    apiKey: "sk-apimart",
    baseURL: APIMART_BASE_URL,
    textModelID: "gpt-5.2-pro",
    profiles: [makeProfile()],
  });

  assert.equal(capability.available, true);
  assert.equal(capability.provider, "apimart");
  assert.match(capability.label, /gpt-5\.2-pro/);
});

test("APIMart prompt text capability falls back to Responses when textModelID is blank", () => {
  const responses = makeProfile({ id: "responses-1", textModelID: "gpt-4o" });
  const capability = resolvePromptTextCapability({
    apiMode: "apimart",
    apiKey: "sk-apimart",
    baseURL: APIMART_BASE_URL,
    textModelID: "",
    profiles: [responses],
  });

  assert.equal(capability.available, true);
  assert.equal(capability.provider, "responses");
  assert.equal(capability.profile, responses);
  assert.match(capability.label, /gpt-4o/);
});

test("APIMart prompt text capability is unavailable without APIMart text model or Responses fallback", () => {
  const capability = resolvePromptTextCapability({
    apiMode: "apimart",
    apiKey: "sk-apimart",
    baseURL: APIMART_BASE_URL,
    textModelID: "",
    profiles: [
      makeProfile({ id: "images-1", apiMode: "images", baseURL: "https://example.test" }),
    ],
  });

  assert.equal(capability.available, false);
  assert.equal(capability.provider, "none");
  assert.match(capability.reason, /未配置可用文本模型/);
});
