import assert from "node:assert/strict";
import test from "node:test";

const profiles = await import("../src/lib/profiles.ts");

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

test("custom provider names survive profile parsing and drive UI labels", () => {
  const parsed = profiles.tryParseProfile({
    ...makeProfile("私人中转"),
    providerName: "My Private NewAPI",
  });
  assert.equal(parsed.providerName, "My Private NewAPI");
  assert.equal(profiles.upstreamConfigLabel(parsed), "My Private NewAPI");
  assert.equal(profiles.upstreamConfigShortLabel(parsed), "My Privat…");
});

test("FHL image models reject unsupported selections and fall back safely", () => {
  assert.equal(profiles.isSupportedFHLImageModelID("team-codex-gpt-image-2"), true);
  assert.equal(profiles.isSupportedFHLImageModelID("gpt-5.5"), false);
  assert.equal(
    profiles.normalizeFHLImageModelID("https://www.fhl.mom/v1", "gpt-5.5"),
    "gpt-image-2",
  );
  assert.equal(
    profiles.normalizeFHLImageModelID("https://api.openai.example/v1", "custom-image"),
    "custom-image",
  );
});

test("standard images mode is clearly labeled as OpenAI v1", () => {
  assert.equal(profiles.apiModeLabel("images"), "OpenAI 标准 v1");
  assert.equal(profiles.upstreamConfigLabel({ apiMode: "images" }), "OpenAI 标准 v1");
});
