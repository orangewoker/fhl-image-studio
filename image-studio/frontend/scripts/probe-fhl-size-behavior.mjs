#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildResponsesPayload,
  normalizeBaseURL,
  normalizeImageModel,
  normalizeTextModel,
} from "../../../shared/kernel/requestModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const sourceRoot = path.resolve(frontendRoot, "..", "..");

const DEFAULT_SIZES = [
  "864x1536",
  "1024x1536",
  "1152x2048",
  "1536x1024",
  "1024x1024",
];
const DEFAULT_MODES = ["responses", "images"];
const DEFAULT_PROMPTS = ["neutral", "portrait"];
const DEFAULT_QUALITY = "medium";
const DEFAULT_TIMEOUT_MS = 360_000;

const PROMPTS = {
  safe:
    "A clean abstract geometric pattern made of soft colored rectangles and circles on a plain background. No people, no animals, no text, no logos, no symbols.",
  neutral:
    "A cute kitten sits by a quiet river and fishes with a tiny fishing rod. Bright children's book illustration, warm sunlight, green grass, wildflowers, clear water.",
  portrait:
    "Create a vertical 9:16 portrait image on a tall canvas. A cute kitten sits by a quiet river and fishes with a tiny fishing rod. Compose the scene vertically with more height than width, clear foreground, middle ground, and sky, bright children's book illustration.",
};

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const key = arg.slice(2, eq >= 0 ? eq : undefined);
    const value = eq >= 0 ? arg.slice(eq + 1) : "true";
    options[key] = value;
  }
  return options;
}

function splitList(value, fallback) {
  if (!value) return fallback;
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function sanitizeName(value) {
  return String(value || "case").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

function loadConfig(explicitPath) {
  const configPath = explicitPath
    ? path.resolve(explicitPath)
    : path.join(frontendRoot, ".local", "fhl-api.local.json");
  const fileConfig = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""))
    : {};
  const apiKey = process.env.FHL_API_KEY || fileConfig.apiKey || fileConfig.key || "";
  if (!apiKey) {
    throw new Error(`Missing FHL API key. Set FHL_API_KEY or create ${configPath}`);
  }
  return {
    configPath,
    baseURL: process.env.FHL_BASE_URL || fileConfig.baseURL || "https://www.fhl.mom",
    apiKey,
    textModelID: process.env.FHL_TEXT_MODEL || fileConfig.textModelID || "gpt-5.5",
    imageModelID: process.env.FHL_IMAGE_MODEL || fileConfig.imageModelID || "gpt-image-2",
    requestPolicy: process.env.FHL_REQUEST_POLICY || fileConfig.requestPolicy || "openai",
  };
}

function imageDimensionsFromBuffer(buf) {
  if (
    buf.length >= 24
    && buf[0] === 0x89
    && buf[1] === 0x50
    && buf[2] === 0x4e
    && buf[3] === 0x47
    && buf[4] === 0x0d
    && buf[5] === 0x0a
    && buf[6] === 0x1a
    && buf[7] === 0x0a
  ) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: "png" };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: buf.readUInt16BE(i + 5),
          width: buf.readUInt16BE(i + 7),
          type: "jpg",
        };
      }
      i += 2 + len;
    }
  }
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return {
        width: 1 + buf.readUIntLE(24, 3),
        height: 1 + buf.readUIntLE(27, 3),
        type: "webp",
      };
    }
  }
  return null;
}

function imageDimensionsFromBase64(b64) {
  const buf = Buffer.from(String(b64 || ""), "base64");
  return { buffer: buf, dimensions: imageDimensionsFromBuffer(buf) };
}

function aspectLabel(dimensions) {
  if (!dimensions?.width || !dimensions?.height) return "";
  const ratio = dimensions.width / dimensions.height;
  if (Math.abs(ratio - 9 / 16) < 0.02) return "9:16";
  if (Math.abs(ratio - 2 / 3) < 0.02) return "2:3";
  if (Math.abs(ratio - 3 / 2) < 0.02) return "3:2";
  if (Math.abs(ratio - 1) < 0.02) return "1:1";
  return ratio.toFixed(3);
}

function requestedAspectLabel(size) {
  const match = /^(\d+)x(\d+)$/i.exec(String(size || ""));
  if (!match) return String(size || "");
  return aspectLabel({ width: Number(match[1]), height: Number(match[2]) });
}

function dimensionsMatchSize(dimensions, size) {
  const match = /^(\d+)x(\d+)$/i.exec(String(size || ""));
  if (!match || !dimensions) return false;
  return dimensions.width === Number(match[1]) && dimensions.height === Number(match[2]);
}

function aspectMatchesSize(dimensions, size) {
  const match = /^(\d+)x(\d+)$/i.exec(String(size || ""));
  if (!match || !dimensions) return false;
  const requested = Number(match[1]) / Number(match[2]);
  const actual = dimensions.width / dimensions.height;
  return Math.abs(requested - actual) < 0.02;
}

function walkForBase64(value) {
  if (!value) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walkForBase64(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  if (value.type === "image_generation_call" && typeof value.result === "string") return value.result;
  if (typeof value.b64_json === "string") return value.b64_json;
  if (typeof value.result === "string" && value.result.length > 1000) return value.result;
  for (const child of Object.values(value)) {
    const found = walkForBase64(child);
    if (found) return found;
  }
  return "";
}

function extractImageBase64(raw) {
  let final = "";
  const eventTypes = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]" || !payload.startsWith("{")) continue;
    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      continue;
    }
    if (event?.type) eventTypes.push(event.type);
    const found = walkForBase64(event);
    if (found) final = found;
  }
  if (final) return { b64: final, eventTypes };
  try {
    const parsed = JSON.parse(raw);
    return { b64: walkForBase64(parsed), eventTypes };
  } catch {
    return { b64: "", eventTypes };
  }
}

async function fetchText(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}

function makeResponsesRequest(config, prompt, size, quality) {
  const body = buildResponsesPayload({
    prompt,
    mode: "generate",
    apiMode: "responses",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    textModelID: normalizeTextModel(config.textModelID),
    imageModelID: normalizeImageModel(config.imageModelID),
    size,
    quality,
    outputFormat: "png",
    negativePrompt: "",
    requestPolicy: config.requestPolicy,
    partialImages: 0,
    noPromptRevision: true,
    imagePaths: [],
  }, []);
  body.stream = true;
  return {
    url: `${normalizeBaseURL(config.baseURL).replace(/\/v1$/i, "")}/v1/responses`,
    body,
  };
}

function makeImagesRequest(config, prompt, size, quality, options = {}) {
  const body = {
    model: normalizeImageModel(config.imageModelID),
    prompt,
    n: 1,
    size,
    quality,
    output_format: "png",
  };
  if (options.stream !== false) {
    body.stream = true;
    body.partial_images = 0;
  }
  return {
    url: `${normalizeBaseURL(config.baseURL).replace(/\/v1$/i, "")}/v1/images/generations`,
    body,
  };
}

function redactedRequestSummary(mode, request) {
  const body = { ...request.body };
  if (Array.isArray(body.input)) {
    body.input = "[omitted prompt payload]";
  }
  if (Array.isArray(body.tools)) {
    body.tools = body.tools.map((tool) => ({ ...tool }));
  }
  return {
    mode,
    url: request.url,
    body,
  };
}

async function runCase({ config, mode, promptLabel, prompt, size, quality, outputDir, timeoutMs, imagesStream }) {
  const request = mode === "images"
    ? makeImagesRequest(config, prompt, size, quality, { stream: imagesStream })
    : makeResponsesRequest(config, prompt, size, quality);
  const startedAt = Date.now();
  const row = {
    mode,
    promptLabel,
    requestedSize: size,
    requestedAspect: requestedAspectLabel(size),
    quality,
    endpoint: request.url.replace(/^https?:\/\//, ""),
    request: redactedRequestSummary(mode, request),
    ok: false,
    status: 0,
    contentType: "",
    elapsedMs: 0,
    actualWidth: null,
    actualHeight: null,
    actualAspect: "",
    exactSizeMatch: false,
    aspectMatch: false,
    imagePath: "",
    error: "",
    eventTypes: [],
  };
  try {
    const response = await fetchText(request.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream, application/json",
      },
      body: JSON.stringify(request.body),
    }, timeoutMs);
    row.status = response.status;
    row.contentType = response.contentType;
    const { b64, eventTypes } = extractImageBase64(response.text);
    row.eventTypes = [...new Set(eventTypes)].slice(0, 30);
    if (!response.ok) {
      row.error = response.text.slice(0, 800);
      return row;
    }
    if (!b64) {
      row.error = response.text.slice(0, 800) || "No image base64 found";
      return row;
    }
    const { buffer, dimensions } = imageDimensionsFromBase64(b64);
    if (!dimensions) {
      row.error = "Image returned, but dimensions could not be decoded";
      return row;
    }
    row.actualWidth = dimensions.width;
    row.actualHeight = dimensions.height;
    row.actualAspect = aspectLabel(dimensions);
    row.exactSizeMatch = dimensionsMatchSize(dimensions, size);
    row.aspectMatch = aspectMatchesSize(dimensions, size);
    const imageName = `${sanitizeName(mode)}-${sanitizeName(promptLabel)}-${sanitizeName(size)}-${dimensions.width}x${dimensions.height}.${dimensions.type || "png"}`;
    row.imagePath = path.join(outputDir, imageName);
    fs.writeFileSync(row.imagePath, buffer);
    row.ok = true;
    return row;
  } catch (error) {
    row.error = String(error?.message || error);
    return row;
  } finally {
    row.elapsedMs = Date.now() - startedAt;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modes = splitList(args.modes, DEFAULT_MODES).filter((mode) => mode === "responses" || mode === "images");
  const sizes = splitList(args.sizes, DEFAULT_SIZES);
  const promptLabels = splitList(args.prompts, DEFAULT_PROMPTS).filter((label) => PROMPTS[label]);
  const quality = args.quality || DEFAULT_QUALITY;
  const imagesStream = args.stream !== "false";
  const timeoutMs = Number(args.timeoutMs || DEFAULT_TIMEOUT_MS);
  const config = loadConfig(args.config || process.env.FHL_SIZE_PROBE_CONFIG);
  const outputDir = path.resolve(args.out || path.join(sourceRoot, "output", "diagnostics", `fhl-size-probe-${stamp()}`));
  fs.mkdirSync(outputDir, { recursive: true });

  const manifest = {
    createdAt: new Date().toISOString(),
    config: {
      configPath: config.configPath,
      baseURL: config.baseURL,
      textModelID: config.textModelID,
      imageModelID: config.imageModelID,
      requestPolicy: config.requestPolicy,
      apiKey: "<redacted>",
    },
    modes,
    sizes,
    promptLabels,
    quality,
    imagesStream,
    outputDir,
    results: [],
  };

  console.log(`FHL size probe output: ${outputDir}`);
  console.log(`Modes: ${modes.join(", ")}; sizes: ${sizes.join(", ")}; prompts: ${promptLabels.join(", ")}`);

  for (const mode of modes) {
    for (const size of sizes) {
      for (const promptLabel of promptLabels) {
        const label = `${mode} ${size} ${promptLabel}`;
        process.stdout.write(`Running ${label} ... `);
        const result = await runCase({
          config,
          mode,
          promptLabel,
          prompt: PROMPTS[promptLabel],
          size,
          quality,
          outputDir,
          timeoutMs,
          imagesStream,
        });
        manifest.results.push(result);
        const status = result.ok
          ? `${result.actualWidth}x${result.actualHeight} ${result.aspectMatch ? "aspect-ok" : "aspect-mismatch"}`
          : `failed status=${result.status || "n/a"} ${result.error.slice(0, 90).replace(/\s+/g, " ")}`;
        console.log(status);
        fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(manifest, null, 2));
      }
    }
  }

  const lines = [
    "| mode | prompt | requested | actual | exact | aspect | status |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of manifest.results) {
    lines.push(`| ${r.mode} | ${r.promptLabel} | ${r.requestedSize} (${r.requestedAspect}) | ${r.actualWidth ? `${r.actualWidth}x${r.actualHeight} (${r.actualAspect})` : ""} | ${r.exactSizeMatch ? "yes" : "no"} | ${r.aspectMatch ? "yes" : "no"} | ${r.ok ? "ok" : `failed ${r.status || ""}`} |`);
  }
  fs.writeFileSync(path.join(outputDir, "summary.md"), `${lines.join("\n")}\n`);
  console.log(`Done. Summary: ${path.join(outputDir, "summary.md")}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
