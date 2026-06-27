import assert from "node:assert/strict";
import test from "node:test";

const historySources = await import("../src/state/historySourceImages.ts");

test("captures edit-mode source images for history without blobs", () => {
  const sourceImages = historySources.sourceImagesForHistory("edit", [
    {
      path: "I:\\input\\ref.png",
      name: "ref.png",
      size: 123,
      previewUrl: "/media/preview/ref",
      imageB64: "abc",
      imageBlob: new Blob(["abc"], { type: "image/png" }),
    },
  ]);

  assert.equal(sourceImages.length, 1);
  assert.equal(sourceImages[0].path, "I:\\input\\ref.png");
  assert.equal(sourceImages[0].imageB64, "abc");
  assert.equal(sourceImages[0].imageBlob, null);
  assert.equal(sourceImages[0].width, undefined);
  assert.equal(sourceImages[0].height, undefined);
});

test("preserves cached source dimensions when cloning history source images", () => {
  const sourceImages = historySources.sourceImagesForHistory("edit", [
    {
      path: "I:\\input\\ref.png",
      name: "ref.png",
      size: 123,
      width: 1536,
      height: 864,
      previewUrl: "/media/preview/ref",
      imageB64: "abc",
      imageBlob: new Blob(["abc"], { type: "image/png" }),
    },
  ]);

  assert.equal(sourceImages.length, 1);
  assert.equal(sourceImages[0].width, 1536);
  assert.equal(sourceImages[0].height, 864);

  const restored = historySources.sourceImagesFromHistoryItem({
    id: "h-width",
    prompt: "edit this",
    mode: "edit",
    size: "1024x1024",
    quality: "medium",
    createdAt: Date.now(),
    sourceImages,
  });

  assert.equal(restored.length, 1);
  assert.equal(restored[0].width, 1536);
  assert.equal(restored[0].height, 864);
});

test("restores stored source images when applying edit history params", () => {
  const restored = historySources.sourceImagesFromHistoryItem({
    id: "h1",
    prompt: "edit this",
    mode: "edit",
    size: "1024x1024",
    quality: "medium",
    createdAt: Date.now(),
    parentId: "I:\\input\\old.png",
    sourceImages: [
      { path: "I:\\input\\a.png", name: "a.png", size: 1 },
      { path: "I:\\input\\b.png", name: "b.png", size: 2 },
    ],
  });

  assert.deepEqual(restored.map((source) => source.path), ["I:\\input\\a.png", "I:\\input\\b.png"]);
});

test("falls back to parentId for older edit history records", () => {
  const restored = historySources.sourceImagesFromHistoryItem({
    id: "h2",
    prompt: "old edit",
    mode: "edit",
    size: "1024x1024",
    quality: "medium",
    createdAt: Date.now(),
    parentId: "I:\\input\\legacy-ref.webp",
  });

  assert.equal(restored.length, 1);
  assert.equal(restored[0].path, "I:\\input\\legacy-ref.webp");
  assert.equal(restored[0].name, "legacy-ref.webp");
});

test("does not restore source images for text-to-image history", () => {
  const restored = historySources.sourceImagesFromHistoryItem({
    id: "h3",
    prompt: "generate",
    mode: "generate",
    size: "1024x1024",
    quality: "medium",
    createdAt: Date.now(),
    parentId: "I:\\input\\should-not-use.png",
  });

  assert.deepEqual(restored, []);
});
