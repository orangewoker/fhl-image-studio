import assert from "node:assert/strict";
import test from "node:test";

import { sortHistoryGalleryItems } from "../src/components/canvas/historyGallerySort.ts";

function item(id, createdAt) {
  return {
    id,
    prompt: id,
    mode: "generate",
    size: "1024x1024",
    quality: "medium",
    createdAt,
  };
}

test("history gallery defaults to newest first", () => {
  const sorted = sortHistoryGalleryItems([
    item("old", 10),
    item("new", 30),
    item("middle", 20),
  ], "newest");
  assert.deepEqual(sorted.map((entry) => entry.id), ["new", "middle", "old"]);
});

test("history gallery can switch to oldest first", () => {
  const sorted = sortHistoryGalleryItems([
    item("old", 10),
    item("new", 30),
    item("middle", 20),
  ], "oldest");
  assert.deepEqual(sorted.map((entry) => entry.id), ["old", "middle", "new"]);
});
