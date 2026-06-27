import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const canvasStageSource = await readFile(new URL("../src/components/canvas/CanvasStage.tsx", import.meta.url), "utf8");
const shortcutsSource = await readFile(new URL("../src/components/canvas/useCanvasShortcuts.ts", import.meta.url), "utf8");
const canvasCss = await readFile(new URL("../src/styles/_canvas.css", import.meta.url), "utf8");

test("single image preview navigation is built from the current batch result slots", () => {
  assert.match(canvasStageSource, /sortBatchGridSlotsForDisplay/);
  assert.match(canvasStageSource, /const singlePreviewItems = sortBatchGridSlotsForDisplay\(/);
  assert.match(canvasStageSource, /historyGallerySort === "oldest"/);
  assert.match(canvasStageSource, /slot is Extract<BatchGridSlot, \{ type: "result" \}> => slot\.type === "result"/);
  assert.match(canvasStageSource, /const showSinglePreviewNav = !!currentImage/);
  assert.match(canvasStageSource, /!showingResultGrid/);
  assert.match(canvasStageSource, /!showingHistoryGallery/);
  assert.match(canvasStageSource, /!compareB/);
  assert.match(canvasStageSource, /!currentImage\.id\.startsWith\("source-preview-"\)/);
});

test("single image preview buttons reuse batch selection and show edge toasts", () => {
  assert.match(canvasStageSource, /const navigateSinglePreview = useCallback\(\(direction: -1 \| 1\) =>/);
  assert.match(canvasStageSource, /pushToast\("已经是第一张了", "info", 1800\)/);
  assert.match(canvasStageSource, /pushToast\("已经是最后一张了", "info", 1800\)/);
  assert.match(canvasStageSource, /void selectBatchResult\(target\)/);
  assert.match(canvasStageSource, /single-preview-nav-button-left/);
  assert.match(canvasStageSource, /single-preview-nav-button-right/);
  assert.match(canvasStageSource, /aria-disabled=\{singlePreviewIndex <= 0\}/);
  assert.match(canvasStageSource, /aria-disabled=\{singlePreviewIndex >= singlePreviewItems\.length - 1\}/);
});

test("canvas shortcuts wire ArrowLeft and ArrowRight to preview navigation outside inputs", () => {
  assert.match(shortcutsSource, /onNavigatePreview\?: \(direction: -1 \| 1\) => void/);
  assert.match(shortcutsSource, /isTypingInField/);
  assert.match(shortcutsSource, /k === "arrowleft" \|\| k === "arrowright"/);
  assert.match(shortcutsSource, /onNavigatePreview\(k === "arrowleft" \? -1 : 1\)/);
  assert.match(canvasStageSource, /onNavigatePreview: showSinglePreviewNav \? navigateSinglePreview : undefined/);
});

test("single image preview navigation has stable overlay button styling", () => {
  assert.match(canvasCss, /\.single-preview-nav-button \{/);
  assert.match(canvasCss, /width: 46px;/);
  assert.match(canvasCss, /height: 46px;/);
  assert.match(canvasCss, /border-radius: 999px;/);
  assert.match(canvasCss, /\.single-preview-nav-button-left svg/);
  assert.match(canvasCss, /\.single-preview-nav-button-right svg/);
  assert.match(canvasCss, /\.single-preview-nav-button-disabled/);
});
