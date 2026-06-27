import type { HistoryItem } from "../types/domain";
import {
  detectImageMimeTypeFromBase64,
  guessImageMimeTypeFromName,
  isTransientPreviewItem,
  mediaFullUrlFromImageId,
} from "./images.ts";
import { suggestImageFileName } from "./imageFileNames.ts";

export type DragExportSpec = {
  href: string;
  fileName: string;
  mimeType: string;
  downloadURL: string;
};

export const INTERNAL_HISTORY_ITEM_MIME = "application/x-image-studio-history-item";

type DragExportHistoryItem = Pick<
  HistoryItem,
  "id" | "prompt" | "createdAt" | "mode" | "outputFormat" | "savedPath" | "imageId" | "fullUrl" | "imageB64" | "previewOnly"
>;

type InternalHistoryDragItem = Pick<
  HistoryItem,
  | "id"
  | "imageId"
  | "previewUrl"
  | "fullUrl"
  | "thumbPath"
  | "previewWidth"
  | "previewHeight"
  | "imageB64"
  | "previewOnly"
  | "prompt"
  | "revisedPrompt"
  | "mode"
  | "size"
  | "quality"
  | "outputFormat"
  | "parentId"
  | "createdAt"
  | "seed"
  | "negativePrompt"
  | "styleTag"
  | "batchIndex"
  | "elapsedSec"
  | "savedPath"
  | "rawPath"
  | "sourceImages"
>;

function basename(path?: string): string {
  if (!path) return "";
  return path.split(/[\\/]/).pop() ?? "";
}

function isWindowsDrivePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path);
}

function fileURLFromPath(path?: string): string {
  const trimmed = path?.trim() || "";
  if (!trimmed) return "";
  if (trimmed.startsWith("file://")) return trimmed;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) && !isWindowsDrivePath(trimmed)) return trimmed;
  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized.startsWith("//")) return `file:${normalized}`;
  if (/^[a-zA-Z]:\//.test(normalized)) return `file:///${normalized}`;
  return `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`;
}

function resolveAbsoluteURL(rawURL: string): string {
  if (!rawURL) return rawURL;
  if (rawURL.startsWith("file://") || rawURL.startsWith("data:") || rawURL.startsWith("blob:")) return rawURL;
  if (rawURL.startsWith("wails://wails/")) {
    return rawURL.replace(/^wails:\/\/wails/i, "http://wails.localhost");
  }
  if (typeof window === "undefined") return rawURL;
  if (rawURL.startsWith("/")) {
    const href = window.location?.href || "";
    if (href.startsWith("wails://")) return `http://wails.localhost${rawURL}`;
  }
  if (!window.location?.href) return rawURL;
  try {
    return new URL(rawURL, window.location.href).toString();
  } catch {
    return rawURL;
  }
}

export function buildHistoryItemDragExport(
  item: DragExportHistoryItem | null | undefined,
  sourceURL?: string | null,
): DragExportSpec | null {
  if (!item) return null;
  const fileName = basename(item.savedPath) || suggestImageFileName({
    prompt: item.prompt,
    createdAt: item.createdAt,
    outputFormat: item.outputFormat,
  });
  const pathURL = fileURLFromPath(item.savedPath);
  const preferredURL = sourceURL?.trim() || "";
  const fullURL = isTransientPreviewItem(item) ? "" : (item.fullUrl || mediaFullUrlFromImageId(item.imageId));
  const rawURL = fullURL || preferredURL || pathURL || (item.imageB64
    ? `data:${detectImageMimeTypeFromBase64(item.imageB64) || "image/png"};base64,${item.imageB64}`
    : "");
  if (!rawURL) return null;
  const href = resolveAbsoluteURL(rawURL);
  const mimeType = guessImageMimeTypeFromName(fileName)
    || (href.startsWith("data:image/")
      ? href.slice("data:".length, href.indexOf(";"))
      : "")
    || "application/octet-stream";
  return {
    href,
    fileName,
    mimeType,
    downloadURL: `${mimeType}:${fileName}:${href}`,
  };
}

export function writeImageFileDragData(
  dataTransfer: Pick<DataTransfer, "clearData" | "setData"> | null | undefined,
  spec: DragExportSpec,
): void {
  if (!dataTransfer) return;
  try {
    dataTransfer.clearData();
  } catch {
    // Some embedded webviews reject clearData during drag start.
  }
  for (const [format, value] of [
    ["DownloadURL", spec.downloadURL],
    ["text/uri-list", spec.href],
    ["text/plain", spec.href],
  ] as const) {
    try {
      dataTransfer.setData(format, value);
    } catch {
      // Best effort: keep trying the remaining formats.
    }
  }
}

export function writeInternalHistoryItemDragData(
  dataTransfer: Pick<DataTransfer, "setData"> | null | undefined,
  item: InternalHistoryDragItem,
): void {
  if (!dataTransfer) return;
  try {
    dataTransfer.setData(INTERNAL_HISTORY_ITEM_MIME, JSON.stringify({
      id: item.id,
      imageId: item.imageId,
      previewUrl: item.previewUrl,
      fullUrl: item.fullUrl,
      thumbPath: item.thumbPath,
      previewWidth: item.previewWidth,
      previewHeight: item.previewHeight,
      imageB64: item.imageB64,
      previewOnly: item.previewOnly,
      prompt: item.prompt,
      revisedPrompt: item.revisedPrompt,
      mode: item.mode,
      size: item.size,
      quality: item.quality,
      outputFormat: item.outputFormat,
      parentId: item.parentId,
      createdAt: item.createdAt,
      seed: item.seed,
      negativePrompt: item.negativePrompt,
      styleTag: item.styleTag,
      batchIndex: item.batchIndex,
      elapsedSec: item.elapsedSec,
      savedPath: item.savedPath,
      rawPath: item.rawPath,
      sourceImages: item.sourceImages,
    } satisfies InternalHistoryDragItem));
  } catch {
    // Best-effort app-internal drag payload.
  }
}

export function readInternalHistoryItemDragData(
  dataTransfer: Pick<DataTransfer, "getData"> | null | undefined,
): HistoryItem | null {
  if (!dataTransfer) return null;
  let raw = "";
  try {
    raw = dataTransfer.getData(INTERNAL_HISTORY_ITEM_MIME);
  } catch {
    raw = "";
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HistoryItem>;
    if (!parsed || typeof parsed.id !== "string" || !parsed.id.trim()) return null;
    if (parsed.mode !== "generate" && parsed.mode !== "edit") return null;
    if (typeof parsed.prompt !== "string") return null;
    if (typeof parsed.size !== "string" || typeof parsed.quality !== "string") return null;
    if (typeof parsed.createdAt !== "number") return null;
    return parsed as HistoryItem;
  } catch {
    return null;
  }
}
