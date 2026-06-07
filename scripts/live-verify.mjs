import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import worker from "../cloudflare-worker/src/index.js";
import {
  buildPromptOptimizePayload,
  buildResponsesPayload,
  normalizeBaseURL,
} from "../shared/kernel/requestModel.js";

async function loadEnvOverrides() {
  const candidates = [".env.live", ".env.local", ".env"];
  const loaded = {};
  for (const file of candidates) {
    try {
      const raw = await readFile(file, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx <= 0) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
        if (!(key in loaded)) loaded[key] = value;
      }
    } catch {
      // ignore missing local env file
    }
  }
  return loaded;
}

const envOverrides = await loadEnvOverrides();
const envValue = (key, fallback = "") => process.env[key] || envOverrides[key] || fallback;

const upstreamBaseURL = normalizeBaseURL(envValue("IMAGE_STUDIO_UPSTREAM_BASE_URL"));
const apiKey = envValue("IMAGE_STUDIO_API_KEY").trim();
const textModelID = envValue("IMAGE_STUDIO_TEXT_MODEL_ID", "gpt-5.5").trim();
const imageModelID = envValue("IMAGE_STUDIO_IMAGE_MODEL_ID", "gpt-image-2").trim();
const port = Number(envValue("LIVE_VERIFY_PORT", "41744"));
const workerOrigin = `http://127.0.0.1:${port}`;

if (!upstreamBaseURL || !apiKey) {
  console.error("Missing IMAGE_STUDIO_UPSTREAM_BASE_URL or IMAGE_STUDIO_API_KEY (checked process env, .env.live, .env.local, .env)");
  process.exit(2);
}

function summarizeJSON(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.data)) {
      return {
        kind: "data",
        count: parsed.data.length,
        firstId: parsed.data[0]?.id ?? null,
        hasB64: !!parsed.data[0]?.b64_json,
      };
    }
    if (typeof parsed?.output_text === "string") {
      return {
        kind: "output_text",
        outputText: parsed.output_text,
      };
    }
    return {
      kind: "json",
      keys: Object.keys(parsed),
    };
  } catch {
    return { kind: "raw", preview: raw.slice(0, 160) };
  }
}

function summarizeSSE(raw) {
  const lines = raw.split(/\r?\n/).filter((line) => line.startsWith("data: "));
  const lastPayload = lines.length > 0 ? lines[lines.length - 1].slice(6).trim() : "";
  let parsed = null;
  try {
    parsed = lastPayload ? JSON.parse(lastPayload) : null;
  } catch {
    parsed = null;
  }
  return {
    lineCount: lines.length,
    lastType: parsed?.type ?? null,
    hasImageResult: !!parsed?.item?.result,
    revisedPrompt: parsed?.item?.revised_prompt ?? null,
  };
}

async function requestJSON(url, init) {
  const response = await fetch(url, init);
  const raw = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    raw,
    parsed,
    summary: summarizeJSON(raw),
  };
}

async function requestText(url, init) {
  const response = await fetch(url, init);
  const raw = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    raw,
    summary: summarizeSSE(raw),
  };
}

const proxyServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", workerOrigin);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const request = new Request(workerOrigin + url.pathname + url.search, {
    method: req.method,
    headers: {
      ...Object.fromEntries(Object.entries(req.headers).filter(([, value]) => typeof value === "string")),
      "x-image-studio-upstream-base-url": upstreamBaseURL,
    },
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
  });
  const response = await worker.fetch(request, {
    IMAGE_STUDIO_UPSTREAM_BASE_URL: upstreamBaseURL,
  });
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  res.end(Buffer.from(await response.arrayBuffer()));
});

await new Promise((resolve) => proxyServer.listen(port, "127.0.0.1", resolve));

const directModels = await requestJSON(`${upstreamBaseURL}/v1/models`, {
  method: "GET",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  },
});

const workerModels = await requestJSON(`${workerOrigin}/v1/models`, {
  method: "GET",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  },
});

const promptOptimizePayload = buildPromptOptimizePayload({
  prompt: "cat",
  mode: "generate",
  textModelID,
}, []);

const directOptimize = await requestJSON(`${upstreamBaseURL}/v1/responses`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(promptOptimizePayload),
});

const workerOptimize = await requestJSON(`${workerOrigin}/kernel/prompt-optimize`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    baseURL: upstreamBaseURL,
    prompt: "cat",
    mode: "generate",
    textModelID,
    sourceDataURLs: [],
  }),
});

const generatePayload = buildResponsesPayload({
  prompt: "a single red dot",
  size: "1024x1024",
  quality: "low",
  outputFormat: "png",
  imageModelID,
  textModelID,
  seed: 0,
  negativePrompt: "",
  maskB64: "",
  noPromptRevision: false,
}, []);

const directResponses = await requestText(`${upstreamBaseURL}/v1/responses`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream, application/json",
  },
  body: JSON.stringify(generatePayload),
});

const workerResponses = await requestText(`${workerOrigin}/v1/responses`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream, application/json",
  },
  body: JSON.stringify({
    apiKey,
    mode: "generate",
    prompt: "a single red dot",
    size: "1024x1024",
    quality: "low",
    outputFormat: "png",
    imagePaths: [],
    imagePath: "",
    maskB64: "",
    seed: 0,
    negativePrompt: "",
    baseURL: upstreamBaseURL,
    textModelID,
    imageModelID,
    apiMode: "responses",
    noPromptRevision: false,
  }),
});

function makeImagesGenerationBody() {
  return JSON.stringify({
    model: imageModelID,
    prompt: "a single blue dot",
    n: 1,
    size: "1024x1024",
    quality: "low",
    output_format: "png",
    response_format: "b64_json",
  });
}

function makeImagesEditForm() {
  const form = new FormData();
  form.append("image", new Blob(["png-bytes"], { type: "image/png" }), "source.png");
  form.append("prompt", "make it orange");
  form.append("model", imageModelID);
  form.append("n", "1");
  form.append("size", "1024x1024");
  form.append("quality", "low");
  form.append("output_format", "png");
  form.append("response_format", "b64_json");
  return form;
}

const directImagesGenerate = await requestJSON(`${upstreamBaseURL}/v1/images/generations`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: makeImagesGenerationBody(),
});

const workerImagesGenerate = await requestJSON(`${workerOrigin}/v1/images/generations`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: makeImagesGenerationBody(),
});

const directImagesEdit = await requestJSON(`${upstreamBaseURL}/v1/images/edits`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  },
  body: makeImagesEditForm(),
});

const workerImagesEdit = await requestJSON(`${workerOrigin}/v1/images/edits`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  },
  body: makeImagesEditForm(),
});

proxyServer.close();

console.log(JSON.stringify({
  upstreamBaseURL,
  directModels: { status: directModels.status, summary: directModels.summary },
  workerModels: { status: workerModels.status, summary: workerModels.summary },
  directOptimize: { status: directOptimize.status, summary: directOptimize.summary },
  workerOptimize: { status: workerOptimize.status, summary: workerOptimize.summary },
  directResponses: { status: directResponses.status, summary: directResponses.summary },
  workerResponses: { status: workerResponses.status, summary: workerResponses.summary },
  directImagesGenerate: { status: directImagesGenerate.status, summary: directImagesGenerate.summary },
  workerImagesGenerate: { status: workerImagesGenerate.status, summary: workerImagesGenerate.summary },
  directImagesEdit: { status: directImagesEdit.status, summary: directImagesEdit.summary },
  workerImagesEdit: { status: workerImagesEdit.status, summary: workerImagesEdit.summary },
}, null, 2));
