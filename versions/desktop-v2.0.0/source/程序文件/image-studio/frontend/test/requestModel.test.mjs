import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PARTIAL_IMAGES,
  buildResponsesPayload,
  describeProblem,
  normalizePartialImages,
} from "../../../shared/kernel/requestModel.js";

test("Responses payload defaults partial_images to streaming preview count", () => {
  const payload = buildResponsesPayload({
    prompt: "cat",
    size: "1024x1024",
    quality: "low",
    outputFormat: "png",
    imageModelID: "gpt-image-2",
    textModelID: "gpt-5.5",
    requestPolicy: "openai",
  }, []);
  assert.equal(payload.tools[0].partial_images, DEFAULT_PARTIAL_IMAGES);
});

test("normalizePartialImages clamps OpenAI range", () => {
  assert.equal(normalizePartialImages(undefined), DEFAULT_PARTIAL_IMAGES);
  assert.equal(normalizePartialImages(0), 0);
  assert.equal(normalizePartialImages(-1), DEFAULT_PARTIAL_IMAGES);
  assert.equal(normalizePartialImages(2.8), 2);
  assert.equal(normalizePartialImages(9), 3);
});

test("Responses payload can allow safe prompt adaptation", () => {
  const strictPayload = buildResponsesPayload({
    prompt: "cat",
    size: "1024x1024",
    quality: "low",
    outputFormat: "png",
    imageModelID: "gpt-image-2",
    textModelID: "gpt-5.5",
    requestPolicy: "openai",
    noPromptRevision: true,
  }, []);
  const adaptivePayload = buildResponsesPayload({
    prompt: "cat",
    size: "1024x1024",
    quality: "low",
    outputFormat: "png",
    imageModelID: "gpt-image-2",
    textModelID: "gpt-5.5",
    requestPolicy: "openai",
    noPromptRevision: false,
  }, []);
  assert.ok(strictPayload.instructions.includes("VERBATIM"));
  assert.ok(adaptivePayload.instructions.includes("policy-compliant visual prompt"));
});

test("describeProblem surfaces text-only upstream responses", () => {
  const raw = [
    'data: {"type":"response.output_text.delta","delta":"I cannot help with that request."}',
    'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"Please use a safer prompt."}]}]}}',
  ].join("\n");
  const message = describeProblem(raw);
  assert.match(message, /上游没有返回图片/);
  assert.match(message, /Please use a safer prompt/);
});
