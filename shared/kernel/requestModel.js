export const DEFAULT_TEXT_MODEL = "gpt-5.5";
export const DEFAULT_IMAGE_MODEL = "gpt-image-2";
export const DEFAULT_SIZE = "1024x1024";
export const DEFAULT_QUALITY = "auto";
export const DEFAULT_OUTPUT_FORMAT = "png";
export const DEFAULT_REQUEST_POLICY = "openai";
export const DEFAULT_PARTIAL_IMAGES = 1;
export const MAX_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = 15_000;
export const STATUS_INTERVAL_MS = 10_000;

const NO_PROMPT_REVISION_INSTRUCTIONS = "You are a tool runner. Pass the user prompt to image_generation VERBATIM. DO NOT rewrite, expand, polish, or revise it in any way. Use the exact text the user gave.";
const SAFE_IMAGE_TOOL_INSTRUCTIONS = "Use the image_generation tool and return an image result, not a text-only answer. If the user's wording is ambiguous or may trigger a safety refusal, adapt it into a policy-compliant visual prompt while preserving the creative intent.";

export function normalizeBaseURL(raw) {
  return String(raw || "").trim().replace(/\/+$/, "");
}

export function normalizeAPIMode(apiMode) {
  return apiMode === "images" ? "images" : "responses";
}

export function normalizeRequestPolicy(requestPolicy) {
  return requestPolicy === "compat" ? "compat" : DEFAULT_REQUEST_POLICY;
}

export function normalizeTextModel(modelID) {
  return String(modelID || "").trim() || DEFAULT_TEXT_MODEL;
}

export function normalizeImageModel(modelID) {
  return String(modelID || "").trim() || DEFAULT_IMAGE_MODEL;
}

export function normalizePromptText(prompt) {
  return String(prompt || "").trim();
}

export function normalizeNegativePrompt(negativePrompt) {
  return String(negativePrompt || "").trim();
}

export function normalizePartialImages(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_PARTIAL_IMAGES;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return DEFAULT_PARTIAL_IMAGES;
  return Math.max(0, Math.min(3, Math.floor(numeric)));
}

export function isCompatRequestPolicy(requestPolicy) {
  return normalizeRequestPolicy(requestPolicy) === "compat";
}

export function classifyImageModel(modelID) {
  const normalized = normalizeImageModel(modelID).toLowerCase();
  if (normalized.startsWith("dall-e-2")) return "dalle2";
  if (normalized.startsWith("dall-e-3")) return "dalle3";
  if (normalized.startsWith("gpt-image") || normalized.startsWith("chatgpt-image")) return "gpt-image";
  return "other";
}

export function supportsImagesResponseFormat(imageModelID, mode = "generate") {
  const family = classifyImageModel(imageModelID);
  if (mode === "edit") return family === "dalle2";
  return family === "dalle2" || family === "dalle3";
}

export function shouldSendExtendedImageParameters(requestPolicy) {
  return isCompatRequestPolicy(requestPolicy);
}

export function shouldUseImagesNewAPICompat(payload) {
  return payload?.imagesNewAPICompat === true;
}

export function fileNameFromPath(path) {
  if (!path) return "image.png";
  return String(path).split(/[\\/]/).pop() || "image.png";
}

export function dataURLFromBase64Image(b64, mimeType = "image/png") {
  const encoded = String(b64 || "").trim();
  if (!encoded) return "";
  return `data:${mimeType};base64,${encoded}`;
}

export function buildResponsesInputContent(prompt, sourceDataURLs) {
  const content = [{ type: "input_text", text: normalizePromptText(prompt) }];
  for (const dataURL of sourceDataURLs) {
    content.push({ type: "input_image", image_url: dataURL });
  }
  return content;
}

export function buildResponsesImageTool(payload, sourceDataURLs, options = {}) {
  const size = payload.size || DEFAULT_SIZE;
  const quality = payload.quality || DEFAULT_QUALITY;
  const outputFormat = payload.outputFormat || DEFAULT_OUTPUT_FORMAT;
  const negativePrompt = normalizeNegativePrompt(payload.negativePrompt);
  const compatExtensions = shouldSendExtendedImageParameters(payload.requestPolicy);
  const tool = {
    type: "image_generation",
    model: normalizeImageModel(payload.imageModelID),
    action: sourceDataURLs.length > 0 ? "edit" : "generate",
    size,
    quality,
    output_format: outputFormat,
    moderation: "low",
    partial_images: normalizePartialImages(payload.partialImages),
  };
  if (compatExtensions && payload.seed) tool.seed = payload.seed;
  if (compatExtensions && negativePrompt) tool.negative_prompt = negativePrompt;

  const maskMimeType = String(options.maskMimeType || "image/png").trim() || "image/png";
  if (payload.maskB64) {
    tool.input_image_mask = {
      image_url: dataURLFromBase64Image(payload.maskB64, maskMimeType),
    };
  }
  return tool;
}

export function buildResponsesPayload(payload, sourceDataURLs, options = {}) {
  const content = buildResponsesInputContent(payload.prompt, sourceDataURLs);
  const tool = {
    ...buildResponsesImageTool(payload, sourceDataURLs, options),
  };

  const request = {
    model: normalizeTextModel(payload.textModelID),
    input: [{ role: "user", content }],
    tools: [tool],
    tool_choice: { type: "image_generation" },
    reasoning: { effort: "xhigh" },
    store: false,
    stream: true,
  };
  request.instructions = payload.noPromptRevision === false
    ? SAFE_IMAGE_TOOL_INSTRUCTIONS
    : NO_PROMPT_REVISION_INSTRUCTIONS;
  return request;
}

export function buildPromptOptimizePayload(input, sourceDataURLs) {
  let instruction = "Rewrite the user's image prompt into a clearer, more detailed prompt for image generation. Keep the meaning, preserve the requested subject, and only return the improved prompt text. Do not add explanations, labels, markdown, or quotes.";
  if (String(input.mode || "").trim() === "edit") {
    instruction += " Treat any attached images as reference context and preserve edit intent.";
  }
  const content = [{ type: "input_text", text: `Original prompt:\n${normalizePromptText(input.prompt)}` }];
  for (const dataURL of sourceDataURLs) {
    content.push({ type: "input_image", image_url: dataURL });
  }
  return {
    model: normalizeTextModel(input.textModelID),
    instructions: instruction,
    input: [{ role: "user", content }],
    reasoning: { effort: "low" },
    store: false,
  };
}

export function retryableMarkers() {
  return [
    "error code 524",
    "524: a timeout occurred",
    "error code 504",
    "gateway time-out",
    "rate_limit_exceeded",
    "upstream_error",
    "service temporarily unavailable",
    "origin_gateway_timeout",
    "no available account",
    "无可用账号",
    "请稍后重试",
  ];
}

export function isRetryableRaw(raw) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();
  if (retryableMarkers().some((marker) => lower.includes(marker))) return true;
  try {
    const data = JSON.parse(text);
    if (data?.retryable === true) return true;
    if ([502, 503, 504, 524].includes(Number(data?.status))) return true;
    const err = data?.error;
    if (err && typeof err === "object") {
      const message = String(err.message || "").toLowerCase();
      const type = String(err.type || "").toLowerCase();
      if (message.includes("temporarily unavailable")) return true;
      if (type === "api_error" || type === "server_error") return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function describeAPIError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  const type = String(error?.type || "");

  switch (code.toLowerCase()) {
    case "moderation_blocked":
      return "🚫 上游内容审核拦截 · 生成被拒";
    case "content_policy_violation":
      return "🚫 上游内容政策拦截 (content_policy_violation)";
    case "rate_limit_exceeded":
      return `⏱ 上游限速 (rate_limit_exceeded)\n\n${message}`;
    case "insufficient_quota":
    case "billing_hard_limit_reached":
      return `💳 上游账户额度不足\n\n${message}`;
    case "model_not_found":
      return `🤷 上游找不到指定模型\n\n${message}`;
    default:
      break;
  }

  const parts = [];
  if (message) parts.push(message);
  const tail = [];
  if (code) tail.push(`code: ${code}`);
  if (type) tail.push(`type: ${type}`);
  if (tail.length > 0) parts.push(`(${tail.join(", ")})`);
  return parts.length > 0 ? `接口返回错误:${parts.join(" ")}` : "接口返回错误";
}

function describeNestedError(value, depth = 0) {
  if (!value || depth > 3) return "";
  if (typeof value === "object") {
    if (value.error && typeof value.error === "object") {
      const nested = typeof value.error.message === "string" ? describeNestedError(value.error.message, depth + 1) : "";
      return nested || describeAPIError(value.error);
    }
    if (value.response?.error && typeof value.response.error === "object") {
      const nested = typeof value.response.error.message === "string" ? describeNestedError(value.response.error.message, depth + 1) : "";
      return nested || describeAPIError(value.response.error);
    }
    if (typeof value.message === "string" && (value.code || value.type)) {
      const nested = describeNestedError(value.message, depth + 1);
      return nested || describeAPIError(value);
    }
    if (typeof value.message === "string") return describeNestedError(value.message, depth + 1);
    return "";
  }
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  try {
    return describeNestedError(JSON.parse(text), depth + 1);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return "";
    try {
      return describeNestedError(JSON.parse(match[0]), depth + 1);
    } catch {
      return "";
    }
  }
}

function pushTextFragment(out, value) {
  const text = String(value || "").trim();
  if (!text || text.length > 4096) return;
  out.push(text);
}

function collectResponseText(value, out = []) {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const child of value) collectResponseText(child, out);
    return out;
  }
  if (typeof value !== "object") return out;
  if (value.type === "output_text" || value.type === "refusal") {
    pushTextFragment(out, value.text || value.content || value.refusal);
  }
  if (typeof value.output_text === "string") pushTextFragment(out, value.output_text);
  if (typeof value.message === "string") pushTextFragment(out, value.message);
  if (typeof value.refusal === "string") pushTextFragment(out, value.refusal);
  for (const [key, child] of Object.entries(value)) {
    if (key === "result" || key === "b64_json" || key === "partial_image_b64" || key === "image_url") continue;
    collectResponseText(child, out);
  }
  return out;
}

function describeTextOnlyResponse(fragments) {
  const unique = [...new Set(fragments.map((part) => part.trim()).filter(Boolean))];
  if (unique.length === 0) return "";
  const joined = unique.join(" ").replace(/\s+/g, " ").trim();
  if (!joined) return "";
  const preview = joined.length > 240 ? `${joined.slice(0, 240)}...` : joined;
  return `上游没有返回图片，只返回了文字：${preview}`;
}

export function describeProblem(raw) {
  const text = String(raw || "").trim();
  if (!text) return "接口返回为空。";
  const lower = text.toLowerCase();
  if (lower.includes("error code 524") || lower.includes("524: a timeout occurred")) {
    return "Cloudflare 524:源站在超时时间内没有返回有效响应。";
  }
  if (lower.includes("error code 504") || lower.includes("gateway time-out")) {
    return "Cloudflare 504:源站网关超时。";
  }

  try {
    const data = JSON.parse(text);
    const nestedError = describeNestedError(data);
    if (nestedError) return nestedError;
    if (data?.error && typeof data.error === "object") return describeAPIError(data.error);
    if (typeof data?.message === "string" && data.message.trim()) return `接口返回消息:${data.message.trim()}`;
    const textOnly = describeTextOnlyResponse(collectResponseText(data));
    if (textOnly) return textOnly;
    if (data?.status && [502, 503, 504, 524].includes(Number(data.status))) {
      return `接口返回 ${data.status}:上游服务超时。`;
    }
  } catch {
    // ignore
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    const payload = line.startsWith("data: ")
      ? line.slice(6).trim()
      : trimmedLine.startsWith("{")
        ? trimmedLine
        : "";
    if (!payload || payload === "[DONE]") continue;
    try {
      const event = JSON.parse(payload);
      const nestedError = describeNestedError(event);
      if (nestedError) return nestedError;
      if (event?.error && typeof event.error === "object") return describeAPIError(event.error);
      if (event?.response?.error && typeof event.response.error === "object") return describeAPIError(event.response.error);
      const textOnly = describeTextOnlyResponse(collectResponseText(event));
      if (textOnly) return textOnly;
    } catch {
      // ignore
    }
  }
  return "接口已返回内容,但没有发现 image_generation_call.result。";
}
