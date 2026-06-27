import assert from "node:assert/strict";
import test from "node:test";

const autoAspect = await import("../src/state/autoAspectSizing.ts");

test("auto aspect size follows APIMart ratio parameters under APIMart profile", () => {
  const input = { apiMode: "apimart", requestPolicy: "openai", imageModelID: "seedream-4.0" };
  assert.equal(autoAspect.buildAutoAspectSizeFromDimensions("1k", 720, 1280, input), "9:16@1k");
  assert.equal(autoAspect.buildAutoAspectSizeFromDimensions("2k", 2560, 1080, input), "21:9@2k");
});

test("auto aspect size follows FHL pixel matrix under FHL profile", () => {
  const input = { apiMode: "responses", requestPolicy: "openai", imageModelID: "gpt-image-2" };
  assert.equal(autoAspect.buildAutoAspectSizeFromDimensions("1k", 720, 1280, input), "864x1536");
  assert.equal(autoAspect.buildAutoAspectSizeFromDimensions("1k", 1600, 1200, input), "1536x1152");
});

test("auto aspect chooses the nearest preset from the active picker set", () => {
  assert.equal(autoAspect.nearestSourceAspectPreset(1600, 1200), "4:3");
  assert.equal(autoAspect.nearestSourceAspectPreset(1200, 1600), "3:4");
  assert.equal(autoAspect.nearestSourceAspectPreset(1120, 896), "5:4");
});

test("auto aspect size input is derived from the active profile", () => {
  const state = {
    apiMode: "responses",
    requestPolicy: "openai",
    imageModelID: "fhl-image",
    activeProfileId: "apimart-2",
    profiles: [
      {
        id: "apimart-2",
        apiMode: "apimart",
        requestPolicy: "openai",
        imageModelID: "seedream-4.0",
      },
    ],
  };

  assert.deepEqual(autoAspect.autoAspectSizeInputFromState(state), {
    apiMode: "apimart",
    requestPolicy: "openai",
    imageModelID: "seedream-4.0",
    mode: undefined,
  });
});

test("batch auto aspect follows the first reference slot", () => {
  assert.equal(autoAspect.autoAspectUsesBatchSourceForReferenceOrder(0, 1), true);
  assert.equal(autoAspect.autoAspectUsesBatchSourceForReferenceOrder(1, 1), false);
  assert.equal(autoAspect.autoAspectUsesBatchSourceForReferenceOrder(8, 0), true);
});
