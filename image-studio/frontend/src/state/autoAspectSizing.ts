import type {
  APIMode,
  Mode,
  RequestPolicy,
  SizeValue,
} from "../types/domain";
import type { StudioState } from "./studioStore.types";
import {
  ASPECT_PRESETS,
  aspectPresetsForAPIMode,
  buildSizeSelection,
  type AspectPreset,
  type AspectPresetOption,
  type ResolutionPreset,
} from "../components/panel/sizeCapabilities.ts";

export type SourceDimensions = {
  width: number;
  height: number;
};

export type AutoAspectSizeInput = {
  apiMode: APIMode;
  requestPolicy: RequestPolicy;
  imageModelID?: string;
  mode?: Mode;
};

export function nearestSourceAspectPreset(
  width: number,
  height: number,
  presets: AspectPresetOption[] = ASPECT_PRESETS,
): Exclude<AspectPreset, "auto"> {
  const ratio = width > 0 && height > 0 ? width / height : 1;
  let best: Exclude<AspectPreset, "auto"> = "1:1";
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const preset of presets) {
    if (preset.value === "auto") continue;
    const presetRatio = aspectValueRatio(preset.value) ?? (preset.w / preset.h);
    const diff = Math.abs(Math.log(ratio) - Math.log(presetRatio));
    if (diff < bestDiff) {
      best = preset.value;
      bestDiff = diff;
    }
  }
  return best;
}

function aspectValueRatio(value: AspectPreset): number | null {
  const match = String(value).match(/^(\d+):(\d+)$/);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return w / h;
}

export function buildAutoAspectSizeFromDimensions(
  resolution: Exclude<ResolutionPreset, "auto">,
  width: number,
  height: number,
  input: AutoAspectSizeInput,
): SizeValue | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return buildSizeSelection(nearestSourceAspectPreset(width, height, aspectPresetsForAPIMode(input.apiMode, input.mode)), resolution, input);
}

export function autoAspectSizeInputFromState(state: StudioState): AutoAspectSizeInput {
  const activeProfile = state.profiles.find((profile) => profile.id === state.activeProfileId);
  const apiMode = activeProfile?.apiMode ?? state.apiMode;
  return {
    apiMode,
    requestPolicy: activeProfile?.requestPolicy ?? state.requestPolicy,
    imageModelID: activeProfile?.imageModelID ?? state.imageModelID,
    mode: state.mode,
  };
}

function dimensionsFromValues(widthValue: unknown, heightValue: unknown): SourceDimensions | null {
  const width = Number(widthValue);
  const height = Number(heightValue);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

export function sourceDimensionsFromMetadata(source: {
  width?: number;
  height?: number;
  previewWidth?: number;
  previewHeight?: number;
}): SourceDimensions | null {
  return dimensionsFromValues(source.width, source.height)
    ?? dimensionsFromValues(source.previewWidth, source.previewHeight);
}

export function normalizedReferenceSlotIndex(value: unknown, fixedSourceCount: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.max(0, fixedSourceCount), Math.floor(n)));
}

export function autoAspectUsesBatchSourceForReferenceOrder(
  batchSourceSlotIndex: unknown,
  fixedSourceCount: number,
): boolean {
  return normalizedReferenceSlotIndex(batchSourceSlotIndex, fixedSourceCount) === 0;
}
