import { spawn } from "node:child_process";

const port = Number(process.env.RUNTIME_SMOKE_PORT || 41743);
const origin = `http://127.0.0.1:${port}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: "Bearer smoke-key" },
      });
      if (response.ok) return;
      lastError = new Error(`server responded ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError ?? new Error("server did not start in time");
}

async function requestJSON(path, init) {
  const response = await fetch(origin + path, init);
  const raw = await response.text();
  return {
    status: response.status,
    raw,
    json: JSON.parse(raw),
  };
}

async function requestText(path, init) {
  const response = await fetch(origin + path, init);
  const raw = await response.text();
  return {
    status: response.status,
    raw,
  };
}

const child = spawn(process.execPath, ["scripts/runtime-smoke-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, RUNTIME_SMOKE_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

try {
  await waitForServer(`${origin}/v1/models`);

  const models = await requestJSON("/v1/models", {
    method: "GET",
    headers: { Authorization: "Bearer smoke-key" },
  });

  const responses = await requestText("/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer smoke-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apiKey: "smoke-key",
      mode: "generate",
      prompt: "cat",
      size: "1024x1024",
      quality: "low",
      outputFormat: "png",
      imagePaths: [],
      imagePath: "",
      maskB64: "",
      seed: 0,
      negativePrompt: "",
      baseURL: origin,
      textModelID: "gpt-5.5",
      imageModelID: "gpt-image-2",
      apiMode: "responses",
      noPromptRevision: false,
    }),
  });

  const imagesGenerate = await requestJSON("/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: "Bearer smoke-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt: "bird",
      size: "1024x1024",
      quality: "medium",
      response_format: "b64_json",
    }),
  });

  const form = new FormData();
  form.append("image", new Blob(["png-bytes"], { type: "image/png" }), "source.png");
  form.append("prompt", "make it orange");
  form.append("model", "gpt-image-2");
  form.append("response_format", "b64_json");
  const imagesEdit = await requestJSON("/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: "Bearer smoke-key",
    },
    body: form,
  });

  const optimize = await requestJSON("/kernel/prompt-optimize", {
    method: "POST",
    headers: {
      Authorization: "Bearer smoke-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      baseURL: origin,
      prompt: "cat",
      mode: "generate",
      textModelID: "gpt-5.5",
      sourceDataURLs: [],
    }),
  });

  console.log(JSON.stringify({
    origin,
    models: {
      status: models.status,
      ids: models.json.data.map((item) => item.id),
    },
    responses: {
      status: responses.status,
      hasResult: responses.raw.includes('"result":"c21va2UtaW1hZ2U="'),
    },
    imagesGenerate: {
      status: imagesGenerate.status,
      revisedPrompt: imagesGenerate.json.data[0]?.revised_prompt ?? null,
    },
    imagesEdit: {
      status: imagesEdit.status,
      revisedPrompt: imagesEdit.json.data[0]?.revised_prompt ?? null,
    },
    optimize: {
      status: optimize.status,
      outputText: optimize.json.output_text,
    },
  }, null, 2));
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", () => resolve()));
  if (stderr.trim()) {
    process.stderr.write(stderr);
  }
}
