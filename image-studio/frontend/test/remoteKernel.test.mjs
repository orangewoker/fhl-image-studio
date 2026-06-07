import assert from "node:assert/strict";
import test from "node:test";

const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
const realLocalStorage = globalThis.localStorage;
const realDocument = globalThis.document;
const realWindow = globalThis.window;
const realURL = globalThis.URL;
const realCreateObjectURL = globalThis.URL?.createObjectURL;
const realRevokeObjectURL = globalThis.URL?.revokeObjectURL;
const realAtob = globalThis.atob;
const realBtoa = globalThis.btoa;
const PROMPT_OPTIMIZE_BASE_INSTRUCTIONS = "Rewrite the user's image prompt into a clearer, more detailed prompt for image generation. Keep the meaning, preserve the requested subject, and only return the improved prompt text. Do not add explanations, labels, markdown, or quotes.";

function installBase64() {
  globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
  globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
}

function installURLStubs() {
  const fakeURL = {
    ...URL,
    createObjectURL: () => "blob:mock",
    revokeObjectURL: () => {},
  };
  globalThis.URL = fakeURL;
}

function installStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function installDocument() {
  globalThis.document = {
    body: {
      appendChild() {},
    },
    createElement(tag) {
      if (tag === "a") {
        return {
          href: "",
          download: "",
          click() {},
          remove() {},
        };
      }
      if (tag === "input") {
        return {
          type: "",
          accept: "",
          style: {},
          files: [],
          addEventListener() {},
          click() {},
          remove() {},
        };
      }
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext() {
            return {
              translate() {},
              rotate() {},
              drawImage() {},
              scale() {},
            };
          },
          toBlob(callback) {
            callback(new Blob(["canvas"], { type: "image/png" }));
          },
        };
      }
      return {};
    },
  };
  globalThis.window = {
    open() {
      return { closed: false };
    },
    location: { href: "" },
  };
}

function installImmediateTimers() {
  globalThis.setTimeout = (fn, _ms, ...args) => {
    queueMicrotask(() => fn(...args));
    return 0;
  };
  globalThis.clearTimeout = () => {};
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
}

async function withPatchedGlobals(setup, run) {
  try {
    installBase64();
    installURLStubs();
    installStorage();
    installDocument();
    installImmediateTimers();
    await setup();
    return await run();
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
    globalThis.setInterval = realSetInterval;
    globalThis.clearInterval = realClearInterval;
    globalThis.localStorage = realLocalStorage;
    globalThis.document = realDocument;
    globalThis.window = realWindow;
    globalThis.URL = realURL;
    if (globalThis.URL && realCreateObjectURL) globalThis.URL.createObjectURL = realCreateObjectURL;
    if (globalThis.URL && realRevokeObjectURL) globalThis.URL.revokeObjectURL = realRevokeObjectURL;
    globalThis.atob = realAtob;
    globalThis.btoa = realBtoa;
  }
}

function loadRemoteKernel() {
  return import(`../src/platform/runtime/remoteKernel.ts?test=${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

test("runRemoteImageJob retries retryable responses and returns parsed SSE image", async () => {
  let calls = 0;
  await withPatchedGlobals(async () => {
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("<html>Error code 524 | 524: A timeout occurred</html>", {
          status: 524,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response(
        'data: {"type":"response.output_item.done","item":{"type":"image_generation_call","result":"YWJj","revised_prompt":"rev"}}\n',
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    const result = await kernel.runRemoteImageJob(
      {
        payload: {
          apiKey: "key",
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
          baseURL: "https://upstream.example",
          textModelID: "gpt-5.5",
          imageModelID: "gpt-image-2",
          apiMode: "responses",
          noPromptRevision: true,
        },
      },
      { signal: new AbortController().signal },
    );
    assert.equal(calls, 2);
    assert.equal(result.imageB64, "YWJj");
    assert.equal(result.revisedPrompt, "rev");
    assert.equal(result.sourceEvent, "final");
    assert.ok(result.rawPath?.startsWith("memory://text/"));
  });
});

test("runRemoteImageJob parses Responses final image from completed SSE event", async () => {
  let capturedBody = null;
  await withPatchedGlobals(async () => {
    globalThis.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(
        'data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"image_generation_call","status":"completed","result":"Y29tcGxldGVk","revised_prompt":"completed rev"}]}}\n',
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    const result = await kernel.runRemoteImageJob(
      {
        payload: {
          apiKey: "key",
          mode: "edit",
          prompt: "edit room",
          size: "1024x1024",
          quality: "low",
          outputFormat: "png",
          imagePaths: [],
          imagePath: "",
          maskB64: "",
          seed: 0,
          negativePrompt: "",
          baseURL: "https://upstream.example",
          textModelID: "gpt-5.5",
          imageModelID: "gpt-image-2",
          apiMode: "responses",
          requestPolicy: "openai",
          noPromptRevision: true,
        },
        sourceImages: [
          { imageB64: "iVBORw0KGgpzb3VyY2U=", name: "source.png", mimeType: "image/png" },
        ],
      },
      { signal: new AbortController().signal },
    );
    assert.equal(capturedBody.tools[0].action, "edit");
    assert.equal(capturedBody.input[0].content[1].type, "input_image");
    assert.equal(result.imageB64, "Y29tcGxldGVk");
    assert.equal(result.revisedPrompt, "completed rev");
    assert.equal(result.sourceEvent, "final");
  });
});

test("runRemoteImageJob emits Responses API partial image previews", async () => {
  let capturedBody = null;
  const partials = [];
  await withPatchedGlobals(async () => {
    globalThis.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(
        'data: {"type":"response.image_generation_call.partial_image","partial_image_index":1,"partial_image_b64":"cGFydGlhbA==","revised_prompt":"partial rev"}\n' +
        'data: {"type":"response.output_item.done","item":{"type":"image_generation_call","result":"ZmluYWw=","revised_prompt":"final rev"}}\n',
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    const result = await kernel.runRemoteImageJob(
      {
        payload: {
          apiKey: "key",
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
          baseURL: "https://upstream.example",
          textModelID: "gpt-5.5",
          imageModelID: "gpt-image-2",
          apiMode: "responses",
          requestPolicy: "openai",
          noPromptRevision: true,
          partialImages: 2,
        },
      },
      {
        signal: new AbortController().signal,
        onPartialImage: (partial) => partials.push(partial),
      },
    );
    assert.equal(capturedBody.tools[0].partial_images, 2);
    assert.equal(result.imageB64, "ZmluYWw=");
    assert.deepEqual(partials, [
      {
        imageB64: "cGFydGlhbA==",
        revisedPrompt: "partial rev",
        partialImageIndex: 1,
        sourceEvent: "responses_partial",
      },
    ]);
  });
});

test("runRemoteImageJob accepts partial-only Responses results like official app", async () => {
  const capturedBodies = [];
  const logs = [];
  await withPatchedGlobals(async () => {
    globalThis.fetch = async (_url, init) => {
      capturedBodies.push(JSON.parse(init.body));
      return new Response(
        'data: {"type":"response.image_generation_call.partial_image","partial_image_index":0,"partial_image_b64":"cGFydGlhbA==","revised_prompt":"partial rev"}\n',
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    const result = await kernel.runRemoteImageJob(
      {
        payload: {
          apiKey: "key",
          mode: "generate",
          prompt: "cat",
          size: "2048x2048",
          quality: "high",
          outputFormat: "png",
          imagePaths: [],
          imagePath: "",
          maskB64: "",
          seed: 0,
          negativePrompt: "",
          baseURL: "https://upstream.example",
          textModelID: "gpt-5.5",
          imageModelID: "gpt-image-2",
          apiMode: "responses",
          requestPolicy: "openai",
          noPromptRevision: true,
          partialImages: 1,
        },
      },
      {
        signal: new AbortController().signal,
        onLog: (line) => logs.push(line),
      },
    );
    assert.equal(capturedBodies.length, 1);
    assert.equal(capturedBodies[0].tools[0].partial_images, 1);
    assert.equal(capturedBodies[0].tools[0].size, "2048x2048");
    assert.equal(capturedBodies[0].tools[0].quality, "high");
    assert.ok(capturedBodies[0].instructions.includes("VERBATIM"));
    assert.equal(result.imageB64, "cGFydGlhbA==");
    assert.equal(result.revisedPrompt, "partial rev");
    assert.equal(result.sourceEvent, "partial");
    assert.equal(logs.some((line) => line.includes("disabling partial previews")), false);
    assert.equal(logs.some((line) => line.includes("Auto downgrade retry")), false);
  });
});

test("runRemoteImageJob parses Images API JSON mode", async () => {
  let captured = null;
  await withPatchedGlobals(async () => {
    globalThis.fetch = async (url, init) => {
      captured = {
        url: String(url),
        contentType: init.headers["Content-Type"] || init.headers["content-type"] || null,
        body: JSON.parse(init.body),
      };
      return new Response('{"data":[{"b64_json":"img-data","revised_prompt":"img-rev"}]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    const result = await kernel.runRemoteImageJob(
      {
        payload: {
          apiKey: "key",
          mode: "generate",
          prompt: "bird",
          size: "1024x1024",
          quality: "medium",
          outputFormat: "png",
          imagePaths: [],
          imagePath: "",
          maskB64: "",
          seed: 0,
          negativePrompt: "",
          baseURL: "https://upstream.example",
          textModelID: "",
          imageModelID: "gpt-image-2",
          apiMode: "images",
          requestPolicy: "openai",
          noPromptRevision: false,
        },
      },
      { signal: new AbortController().signal },
    );
    assert.equal(captured.url, "https://upstream.example/v1/images/generations");
    assert.equal(captured.body.prompt, "bird");
    assert.equal(result.imageB64, "img-data");
    assert.equal(result.revisedPrompt, "img-rev");
    assert.equal(result.sourceEvent, "images_api");
  });
});

test("runRemoteImageJob emits Images API stream partial image previews", async () => {
  let captured = null;
  const partials = [];
  await withPatchedGlobals(async () => {
    globalThis.fetch = async (url, init) => {
      captured = {
        url: String(url),
        body: JSON.parse(init.body),
      };
      return new Response(
        'data: {"type":"image_generation.partial_image","partial_image_index":0,"b64_json":"cGFydGlhbA=="}\n' +
        'data: {"type":"image_generation.completed","b64_json":"ZmluYWw="}\n',
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    const result = await kernel.runRemoteImageJob(
      {
        payload: {
          apiKey: "key",
          mode: "generate",
          prompt: "bird",
          size: "1024x1024",
          quality: "medium",
          outputFormat: "png",
          imagePaths: [],
          imagePath: "",
          maskB64: "",
          seed: 0,
          negativePrompt: "",
          baseURL: "https://upstream.example",
          textModelID: "",
          imageModelID: "gpt-image-2",
          apiMode: "images",
          requestPolicy: "openai",
          noPromptRevision: false,
          partialImages: 3,
        },
      },
      {
        signal: new AbortController().signal,
        onPartialImage: (partial) => partials.push(partial),
      },
    );
    assert.equal(captured.url, "https://upstream.example/v1/images/generations");
    assert.equal(captured.body.stream, true);
    assert.equal(captured.body.partial_images, 3);
    assert.equal(result.imageB64, "ZmluYWw=");
    assert.equal(result.sourceEvent, "images_api");
    assert.deepEqual(partials, [
      {
        imageB64: "cGFydGlhbA==",
        partialImageIndex: 0,
        sourceEvent: "images_partial",
      },
    ]);
  });
});

test("runRemoteImageJob sends Responses API mask as input_image_mask data URL", async () => {
  let captured = null;
  await withPatchedGlobals(async () => {
    globalThis.fetch = async (_url, init) => {
      captured = JSON.parse(init.body);
      return new Response(
        'data: {"type":"response.output_item.done","item":{"type":"image_generation_call","result":"YWJj","revised_prompt":"rev"}}\n',
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    await kernel.runRemoteImageJob(
      {
        payload: {
          apiKey: "key",
          mode: "edit",
          prompt: "cat",
          size: "1024x1024",
          quality: "low",
          outputFormat: "png",
          imagePaths: [],
          imagePath: "",
          maskB64: "iVBORw0KGgp0ZXN0",
          seed: 0,
          negativePrompt: "",
          baseURL: "https://upstream.example",
          textModelID: "gpt-5.5",
          imageModelID: "gpt-image-2",
          apiMode: "responses",
          requestPolicy: "openai",
          noPromptRevision: false,
        },
        sourceImages: [
          { imageB64: "iVBORw0KGgpzb3VyY2U=", name: "source.png", mimeType: "image/png" },
        ],
      },
      { signal: new AbortController().signal },
    );
    assert.equal(captured.tools[0].input_image_mask.image_url, "data:image/png;base64,iVBORw0KGgp0ZXN0");
    assert.equal(captured.tools[0].action, "edit");
  });
});

test("runRemoteImageJob sends Images API edit mask with image MIME type", async () => {
  let captured = null;
  await withPatchedGlobals(async () => {
    globalThis.fetch = async (url, init) => {
      captured = {
        url: String(url),
        body: init.body,
      };
      return new Response('{"data":[{"b64_json":"img-data","revised_prompt":"img-rev"}]}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    await kernel.runRemoteImageJob(
      {
        payload: {
          apiKey: "key",
          mode: "edit",
          prompt: "bird",
          size: "1024x1024",
          quality: "medium",
          outputFormat: "png",
          imagePaths: [],
          imagePath: "",
          maskB64: "iVBORw0KGgpmYWtl",
          seed: 0,
          negativePrompt: "",
          baseURL: "https://upstream.example",
          textModelID: "",
          imageModelID: "gpt-image-2",
          apiMode: "images",
          requestPolicy: "openai",
          noPromptRevision: false,
        },
        sourceImages: [
          { imageB64: "iVBORw0KGgpzb3VyY2U=", name: "source.png", mimeType: "image/png" },
        ],
      },
      { signal: new AbortController().signal },
    );
    assert.equal(captured.url, "https://upstream.example/v1/images/edits");
    assert.ok(captured.body instanceof FormData);
    const mask = captured.body.get("mask");
    assert.ok(mask instanceof Blob);
    assert.equal(mask.type, "image/png");
  });
});

test("runRemoteImageJob omits relay-only fields by default and includes them in compat mode", async () => {
  const capturedBodies = [];
  await withPatchedGlobals(async () => {
    globalThis.fetch = async (_url, init) => {
      capturedBodies.push(JSON.parse(init.body));
      return new Response(
        'data: {"type":"response.output_item.done","item":{"type":"image_generation_call","result":"YWJj","revised_prompt":"rev"}}\n',
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    await kernel.runRemoteImageJob(
      {
        payload: {
          apiKey: "key",
          mode: "generate",
          prompt: "cat",
          size: "1024x1024",
          quality: "low",
          outputFormat: "png",
          imagePaths: [],
          imagePath: "",
          maskB64: "",
          seed: 123,
          negativePrompt: "avoid blur",
          baseURL: "https://upstream.example",
          textModelID: "gpt-5.5",
          imageModelID: "gpt-image-2",
          apiMode: "responses",
          requestPolicy: "openai",
          noPromptRevision: true,
        },
      },
      { signal: new AbortController().signal },
    );
    await kernel.runRemoteImageJob(
      {
        payload: {
          apiKey: "key",
          mode: "generate",
          prompt: "cat",
          size: "1024x1024",
          quality: "low",
          outputFormat: "png",
          imagePaths: [],
          imagePath: "",
          maskB64: "",
          seed: 123,
          negativePrompt: "avoid blur",
          baseURL: "https://upstream.example",
          textModelID: "gpt-5.5",
          imageModelID: "gpt-image-2",
          apiMode: "responses",
          requestPolicy: "compat",
          noPromptRevision: false,
        },
      },
      { signal: new AbortController().signal },
    );
    assert.equal(capturedBodies[0].tools[0].seed, undefined);
    assert.equal(capturedBodies[0].tools[0].negative_prompt, undefined);
    assert.ok(capturedBodies[0].instructions.includes("VERBATIM"));
    assert.equal(capturedBodies[1].tools[0].seed, 123);
    assert.equal(capturedBodies[1].tools[0].negative_prompt, "avoid blur");
    assert.ok(capturedBodies[1].instructions.includes("policy-compliant visual prompt"));
  });
});

test("optimizePromptRemote extracts output_text", async () => {
  let capturedBody = null;
  let capturedAccept = "";
  await withPatchedGlobals(async () => {
    globalThis.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      capturedAccept = init.headers.Accept || init.headers.accept || "";
      return new Response('{"output_text":"optimized prompt"}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    const text = await kernel.optimizePromptRemote({
      apiKey: "key",
      prompt: "cat",
      optimizationGuidance: "more cinematic lighting",
      mode: "generate",
      baseURL: "https://upstream.example",
      textModelID: "gpt-5.5",
      imagePaths: [],
      imagePath: "",
    }, new AbortController().signal);
    assert.equal(text, "optimized prompt");
    assert.equal(capturedBody.stream, true);
    assert.match(capturedAccept, /text\/event-stream/);
    assert.match(capturedBody.instructions, /required modification direction/);
    assert.match(capturedBody.instructions, /mandatory edit/);
    assert.match(capturedBody.input[0].content[0].text, /Required modification direction:\nmore cinematic lighting/);
  });
});

test("optimizePromptRemote keeps base instructions when guidance is blank", async () => {
  let capturedBody = null;
  await withPatchedGlobals(async () => {
    globalThis.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response('{"output_text":"optimized prompt"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    const text = await kernel.optimizePromptRemote({
      apiKey: "key",
      prompt: "cat",
      optimizationGuidance: "",
      mode: "generate",
      baseURL: "https://upstream.example",
      textModelID: "gpt-5.5",
      imagePaths: [],
      imagePath: "",
    }, new AbortController().signal);
    assert.equal(text, "optimized prompt");
    assert.equal(capturedBody.instructions, PROMPT_OPTIMIZE_BASE_INSTRUCTIONS);
    assert.equal(capturedBody.input[0].content[0].text, "Original prompt:\ncat");
  });
});

test("optimizePromptRemote extracts streamed output text", async () => {
  await withPatchedGlobals(async () => {
    globalThis.fetch = async () => new Response([
      'data: {"type":"response.output_text.delta","delta":"optimized "}',
      'data: {"type":"response.output_text.delta","delta":"prompt"}',
      "data: [DONE]",
    ].join("\n"), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }, async () => {
    const kernel = await loadRemoteKernel();
    const text = await kernel.optimizePromptRemote({
      apiKey: "key",
      prompt: "cat",
      optimizationGuidance: "more cinematic lighting",
      mode: "generate",
      baseURL: "https://upstream.example",
      textModelID: "gpt-5.5",
      imagePaths: [],
      imagePath: "",
    }, new AbortController().signal);
    assert.equal(text, "optimized prompt");
  });
});

test("optimizePromptRemote extracts chat-completion compatible text", async () => {
  await withPatchedGlobals(async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [
        { message: { role: "assistant", content: "optimized prompt from compat upstream" } },
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const kernel = await loadRemoteKernel();
    const text = await kernel.optimizePromptRemote({
      apiKey: "key",
      prompt: "cat",
      optimizationGuidance: "more cinematic lighting",
      mode: "generate",
      baseURL: "https://upstream.example",
      textModelID: "gpt-5.5",
      imagePaths: [],
      imagePath: "",
    }, new AbortController().signal);
    assert.equal(text, "optimized prompt from compat upstream");
  });
});

test("reversePromptRemote sends image and extracts output_text", async () => {
  let capturedBody = null;
  let capturedAccept = "";
  await withPatchedGlobals(async () => {
    globalThis.fetch = async (_url, init) => {
      capturedBody = JSON.parse(init.body);
      capturedAccept = init.headers.Accept || init.headers.accept || "";
      return new Response('{"output_text":"a detailed generated prompt"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    const text = await kernel.reversePromptRemote({
      apiKey: "key",
      baseURL: "https://upstream.example",
      textModelID: "gpt-5.5",
      imagePaths: [],
      imagePath: "",
      sourceImages: [{ name: "cat.png", imageB64: "iVBORw0KGgo=", mimeType: "image/png" }],
    }, new AbortController().signal);
    assert.equal(text, "a detailed generated prompt");
    assert.equal(capturedBody.stream, true);
    assert.match(capturedAccept, /text\/event-stream/);
    assert.match(capturedAccept, /application\/json/);
    assert.match(capturedBody.instructions, /Simplified Chinese text-to-image prompt/);
    assert.match(capturedBody.instructions, /must be in Simplified Chinese/);
    assert.equal(capturedBody.input[0].content[1].type, "input_image");
    assert.equal(capturedBody.input[0].content[1].image_url, "data:image/png;base64,iVBORw0KGgo=");
  });
});

test("reversePromptRemote extracts streamed output_text delta", async () => {
  await withPatchedGlobals(async () => {
    globalThis.fetch = async () => new Response([
      'data: {"type":"response.output_text.delta","delta":"中文反推"}',
      'data: {"type":"response.output_text.delta","delta":"提示词"}',
      "data: [DONE]",
    ].join("\n"), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }, async () => {
    const kernel = await loadRemoteKernel();
    const text = await kernel.reversePromptRemote({
      apiKey: "key",
      baseURL: "https://upstream.example",
      textModelID: "gpt-5.5",
      imagePaths: [],
      imagePath: "",
      sourceImages: [{ name: "cat.png", imageB64: "iVBORw0KGgo=", mimeType: "image/png" }],
    }, new AbortController().signal);
    assert.equal(text, "中文反推提示词");
  });
});

test("reversePromptRemote extracts nested Responses message text", async () => {
  await withPatchedGlobals(async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      id: "resp_test",
      object: "response",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "text",
              text: { value: "structured reverse prompt" },
            },
          ],
        },
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const kernel = await loadRemoteKernel();
    const text = await kernel.reversePromptRemote({
      apiKey: "key",
      baseURL: "https://upstream.example",
      textModelID: "gpt-5.5",
      imagePaths: [],
      imagePath: "",
      sourceImages: [{ name: "cat.png", imageB64: "iVBORw0KGgo=", mimeType: "image/png" }],
    }, new AbortController().signal);
    assert.equal(text, "structured reverse prompt");
  });
});

test("reversePromptRemote extracts untyped nested Responses content text", async () => {
  await withPatchedGlobals(async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      id: "resp_test",
      object: "response",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              text: "untyped reverse prompt",
            },
          ],
        },
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const kernel = await loadRemoteKernel();
    const text = await kernel.reversePromptRemote({
      apiKey: "key",
      baseURL: "https://upstream.example",
      textModelID: "gpt-5.5",
      imagePaths: [],
      imagePath: "",
      sourceImages: [{ name: "cat.png", imageB64: "iVBORw0KGgo=", mimeType: "image/png" }],
    }, new AbortController().signal);
    assert.equal(text, "untyped reverse prompt");
  });
});

test("reversePromptRemote surfaces upstream text when no prompt is returned", async () => {
  await withPatchedGlobals(async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: {
        message: "stream_read_error",
        code: "stream_read_error",
        type: "upstream_error",
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const kernel = await loadRemoteKernel();
    await assert.rejects(
      () => kernel.reversePromptRemote({
        apiKey: "key",
        baseURL: "https://upstream.example",
        textModelID: "gpt-5.5",
        imagePaths: [],
        imagePath: "",
        sourceImages: [{ name: "cat.png", imageB64: "iVBORw0KGgo=", mimeType: "image/png" }],
      }, new AbortController().signal),
      /stream_read_error/,
    );
  });
});

test("reversePromptRemote rejects when no image is available", async () => {
  await withPatchedGlobals(async () => {
    globalThis.fetch = async () => {
      throw new Error("fetch should not be called");
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    await assert.rejects(
      () => kernel.reversePromptRemote({
        apiKey: "key",
        baseURL: "https://upstream.example",
        textModelID: "gpt-5.5",
        imagePaths: [],
        imagePath: "",
      }, new AbortController().signal),
      /No image available for reverse prompt/,
    );
  });
});

test("Android shell remote kernel can use native HTTP bridge to bypass browser fetch", async () => {
  const partials = [];
  const progressEvents = [];
  await withPatchedGlobals(async () => {
    globalThis.window.AndroidImageStudio = {
      invoke(requestId, method, payloadJson) {
        const args = JSON.parse(payloadJson);
        queueMicrotask(() => {
          if (method === "HttpRequestText") {
            const payload = args[0];
            if (payload.url.endsWith("/v1/responses")) {
              assert.equal(payload.streamLines, true);
              window.__imageStudioNativeProgress?.(payload.requestKey, {
                line: 'data: {"type":"response.image_generation_call.partial_image","partial_image_index":0,"partial_image_b64":"cGFydGlhbA=="}',
              });
              window.__imageStudioNativeResolve?.(requestId, {
                status: 200,
                body: 'data: {"type":"response.image_generation_call.partial_image","partial_image_index":0,"partial_image_b64":"cGFydGlhbA=="}\n' +
                  'data: {"type":"response.output_item.done","item":{"type":"image_generation_call","result":"YW5kcm9pZA==","revised_prompt":"native bridge"}}\n',
                contentType: "text/event-stream",
              });
              return;
            }
          }
          if (method === "CancelHttpRequest") {
            window.__imageStudioNativeResolve?.(requestId, null);
            return;
          }
          window.__imageStudioNativeReject?.(requestId, `unsupported ${method}`);
        });
      },
    };
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel)",
        platform: "Linux armv8l",
        userAgentData: { platform: "Android" },
      },
    });
    globalThis.fetch = async () => {
      throw new Error("browser fetch should not be used in Android native HTTP mode");
    };
  }, async () => {
    const kernel = await loadRemoteKernel();
    const result = await kernel.runRemoteImageJob(
      {
        payload: {
          apiKey: "key",
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
          baseURL: "https://upstream.example",
          textModelID: "gpt-5.5",
          imageModelID: "gpt-image-2",
          apiMode: "responses",
          noPromptRevision: false,
        },
      },
      {
        signal: new AbortController().signal,
        onPartialImage: (partial) => partials.push(partial),
        onProgress: (...args) => progressEvents.push(args),
      },
    );
    assert.equal(result.imageB64, "YW5kcm9pZA==");
    assert.equal(result.revisedPrompt, "native bridge");
    assert.equal(partials.length, 1);
    assert.equal(partials[0].imageB64, "cGFydGlhbA==");
    assert.equal(partials[0].partialImageIndex, 0);
    assert.ok(progressEvents.length > 0);
  });
});
