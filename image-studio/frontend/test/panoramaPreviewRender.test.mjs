import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panorama = await import("../src/panorama/core.ts");
const glPreview = await import("../src/panorama/glPreview.ts");
const viewerSource = await readFile(new URL("../src/components/panorama/PanoramaViewerModal.tsx", import.meta.url), "utf8");

test("panorama WebGL preview helper fails closed without browser WebGL", () => {
  const drawn = glPreview.renderPanoramaViewToContext2D({
    ctx: { drawImage() { throw new Error("drawImage should not be called without a DOM"); } },
    owner: {},
    image: { complete: true, naturalWidth: 2048, naturalHeight: 1024, width: 2048, height: 1024 },
    rect: { x: 0, y: 0, w: 800, h: 450 },
    yawDeg: 0,
    pitchDeg: 0,
    fovDeg: 100,
  });

  assert.equal(drawn, false);
});

test("panorama viewer tries WebGL preview before canvas triangle fallback", () => {
  const webglIndex = viewerSource.indexOf("renderPanoramaViewToContext2D({");
  const fallbackIndex = viewerSource.indexOf("drawPanoramaCutoutPreview(", webglIndex);

  assert.match(viewerSource, /import \{ renderPanoramaViewToContext2D \} from "\.\.\/\.\.\/panorama\/glPreview"/);
  assert.ok(webglIndex >= 0, "expected panorama viewer to call the WebGL preview helper");
  assert.ok(fallbackIndex > webglIndex, "expected canvas preview fallback after WebGL attempt");
});

test("fallback panorama preview grid adapts to wide FOV and caps work", () => {
  const normal = panorama.panoramaPreviewGridSizeFor(
    { w: 800, h: 450 },
    { hFOV_deg: 80, vFOV_deg: 46 },
    "balanced",
  );
  const wide = panorama.panoramaPreviewGridSizeFor(
    { w: 1600, h: 900 },
    { hFOV_deg: 118, vFOV_deg: 82 },
    "balanced",
  );
  const high = panorama.panoramaPreviewGridSizeFor(
    { w: 1600, h: 900 },
    { hFOV_deg: 118, vFOV_deg: 82 },
    "high",
  );
  const capped = panorama.panoramaPreviewGridSizeFor(
    { w: 4096, h: 4096 },
    { hFOV_deg: 179, vFOV_deg: 179 },
    "high",
  );

  assert.ok(wide.Nu > normal.Nu, `expected wide FOV grid to increase Nu, got ${normal.Nu} -> ${wide.Nu}`);
  assert.ok(wide.Nv > normal.Nv, `expected wide FOV grid to increase Nv, got ${normal.Nv} -> ${wide.Nv}`);
  assert.ok(high.Nu > wide.Nu && high.Nv > wide.Nv, "expected high quality grid to be denser than balanced");
  assert.ok(capped.Nu <= 72 && capped.Nv <= 48, `expected capped grid, got ${capped.Nu}x${capped.Nv}`);
});
