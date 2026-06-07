import { classifyImageModel } from "../../../../../shared/kernel/requestModel.js";
import type { APIMode, RequestPolicy, SizeValue } from "../../types/domain";

export type AspectPreset =
  | "auto"
  | "1:1"
  | "3:2"
  | "2:3"
  | "4:3"
  | "3:4"
  | "5:4"
  | "4:5"
  | "16:9"
  | "9:16"
  | "2:1"
  | "1:2"
  | "3:1"
  | "1:3";
export type ResolutionPreset = "auto" | "1k" | "2k" | "4k";

export const ASPECT_PRESETS: Array<{ value: AspectPreset; label: string; w: number; h: number; auto?: boolean }> = [
  { value: "auto", label: "Auto", w: 18, h: 18, auto: true },
  { value: "1:1", label: "1:1", w: 18, h: 18 },
  { value: "3:2", label: "3:2", w: 22, h: 14 },
  { value: "2:3", label: "2:3", w: 14, h: 20 },
  { value: "4:3", label: "4:3", w: 22, h: 16 },
  { value: "3:4", label: "3:4", w: 16, h: 22 },
  { value: "5:4", label: "5:4", w: 22, h: 17 },
  { value: "4:5", label: "4:5", w: 17, h: 22 },
  { value: "16:9", label: "16:9", w: 24, h: 13 },
  { value: "9:16", label: "9:16", w: 12, h: 22 },
  { value: "2:1", label: "2:1", w: 24, h: 12 },
  { value: "1:2", label: "1:2", w: 12, h: 24 },
  { value: "3:1", label: "3:1", w: 24, h: 8 },
  { value: "1:3", label: "1:3", w: 8, h: 24 },
];

export const RESOLUTION_PRESETS: Array<{ value: ResolutionPreset; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "1k", label: "1K" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
];

const SIZE_MATRIX: Record<Exclude<AspectPreset, "auto">, Record<Exclude<ResolutionPreset, "auto">, SizeValue>> = {
  "1:1": {
    "1k": "1024x1024",
    "2k": "2048x2048",
    "4k": "2880x2880",
  },
  "3:2": {
    "1k": "1536x1024",
    "2k": "2048x1360",
    "4k": "3456x2304",
  },
  "2:3": {
    "1k": "1024x1536",
    "2k": "1360x2048",
    "4k": "2304x3456",
  },
  "4:3": {
    "1k": "1536x1152",
    "2k": "2048x1536",
    "4k": "3840x2880",
  },
  "3:4": {
    "1k": "1152x1536",
    "2k": "1536x2048",
    "4k": "2880x3840",
  },
  "5:4": {
    "1k": "1520x1216",
    "2k": "2040x1632",
    "4k": "3840x3072",
  },
  "4:5": {
    "1k": "1216x1520",
    "2k": "1632x2040",
    "4k": "3072x3840",
  },
  "16:9": {
    "1k": "1536x864",
    "2k": "2048x1152",
    "4k": "3840x2160",
  },
  "9:16": {
    "1k": "864x1536",
    "2k": "1152x2048",
    "4k": "2160x3840",
  },
  "2:1": {
    "1k": "1536x768",
    "2k": "2048x1024",
    "4k": "3840x1920",
  },
  "1:2": {
    "1k": "768x1536",
    "2k": "1024x2048",
    "4k": "1920x3840",
  },
  "3:1": {
    "1k": "1536x512",
    "2k": "2040x680",
    "4k": "3840x1280",
  },
  "1:3": {
    "1k": "512x1536",
    "2k": "680x2040",
    "4k": "1280x3840",
  },
};

const SIZE_TO_ASPECT: Record<string, AspectPreset> = {
  auto: "auto",
  "1024x1024": "1:1",
  "2048x2048": "1:1",
  "2880x2880": "1:1",
  "1536x1024": "3:2",
  "2048x1360": "3:2",
  "3456x2304": "3:2",
  "1024x1536": "2:3",
  "1360x2048": "2:3",
  "2304x3456": "2:3",
  "1536x1152": "4:3",
  "2048x1536": "4:3",
  "3840x2880": "4:3",
  "1152x1536": "3:4",
  "1536x2048": "3:4",
  "2880x3840": "3:4",
  "1520x1216": "5:4",
  "2040x1632": "5:4",
  "3840x3072": "5:4",
  "1216x1520": "4:5",
  "1632x2040": "4:5",
  "3072x3840": "4:5",
  "1536x864": "16:9",
  "2048x1152": "16:9",
  "3840x2160": "16:9",
  "864x1536": "9:16",
  "1152x2048": "9:16",
  "2160x3840": "9:16",
  "1536x768": "2:1",
  "2048x1024": "2:1",
  "3840x1920": "2:1",
  "768x1536": "1:2",
  "1024x2048": "1:2",
  "1920x3840": "1:2",
  "1536x512": "3:1",
  "2040x680": "3:1",
  "3840x1280": "3:1",
  "512x1536": "1:3",
  "680x2040": "1:3",
  "1280x3840": "1:3",
};

const SIZE_TO_RESOLUTION: Record<string, ResolutionPreset> = {
  auto: "auto",
  "1024x1024": "1k",
  "1536x1024": "1k",
  "1024x1536": "1k",
  "1536x1152": "1k",
  "1152x1536": "1k",
  "1520x1216": "1k",
  "1216x1520": "1k",
  "1536x864": "1k",
  "864x1536": "1k",
  "1536x768": "1k",
  "768x1536": "1k",
  "1536x512": "1k",
  "512x1536": "1k",
  "2048x2048": "2k",
  "2048x1360": "2k",
  "1360x2048": "2k",
  "2048x1536": "2k",
  "1536x2048": "2k",
  "2040x1632": "2k",
  "1632x2040": "2k",
  "2048x1152": "2k",
  "1152x2048": "2k",
  "2048x1024": "2k",
  "1024x2048": "2k",
  "2040x680": "2k",
  "680x2040": "2k",
  "2880x2880": "4k",
  "3456x2304": "4k",
  "2304x3456": "4k",
  "3840x2880": "4k",
  "2880x3840": "4k",
  "3840x3072": "4k",
  "3072x3840": "4k",
  "3840x2160": "4k",
  "2160x3840": "4k",
  "3840x1920": "4k",
  "1920x3840": "4k",
  "3840x1280": "4k",
  "1280x3840": "4k",
};

const LARGE_RESOLUTION_PRESETS = new Set<ResolutionPreset>(["2k", "4k"]);
const DEFAULT_ASPECT_FROM_AUTO: Exclude<AspectPreset, "auto"> = "1:1";
const DEFAULT_RESOLUTION_FROM_AUTO: Exclude<ResolutionPreset, "auto"> = "1k";

export function supportsExplicitLargeSizes({
  apiMode,
  requestPolicy,
  imageModelID,
}: {
  apiMode: APIMode;
  requestPolicy: RequestPolicy;
  imageModelID?: string;
}): boolean {
  const family = classifyImageModel(imageModelID || "");
  if (apiMode === "images") {
    return family === "gpt-image" || family === "dalle3";
  }
  if (family === "gpt-image") {
    return true;
  }
  return requestPolicy === "compat";
}

export function availableResolutionPresets(input: {
  apiMode: APIMode;
  requestPolicy: RequestPolicy;
  imageModelID?: string;
}): ResolutionPreset[] {
  const all: ResolutionPreset[] = ["auto", "1k", "2k", "4k"];
  if (supportsExplicitLargeSizes(input)) {
    return all;
  }
  return all.filter((value) => !LARGE_RESOLUTION_PRESETS.has(value));
}

export function deriveAspectPreset(size: SizeValue): AspectPreset {
  return SIZE_TO_ASPECT[size] ?? "1:1";
}

export function deriveResolutionPreset(size: SizeValue): ResolutionPreset {
  return SIZE_TO_RESOLUTION[size] ?? "1k";
}

export function buildSizeSelection(
  aspect: AspectPreset,
  resolution: ResolutionPreset,
  input: {
    apiMode: APIMode;
    requestPolicy: RequestPolicy;
    imageModelID?: string;
  },
): SizeValue {
  if (aspect === "auto" || resolution === "auto") {
    return "auto";
  }
  const normalizedResolution = normalizeResolutionSelection(resolution, input);
  if (normalizedResolution === "auto") {
    return "auto";
  }
  return SIZE_MATRIX[aspect][normalizedResolution];
}

export function buildAspectSizeSelection(
  aspect: AspectPreset,
  currentResolution: ResolutionPreset,
  input: {
    apiMode: APIMode;
    requestPolicy: RequestPolicy;
    imageModelID?: string;
  },
): SizeValue {
  if (aspect === "auto") return "auto";
  const normalizedResolution = normalizeResolutionSelection(currentResolution, input);
  return buildSizeSelection(
    aspect,
    normalizedResolution === "auto" ? DEFAULT_RESOLUTION_FROM_AUTO : normalizedResolution,
    input,
  );
}

export function buildResolutionSizeSelection(
  currentAspect: AspectPreset,
  resolution: ResolutionPreset,
  input: {
    apiMode: APIMode;
    requestPolicy: RequestPolicy;
    imageModelID?: string;
  },
): SizeValue {
  if (resolution === "auto") return "auto";
  return buildSizeSelection(
    currentAspect === "auto" ? DEFAULT_ASPECT_FROM_AUTO : currentAspect,
    normalizeResolutionSelection(resolution, input),
    input,
  );
}

export function normalizeResolutionSelection(
  resolution: ResolutionPreset,
  input: {
    apiMode: APIMode;
    requestPolicy: RequestPolicy;
    imageModelID?: string;
  },
): ResolutionPreset {
  const allowed = new Set(availableResolutionPresets(input));
  return allowed.has(resolution) ? resolution : "1k";
}

export function normalizeSizeSelection(
  size: SizeValue,
  input: {
    apiMode: APIMode;
    requestPolicy: RequestPolicy;
    imageModelID?: string;
  },
): SizeValue {
  const aspect = deriveAspectPreset(size);
  const resolution = deriveResolutionPreset(size);
  return buildSizeSelection(aspect, resolution, input);
}

export function sizeCapabilityHint(input: {
  apiMode: APIMode;
  requestPolicy: RequestPolicy;
  imageModelID?: string;
}): string {
  if (supportsExplicitLargeSizes(input)) {
    return "";
  }
  return "当前链路只保证基础尺寸稳定可用。";
}
