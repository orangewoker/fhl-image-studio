import type { APIMode, OutputFormatValue, QualityValue, RequestPolicy, SizeValue } from "../types/domain";
import {
  FHL_BASE_URL,
  FHL_IMAGE_MODEL_ID,
  FHL_TEXT_MODEL_ID,
} from "./profiles.ts";
import { STORAGE_NAMESPACE } from "./storageNamespace.ts";

const CLI_CONFIG_ENDPOINT = "/__image-studio-local-config/cli-env";

export type CLIConfigSyncInput = {
  apiKey?: string;
  clearAPIKey?: boolean;
  baseURL?: string;
  apiMode?: APIMode;
  requestPolicy?: RequestPolicy;
  imagesNewAPICompat?: boolean;
  textModelID?: string;
  imageModelID?: string;
  outputFormat?: OutputFormatValue;
  quality?: QualityValue | string;
  size?: SizeValue | string;
  partialImages?: number;
};

function isLocalPreviewHost(): boolean {
  if (typeof window === "undefined" || typeof window.location === "undefined") return false;
  const hostname = String(window.location.hostname || "").toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function syncCLIConfig(input: CLIConfigSyncInput = {}): Promise<boolean> {
  if (!isLocalPreviewHost() || typeof fetch === "undefined") return false;
  const response = await fetch(CLI_CONFIG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageNamespace: STORAGE_NAMESPACE,
      apiKey: input.apiKey,
      clearAPIKey: input.clearAPIKey === true,
      baseURL: input.baseURL || FHL_BASE_URL,
      apiMode: input.apiMode || "responses",
      requestPolicy: input.requestPolicy || "openai",
      imagesNewAPICompat: input.imagesNewAPICompat === true,
      textModelID: input.textModelID || FHL_TEXT_MODEL_ID,
      imageModelID: input.imageModelID || FHL_IMAGE_MODEL_ID,
      outputFormat: input.outputFormat || "png",
      quality: input.quality || "medium",
      size: input.size || "1024x1024",
      partialImages: input.partialImages ?? 1,
    }),
  });
  return response.ok;
}

export function syncCLIConfigQuietly(input: CLIConfigSyncInput = {}) {
  void syncCLIConfig(input).catch(() => undefined);
}
