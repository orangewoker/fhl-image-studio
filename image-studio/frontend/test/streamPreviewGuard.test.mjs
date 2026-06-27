import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const gridSource = await readFile(new URL("../src/components/canvas/BatchResultGrid.tsx", import.meta.url), "utf8");
const canvasCss = await readFile(new URL("../src/styles/_canvas.css", import.meta.url), "utf8");
const typesSource = await readFile(new URL("../src/platform/runtime/remote-kernel/types.ts", import.meta.url), "utf8");
const responsesSource = await readFile(new URL("../src/platform/runtime/remote-kernel/responses.ts", import.meta.url), "utf8");
const imagesSource = await readFile(new URL("../src/platform/runtime/remote-kernel/images.ts", import.meta.url), "utf8");

test("stream previews are labeled as non-final and strongly blurred", () => {
  assert.match(gridSource, /生成中预览，不是最终结果/);
  assert.doesNotMatch(gridSource, /预览已返回，等待最终结果/);
  assert.match(canvasCss, /\.batch-grid-tile\.previewing \.batch-grid-image-shell img\s*\{[\s\S]*?filter: blur\(26px\)/);
  assert.match(canvasCss, /\.batch-grid-tile\.previewing::after\s*\{[\s\S]*?rgb\(15 23 42 \/ 0\.42\)/);
});

test("remote kernel blocks final images that exactly match a partial preview", () => {
  assert.match(typesSource, /PARTIAL_FINAL_MATCH_MESSAGE/);
  assert.match(typesSource, /imagePayloadFingerprint/);
  assert.match(typesSource, /rejectIfFinalMatchesPartial/);
  assert.match(responsesSource, /partialFingerprints\.add\(fingerprint\)/);
  assert.match(responsesSource, /rejectIfFinalMatchesPartial\(event\.item\.result, partialFingerprints, rawPath\)/);
  assert.match(imagesSource, /partialFingerprints\.add\(fingerprint\)/);
  assert.match(imagesSource, /rejectIfFinalMatchesPartial\(event\.b64_json, partialFingerprints\)/);
});
