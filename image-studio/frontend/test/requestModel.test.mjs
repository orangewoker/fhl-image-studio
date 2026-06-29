import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PARTIAL_IMAGES,
  buildPromptReversePayload,
  buildResponsesPayload,
  describeProblem,
  isRetryableRaw,
  normalizeOpenAIImageSize,
  normalizePartialImages,
  repairSizeForOpenAI,
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

test("FHL exact-size gpt-image-2 Responses disables partial previews for stable final ratio", () => {
  const payload = buildResponsesPayload({
    prompt: "portrait ratio test",
    size: "864x1536",
    quality: "medium",
    outputFormat: "png",
    imageModelID: "gpt-image-2",
    textModelID: "gpt-5.5",
    requestPolicy: "openai",
    apiMode: "responses",
    baseURL: "https://www.fhl.mom",
  }, []);
  assert.equal(payload.tools[0].partial_images, 0);
  assert.match(payload.instructions, /9:16/);
  assert.match(payload.instructions, /MUST use/);
  assert.match(payload.input[0].content[0].text, /竖版/);
  assert.match(payload.input[0].content[0].text, /9:16/);
  assert.match(payload.input[0].content[0].text, /竖版/);
});

test("FHL exact-size gpt-image-2 Responses adds Chinese aspect suffix by orientation", () => {
  const cases = [
    { size: "1024x1024", aspect: "1:1", copy: /正方形/ },
    { size: "1536x864", aspect: "16:9", copy: /横版/ },
    { size: "864x1536", aspect: "9:16", copy: /竖版/ },
    { size: "2048x1024", aspect: "2:1", copy: /横版/ },
    { size: "1024x2048", aspect: "1:2", copy: /竖版/ },
  ];
  for (const item of cases) {
    const payload = buildResponsesPayload({
      prompt: "ratio matrix test",
      size: item.size,
      quality: "medium",
      outputFormat: "png",
      imageModelID: "gpt-image-2",
      textModelID: "gpt-5.5",
      requestPolicy: "openai",
      apiMode: "responses",
      baseURL: "https://www.fhl.mom",
    }, []);
    const text = payload.input[0].content[0].text;
    assert.equal(payload.tools[0].partial_images, 0);
    assert.match(payload.instructions, new RegExp(item.aspect));
    assert.match(text, new RegExp(item.aspect));
    assert.match(text, item.copy);
  }
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

test("reverse prompt payload describes attached images as text-to-image prompt", () => {
  const payload = buildPromptReversePayload({ textModelID: "gpt-vision-text" }, ["data:image/png;base64,abc"]);
  assert.equal(payload.model, "gpt-vision-text");
  assert.match(payload.instructions, /Simplified Chinese text-to-image prompt/);
  assert.match(payload.instructions, /must be in Simplified Chinese/);
  assert.match(payload.instructions, /Return only the prompt text/);
  const content = payload.input[0].content;
  assert.equal(content[0].type, "input_text");
  assert.match(content[0].text, /Write a Simplified Chinese text-to-image prompt/);
  assert.equal(content[1].type, "input_image");
  assert.equal(content[1].image_url, "data:image/png;base64,abc");
});

test("describeProblem surfaces text-only upstream responses", () => {
  const raw = [
    'data: {"type":"response.output_text.delta","delta":"I cannot help with that request."}',
    'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"Please use a safer prompt."}]}]}}',
  ].join("\n");
  const message = describeProblem(raw);
  assert.match(message, /Text-only response/);
  assert.match(message, /Please use a safer prompt/);
});

test("describeProblem unwraps nested upstream error messages", () => {
  const nested = JSON.stringify({
    error: {
      code: null,
      message: JSON.stringify({
        error: {
          code: "rate_limit_exceeded",
          message: "Rate limit reached for gpt-image-2-codex",
        },
        type: "error",
      }),
      type: "invalid_request_error",
    },
  });
  const raw = [
    'data: {"type":"response.image_generation_call.generating"}',
    nested,
    'data: {"type":"response.failed","response":{"error":{"code":"upstream_error","message":"Upstream request failed"}}}',
  ].join("\n");
  const message = describeProblem(raw);
  assert.match(message, /rate_limit_exceeded/);
  assert.match(message, /Rate limit reached/);
});

test("isRetryableRaw treats nested upstream rate limit as retryable", () => {
  const raw = [
    'data: {"type":"response.image_generation_call.generating"}',
    '{"error":{"message":"{\\"error\\":{\\"code\\":\\"rate_limit_exceeded\\",\\"message\\":\\"Rate limit reached\\"}}","type":"invalid_request_error"}}',
  ].join("\n");
  assert.equal(isRetryableRaw(raw), true);
});
test("normalizeOpenAIImageSize enforces current GPT Image pixel limits", () => {
  assert.deepEqual(normalizeOpenAIImageSize("3841x2161"), { width: 3840, height: 2160 });
  assert.deepEqual(normalizeOpenAIImageSize("512x512"), { width: 816, height: 816 });
});

test("Responses payload repairs explicit image sizes before submit", () => {
  const payload = buildResponsesPayload({
    prompt: "cat",
    size: "1793x1025",
    quality: "low",
    outputFormat: "png",
    imageModelID: "gpt-image-2",
    textModelID: "gpt-5.5",
    requestPolicy: "openai",
  }, []);
  assert.equal(payload.tools[0].size, "1792x1024");
  assert.equal(repairSizeForOpenAI({ size: "512x512" })?.size, "816x816");
});

test("Responses payload preserves size auto for GPT Image requests", () => {
  const payload = buildResponsesPayload({
    prompt: "cat",
    size: "auto",
    quality: "auto",
    outputFormat: "png",
    imageModelID: "gpt-image-2",
    textModelID: "gpt-5.5",
    requestPolicy: "openai",
  }, []);
  assert.equal(payload.tools[0].size, "auto");
});
