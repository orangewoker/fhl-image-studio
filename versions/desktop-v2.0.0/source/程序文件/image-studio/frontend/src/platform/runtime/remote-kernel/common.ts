import {
  readVirtualText,
  registerVirtualText,
  sourceToDataURL,
} from "../../../lib/virtualHostStore.ts";
import { blobToBase64, dataURLFromBase64 } from "../../../lib/images.ts";
import { validateAPIKeyForHeader } from "../../../lib/apiKey.ts";
import { hasAndroidInvokeBridge } from "../../android/nativeInvoke.ts";
import {
  describeProblem as describeSharedProblem,
  isRetryableRaw as isRetryableRawShared,
  normalizeAPIMode as normalizeSharedAPIMode,
  normalizeBaseURL as normalizeSharedBaseURL,
  normalizeImageModel as normalizeSharedImageModel,
  normalizeTextModel as normalizeSharedTextModel,
} from "../../../../../../shared/kernel/requestModel.js";
import type { KernelImageSource, RemoteGeneratePayload } from "./types.ts";

const FHL_BASE_URL = "https://www.fhl.mom";
const FHL_LOCAL_PROXY_PREFIX = "/__image-studio-fhl";
const SINGLE_SOURCE_UPLOAD_COMPRESS_THRESHOLD = 2.5 * 1024 * 1024;
const MULTI_SOURCE_UPLOAD_COMPRESS_THRESHOLD = 512 * 1024;
const UPLOAD_COPY_JPEG_QUALITY = 0.82;

type LoadedUploadImage = {
  image: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

function isLocalPreviewHost(): boolean {
  if (typeof window === "undefined" || typeof window.location === "undefined") return false;
  const hostname = String(window.location.hostname || "").toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function nowSeconds(startedAt: number): number {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

export function fileNameFromPath(path: string | undefined): string {
  if (!path) return "image.png";
  return path.split(/[\\/]/).pop() || "image.png";
}

export async function resolveSourceDataURLs(
  sourceImages: KernelImageSource[] | undefined,
  payload: RemoteGeneratePayload,
): Promise<string[]> {
  const ordered = sourceImages?.length
    ? sourceImages
    : payload.imagePaths.map((path) => ({ path, name: fileNameFromPath(path) }));
  const out: string[] = [];
  for (const source of ordered) {
    const dataURL = await sourceToDataURL(source);
    if (dataURL) out.push(await compressSourceDataURLForUpload(dataURL, ordered.length));
  }
  return out;
}

function estimateDataURLBytes(dataURL: string): number {
  const comma = dataURL.indexOf(",");
  if (comma < 0) return dataURL.length;
  const clean = dataURL.slice(comma + 1).replace(/=+$/, "");
  return Math.floor((clean.length * 3) / 4);
}

function parseDataURL(dataURL: string): { mimeType: string; payload: string } | null {
  const comma = dataURL.indexOf(",");
  if (comma < 0) return null;
  const meta = dataURL.slice(0, comma).toLowerCase();
  if (!meta.startsWith("data:") || !meta.includes(";base64")) return null;
  const mimeType = dataURL.slice(5, dataURL.indexOf(";")).trim() || "image/png";
  return { mimeType, payload: dataURL.slice(comma + 1) };
}

function dataURLToBlob(dataURL: string): Blob | null {
  const parsed = parseDataURL(dataURL);
  if (!parsed) return null;
  const bin = atob(parsed.payload);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: parsed.mimeType });
}

async function loadUploadImage(blob: Blob): Promise<LoadedUploadImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  if (typeof Image === "undefined" || typeof URL === "undefined") {
    throw new Error("Image decoding is unavailable");
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode source image"));
      el.src = url;
    });
    return {
      image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function uploadMaxLongSide(sourceCount: number): number {
  if (sourceCount >= 3) return 1024;
  if (sourceCount >= 2) return 1280;
  return 1600;
}

function shouldCompressUploadCopy(dataURL: string, sourceCount: number): boolean {
  const bytes = estimateDataURLBytes(dataURL);
  if (sourceCount >= 2) return bytes >= MULTI_SOURCE_UPLOAD_COMPRESS_THRESHOLD;
  return bytes >= SINGLE_SOURCE_UPLOAD_COMPRESS_THRESHOLD;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((blob) => resolve(blob), mimeType, quality);
      return;
    }
    try {
      const dataURL = canvas.toDataURL(mimeType, quality);
      resolve(dataURLToBlob(dataURL));
    } catch {
      resolve(null);
    }
  });
}

export async function compressSourceDataURLForUpload(dataURL: string, sourceCount: number): Promise<string> {
  if (!shouldCompressUploadCopy(dataURL, sourceCount)) return dataURL;
  if (typeof document === "undefined" || typeof document.createElement !== "function") return dataURL;

  const blob = dataURLToBlob(dataURL);
  if (!blob) return dataURL;

  let loaded: LoadedUploadImage | null = null;
  try {
    loaded = await loadUploadImage(blob);
    if (!loaded.width || !loaded.height) return dataURL;

    const maxLongSide = uploadMaxLongSide(sourceCount);
    const scale = Math.min(1, maxLongSide / Math.max(loaded.width, loaded.height));
    const width = Math.max(1, Math.round(loaded.width * scale));
    const height = Math.max(1, Math.round(loaded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataURL;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(loaded.image, 0, 0, width, height);

    const uploadBlob = await canvasToBlob(canvas, "image/jpeg", UPLOAD_COPY_JPEG_QUALITY);
    if (!uploadBlob) return dataURL;
    const compressed = dataURLFromBase64(await blobToBase64(uploadBlob), "image/jpeg");
    if (compressed.length >= dataURL.length && scale >= 1) return dataURL;
    return compressed;
  } catch {
    return dataURL;
  } finally {
    loaded?.close?.();
  }
}

export function normalizeBaseURL(raw: string): string {
  const normalized = normalizeSharedBaseURL(raw);
  if (isLocalPreviewHost() && normalized === FHL_BASE_URL) {
    return `${window.location.origin}${FHL_LOCAL_PROXY_PREFIX}`;
  }
  return normalized;
}

export function normalizeAPIMode(apiMode: string): "responses" | "images" {
  return normalizeSharedAPIMode(apiMode);
}

export function normalizeTextModel(modelID: string): string {
  return normalizeSharedTextModel(modelID);
}

export function normalizeImageModel(modelID: string): string {
  return normalizeSharedImageModel(modelID);
}

export function normalizeAPIKeyForHeader(apiKey: string): string {
  return validateAPIKeyForHeader(apiKey);
}

export function shouldUseAndroidNativeHTTP(): boolean {
  return typeof window !== "undefined" && hasAndroidInvokeBridge();
}

export const describeProblem = describeSharedProblem;
export const isRetryableRaw = isRetryableRawShared;

export function isTransportishError(error: unknown): boolean {
  const message = String((error as any)?.message || error || "").toLowerCase();
  return [
    "timeout",
    "networkerror",
    "network error",
    "failed to fetch",
    "load failed",
    "i/o timeout",
    "connection reset",
    "econnreset",
    "econnrefused",
    "gateway",
  ].some((marker) => message.includes(marker));
}

export async function sleepWithSignal(signal: AbortSignal, ms: number): Promise<void> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function registerRawText(kind: "responses" | "images" | "optimize", attempt: number, raw: string): string | null {
  if (!raw.trim()) return null;
  const ext = kind === "responses" ? "txt" : "json";
  return registerVirtualText(raw, `${kind}-response-attempt${attempt}.${ext}`);
}

export function readRegisteredText(path: string): string {
  return readVirtualText(path);
}

export function extractResponseText(raw: string): string {
  try {
    const parsed: any = JSON.parse(raw);
    if (typeof parsed?.output_text === "string" && parsed.output_text.trim()) {
      return parsed.output_text.trim();
    }
    if (Array.isArray(parsed?.output)) {
      for (const output of parsed.output) {
        if (!Array.isArray(output?.content)) continue;
        for (const content of output.content) {
          if (content?.type === "output_text" && typeof content?.text === "string" && content.text.trim()) {
            return content.text.trim();
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return "";
}

export function extractResponseErrorMessage(raw: string): string {
  try {
    const parsed: any = JSON.parse(raw);
    if (typeof parsed?.error?.message === "string" && parsed.error.message.trim()) {
      return parsed.error.message.trim();
    }
    if (typeof parsed?.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // ignore
  }
  return raw.trim();
}

export { sourceToDataURL };
