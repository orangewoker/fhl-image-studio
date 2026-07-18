import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const errors = await import("../src/lib/upstreamErrors.ts");
const layout = readFileSync(new URL("../src/styles/_layout.css", import.meta.url), "utf8");
const phonePanel = readFileSync(new URL("../src/platform/android/AndroidPhoneComposePanel.tsx", import.meta.url), "utf8");
const upstreamHeader = readFileSync(new URL("../src/platform/android/upstream/AndroidUpstreamHeader.tsx", import.meta.url), "utf8");
const upstreamConfig = readFileSync(new URL("../src/platform/android/upstream/useAndroidUpstreamConfig.ts", import.meta.url), "utf8");

test("iOS connection resets are shown as concise actionable messages", () => {
  const display = errors.formatUpstreamError(
    "Bad state: SocketException: Connection reset by peer (OS Error: Connection reset by peer, errno = 54)",
  );
  assert.equal(display.kind, "connection-reset");
  assert.match(display.message, /连接被上游服务器重置/);
  assert.doesNotMatch(display.message, /SocketException|errno/);
});

test("unsupported FHL image models point users at supported choices", () => {
  const display = errors.formatUpstreamError(
    "unsupported image model,supported models: codex-gpt-image-2, gpt-image-2 (code: upstream_error)",
  );
  assert.equal(display.kind, "unsupported-image-model");
  assert.match(display.message, /gpt-image-2/);
});

test("phone submit CTA is portaled above navigation without double bottom reserve", () => {
  assert.match(phonePanel, /createPortal\(<div className="android-phone-sticky-cta"/);
  assert.match(phonePanel, /data-audit-id="submit"/);
  assert.match(layout, /--android-content-bottom-reserve:\s*0px/);
  assert.match(layout, /\.android-phone-sticky-cta\s*\{[\s\S]*?position:\s*fixed/);
});

test("mobile upstream setup exposes a first-class OpenAI v1 provider choice", () => {
  assert.match(upstreamConfig, /title: "新建 OpenAI 标准 v1"/);
  assert.match(upstreamConfig, /\/v1\/images 端点/);
  assert.match(upstreamHeader, /onCreateOpenAI/);
});
