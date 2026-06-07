import assert from "node:assert/strict";
import test from "node:test";

const caps = await import("../src/components/panel/sizeCapabilities.ts");

test("FHL aspect presets expose the supported ratio list in order", () => {
  assert.deepEqual(
    caps.ASPECT_PRESETS.map((item) => item.value),
    ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3"],
  );
});

test("gpt-image paths expose explicit 2K/4K resolution presets", () => {
  const values = caps.availableResolutionPresets({
    apiMode: "responses",
    requestPolicy: "openai",
    imageModelID: "gpt-image-2",
  });
  assert.ok(values.includes("2k"));
  assert.ok(values.includes("4k"));
  assert.equal(
    caps.buildSizeSelection("16:9", "4k", {
      apiMode: "responses",
      requestPolicy: "openai",
      imageModelID: "gpt-image-2",
    }),
    "3840x2160",
  );
});

test("non-gpt-image openai-standard paths stay on base resolution presets", () => {
  const values = caps.availableResolutionPresets({
    apiMode: "responses",
    requestPolicy: "openai",
    imageModelID: "custom-relay-image",
  });
  assert.ok(!values.includes("2k"));
  assert.ok(!values.includes("4k"));
  assert.equal(caps.normalizeSizeSelection("3840x2160", {
    apiMode: "responses",
    requestPolicy: "openai",
    imageModelID: "custom-relay-image",
  }), "1536x864");
});

test("compat mode can keep large resolution presets available for compatible relays", () => {
  const values = caps.availableResolutionPresets({
    apiMode: "responses",
    requestPolicy: "compat",
    imageModelID: "relay-image-model",
  });
  assert.ok(values.includes("2k"));
  assert.ok(values.includes("4k"));
});

test("new FHL aspect ratios map to concrete pixel sizes", () => {
  const input = {
    apiMode: "responses",
    requestPolicy: "openai",
    imageModelID: "gpt-image-2",
  };
  const expected = [
    ["4:3", "1k", "1536x1152"],
    ["4:3", "2k", "2048x1536"],
    ["4:3", "4k", "3840x2880"],
    ["3:4", "1k", "1152x1536"],
    ["3:4", "2k", "1536x2048"],
    ["3:4", "4k", "2880x3840"],
    ["5:4", "1k", "1520x1216"],
    ["5:4", "2k", "2040x1632"],
    ["5:4", "4k", "3840x3072"],
    ["4:5", "1k", "1216x1520"],
    ["4:5", "2k", "1632x2040"],
    ["4:5", "4k", "3072x3840"],
    ["2:1", "1k", "1536x768"],
    ["2:1", "2k", "2048x1024"],
    ["2:1", "4k", "3840x1920"],
    ["1:2", "1k", "768x1536"],
    ["1:2", "2k", "1024x2048"],
    ["1:2", "4k", "1920x3840"],
    ["3:1", "1k", "1536x512"],
    ["3:1", "2k", "2040x680"],
    ["3:1", "4k", "3840x1280"],
    ["1:3", "1k", "512x1536"],
    ["1:3", "2k", "680x2040"],
    ["1:3", "4k", "1280x3840"],
  ];
  for (const [aspect, resolution, size] of expected) {
    assert.equal(
      caps.buildSizeSelection(aspect, resolution, input),
      size,
      `${aspect}/${resolution}`,
    );
    assert.equal(caps.deriveAspectPreset(size), aspect, `${size} aspect`);
    assert.equal(caps.deriveResolutionPreset(size), resolution, `${size} resolution`);
  }
});

test("ratio stays independent from resolution preset", () => {
  assert.equal(
    caps.buildSizeSelection("1:1", "2k", {
      apiMode: "responses",
      requestPolicy: "openai",
      imageModelID: "gpt-image-2",
    }),
    "2048x2048",
  );
  assert.equal(
    caps.buildSizeSelection("9:16", "4k", {
      apiMode: "responses",
      requestPolicy: "openai",
      imageModelID: "gpt-image-2",
    }),
    "2160x3840",
  );
});

test("explicit aspect selection can leave Auto size", () => {
  assert.equal(
    caps.buildAspectSizeSelection("9:16", "auto", {
      apiMode: "responses",
      requestPolicy: "openai",
      imageModelID: "gpt-image-2",
    }),
    "864x1536",
  );
});

test("explicit resolution selection can leave Auto size", () => {
  assert.equal(
    caps.buildResolutionSizeSelection("auto", "2k", {
      apiMode: "responses",
      requestPolicy: "openai",
      imageModelID: "gpt-image-2",
    }),
    "2048x2048",
  );
});

test("explicit Auto selections keep upstream-determined size", () => {
  const input = {
    apiMode: "responses",
    requestPolicy: "openai",
    imageModelID: "gpt-image-2",
  };
  assert.equal(caps.buildAspectSizeSelection("auto", "2k", input), "auto");
  assert.equal(caps.buildResolutionSizeSelection("16:9", "auto", input), "auto");
});
