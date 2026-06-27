#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename } from "node:path";

function usage() {
  console.error("Usage: node scripts/check-image-ratio.mjs <image.png|jpg> [targetRatio]");
  console.error("Example: node scripts/check-image-ratio.mjs output/test.png 9:16");
  process.exit(2);
}

function parseTargetRatio(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  const parts = text.split(":");
  if (parts.length === 2) {
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (w > 0 && h > 0) return { label: text, value: w / h };
  }
  const value = Number(text);
  if (value > 0) return { label: text, value };
  throw new Error(`Invalid target ratio: ${raw}`);
}

function pngDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer[0] !== 0x89 || buffer.slice(1, 4).toString("ascii") !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: "png" };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isSOF = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSOF && length >= 7) {
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
        format: "jpeg",
      };
    }
    offset += length;
  }
  return null;
}

function imageDimensions(path) {
  const buffer = readFileSync(path);
  const dimensions = pngDimensions(buffer) || jpegDimensions(buffer);
  if (!dimensions) throw new Error("Unsupported image format; currently supports PNG and JPEG.");
  return dimensions;
}

const [, , imagePath, targetRaw] = process.argv;
if (!imagePath) usage();

const dims = imageDimensions(imagePath);
const ratio = dims.width / dims.height;
const target = parseTargetRatio(targetRaw);
const result = {
  file: basename(imagePath),
  path: imagePath,
  format: dims.format,
  width: dims.width,
  height: dims.height,
  ratio: Number(ratio.toFixed(6)),
};

if (target) {
  result.target = target.label;
  result.targetRatio = Number(target.value.toFixed(6));
  result.errorPct = Number((Math.abs(ratio - target.value) / target.value * 100).toFixed(3));
  result.passWithin1Pct = result.errorPct <= 1;
}

console.log(JSON.stringify(result, null, 2));
