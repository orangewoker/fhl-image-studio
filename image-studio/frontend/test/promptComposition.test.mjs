import assert from "node:assert/strict";
import test from "node:test";

import { buildEffectivePrompt } from "../src/state/promptComposition.ts";

test("buildEffectivePrompt puts manual prefix before the main prompt", () => {
  assert.equal(buildEffectivePrompt("固定词", "主体词"), "固定词\n主体词");
});

test("buildEffectivePrompt can use either prompt part alone", () => {
  assert.equal(buildEffectivePrompt(" 固定词 ", "  "), "固定词");
  assert.equal(buildEffectivePrompt("  ", " 主体词 "), "主体词");
  assert.equal(buildEffectivePrompt("  ", "\n"), "");
});
