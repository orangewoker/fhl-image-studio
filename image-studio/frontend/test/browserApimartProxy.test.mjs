import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const studioStoreSource = await readFile(new URL("../src/state/studioStore.ts", import.meta.url), "utf8");
const browserJobProxySource = await readFile(new URL("../dev/browserJobProxy.ts", import.meta.url), "utf8");

test("browser task proxy includes APIMart submissions but keeps RunningHub direct", () => {
  assert.match(
    studioStoreSource,
    /function shouldUseBackgroundTaskProxyForSubmit\(apiMode: APIMode\): boolean \{\s*if \(apiMode === "runninghub"\) return false;\s*if \(isBrowserTaskProxyMode\(\)\) return true;\s*return isAndroidTaskProxyMode\(\) && apiMode !== "images";\s*\}/,
  );
  assert.doesNotMatch(studioStoreSource, /apiMode !== "apimart"\s*&&\s*\(isBrowserTaskProxyMode\(\)/);
});

test("browser APIMart task proxy routes official base to the reachable legacy CLI base", () => {
  assert.match(browserJobProxySource, /const APIMART_OFFICIAL_BASE_URL = "https:\/\/api\.apimart\.ai"/);
  assert.match(browserJobProxySource, /const APIMART_LEGACY_BASE_URL = "https:\/\/api\.apib\.ai"/);
  assert.match(browserJobProxySource, /function effectiveBaseURLForCLI\(payload: BrowserJobSubmitPayload\)/);
  assert.match(browserJobProxySource, /normalized === APIMART_OFFICIAL_BASE_URL \? APIMART_LEGACY_BASE_URL : raw/);
  assert.match(browserJobProxySource, /"--base-url", effectiveBaseURLForCLI\(payload\)/);
});

test("browser APIMart task proxy persists task ids from successful raw responses", () => {
  assert.match(browserJobProxySource, /match\(\/\\btask\[-_\]\(\?=\[A-Z0-9_-\]\*\\d\)\[A-Z0-9\]\[A-Z0-9_-\]\{5,\}\\b\/i\)/);
  assert.match(browserJobProxySource, /async function readRawResponseTaskId\(rawPath: unknown, logDir: string\): Promise<string>/);
  assert.match(browserJobProxySource, /const rawPathTaskId = await readRawResponseTaskId\(rawResult\?\.rawPath, path\.join\(this\.outputDir, "log"\)\)/);
  assert.match(browserJobProxySource, /const apimartTaskId = typeof rawResult\?\.apimartTaskId === "string" && rawResult\.apimartTaskId\.trim\(\)/);
  assert.match(browserJobProxySource, /extractAPIMartTaskIdFromText\(rawResultError \|\| rawPathError\) \|\| rawPathTaskId/);
  assert.match(browserJobProxySource, /apimartTaskId,/);
});
