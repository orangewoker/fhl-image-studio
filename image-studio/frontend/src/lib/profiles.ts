import type { APIMode, RequestPolicy, UpstreamProfile } from "../types/domain";
import { STORAGE_NAMESPACE, storageKey } from "./storageNamespace.ts";

// localStorage 键名规范:
//   gptcodex.profiles        —— UpstreamProfile[] JSON(无 apiKey,key 在 keyring)
//   gptcodex.activeProfileId —— 当前 active profile 的 id
//
// 老格式(v0.1.5 及之前)在 bootstrap 一次性迁移:
//   gptcodex.apiMode                            "responses" | "images"
//   gptcodex.{responses,images}.baseURL
//   gptcodex.{responses,images}.textModelID
//   gptcodex.{responses,images}.imageModelID
//   gptcodex.{responses,images}.concurrencyLimit
//   keyring api-key:responses / api-key:images  → 搬到 api-key:profile:<newId>
export const PROFILES_LS_KEY = storageKey("gptcodex.profiles");
export const ACTIVE_PROFILE_LS_KEY = storageKey("gptcodex.activeProfileId");
export const FHL_PROFILE_ID = "fhl-responses-default";
export const FHL_PROFILE_NAME = "配置1";
export const FHL_BASE_URL = "https://www.fhl.mom";
export const FHL_TEXT_MODEL_ID = "gpt-5.5";
export const FHL_IMAGE_MODEL_ID = "gpt-image-2";
export const FHL_SUPPORTED_IMAGE_MODEL_IDS = [
  "codex-gpt-image-2",
  "gpt-image-2",
  "plus-codex-gpt-image-2",
  "pro-codex-gpt-image-2",
  "team-codex-gpt-image-2",
] as const;
export const DEFAULT_CONCURRENCY_LIMIT = 1;
export const APIMART_PROFILE_ID = "apimart-default";
export const APIMART_PROFILE_NAME = "APIMart";
export const APIMART_BASE_URL = "https://api.apimart.ai";
export const APIMART_OPENAI_BASE_URL = "https://api.apimart.ai/v1";
export const APIMART_LEGACY_BASE_URL = "https://api.apib.ai";
export const APIMART_LEGACY_OPENAI_BASE_URL = "https://api.apib.ai/v1";
export const APIMART_TEXT_MODEL_ID = "gpt-5";
export const APIMART_IMAGE_MODEL_ID = "gpt-image-2";
export const RUNNINGHUB_PROFILE_ID = "runninghub-banana2-default";
export const RUNNINGHUB_BANANA2_PROFILE_NAME = "RH-1 全能图像2";
export const RUNNINGHUB_IMAGE_G2_PROFILE_NAME = "RH-1 全能图像G2";
export const RUNNINGHUB_BASE_URL = "http://10.0.2.2:8117";
export const RUNNINGHUB_LOCALHOST_BASE_URL = "http://127.0.0.1:8117";
export const RUNNINGHUB_DEFAULT_MODEL_ID = "banana2";
export const RUNNINGHUB_IMAGE_G2_MODEL_ID = "image_g2";

type UpstreamConfigInput = {
  apiMode?: APIMode | string;
  baseURL?: string;
  providerName?: string;
};

export type UpstreamConfigKind = "fhl" | "images" | "apimart" | "runninghub" | "responses";

function comparableBaseURL(value: string): string {
  const normalized = String(value || "").trim().replace(/\/+$/, "").toLowerCase();
  return normalized.endsWith("/v1") ? normalized.slice(0, -3) : normalized;
}

export function normalizeProfileAPIMode(value: unknown): APIMode {
  const mode = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (mode === "images" || mode === "apimart" || mode === "runninghub") return mode;
  return "responses";
}

export function isFHLBaseURL(baseURL: string): boolean {
  return comparableBaseURL(baseURL) === comparableBaseURL(FHL_BASE_URL);
}

export function isSupportedFHLImageModelID(modelID: string): boolean {
  const normalized = String(modelID || "").trim().toLowerCase();
  return FHL_SUPPORTED_IMAGE_MODEL_IDS.some((model) => model === normalized);
}

export function normalizeFHLImageModelID(baseURL: string, modelID: string): string {
  const normalized = String(modelID || "").trim();
  if (!isFHLBaseURL(baseURL)) return normalized;
  return isSupportedFHLImageModelID(normalized) ? normalized : FHL_IMAGE_MODEL_ID;
}

export function isAPIMartBaseURL(baseURL: string): boolean {
  return comparableBaseURL(baseURL) === comparableBaseURL(APIMART_BASE_URL)
    || comparableBaseURL(baseURL) === comparableBaseURL(APIMART_OPENAI_BASE_URL)
    || comparableBaseURL(baseURL) === comparableBaseURL(APIMART_LEGACY_BASE_URL)
    || comparableBaseURL(baseURL) === comparableBaseURL(APIMART_LEGACY_OPENAI_BASE_URL);
}

export function isRunningHubBaseURL(baseURL: string): boolean {
  const comparable = comparableBaseURL(baseURL);
  return comparable === comparableBaseURL(RUNNINGHUB_BASE_URL)
    || comparable === comparableBaseURL(RUNNINGHUB_LOCALHOST_BASE_URL);
}

export function identifyUpstreamConfig(input: UpstreamConfigInput): UpstreamConfigKind {
  const apiMode = normalizeProfileAPIMode(input.apiMode);
  const baseURL = input.baseURL ?? "";
  if (apiMode === "apimart" || isAPIMartBaseURL(baseURL)) return "apimart";
  if (apiMode === "runninghub" || isRunningHubBaseURL(baseURL)) return "runninghub";
  if (isFHLBaseURL(baseURL)) return "fhl";
  if (apiMode === "images") return "images";
  return "responses";
}

export function upstreamConfigLabel(input: UpstreamConfigInput): string {
  const customLabel = String(input.providerName || "").trim();
  if (customLabel) return customLabel;
  const kind = identifyUpstreamConfig(input);
  if (kind === "fhl") return "FHL";
  if (kind === "images") return "OpenAI 标准 v1";
  if (kind === "apimart") return "APIMart";
  if (kind === "runninghub") return "RunningHub";
  return "Responses API";
}

export function upstreamConfigShortLabel(input: UpstreamConfigInput): string {
  const customLabel = String(input.providerName || "").trim();
  if (customLabel) return customLabel.length > 10 ? `${customLabel.slice(0, 9)}…` : customLabel;
  const kind = identifyUpstreamConfig(input);
  if (kind === "fhl") return "FHL";
  if (kind === "apimart") return "APIMart";
  if (kind === "runninghub") return "RH";
  return kind === "images" ? "OpenAI v1" : "Responses";
}

export function defaultProfileValuesForAPIMode(apiMode: APIMode): {
  requestPolicy: RequestPolicy;
  baseURL: string;
  textModelID: string;
  imageModelID: string;
} {
  if (apiMode === "apimart") {
    return {
      requestPolicy: "openai",
      baseURL: APIMART_BASE_URL,
      textModelID: APIMART_TEXT_MODEL_ID,
      imageModelID: APIMART_IMAGE_MODEL_ID,
    };
  }
  if (apiMode === "responses") {
    return {
      requestPolicy: "openai",
      baseURL: FHL_BASE_URL,
      textModelID: FHL_TEXT_MODEL_ID,
      imageModelID: FHL_IMAGE_MODEL_ID,
    };
  }
  if (apiMode === "runninghub") {
    return {
      requestPolicy: "openai",
      baseURL: RUNNINGHUB_BASE_URL,
      textModelID: "",
      imageModelID: RUNNINGHUB_DEFAULT_MODEL_ID,
    };
  }
  return {
    requestPolicy: "openai",
    baseURL: "",
    textModelID: "",
    imageModelID: "",
  };
}

export function makeFHLResponsesProfile(): UpstreamProfile {
  return {
    id: FHL_PROFILE_ID,
    name: FHL_PROFILE_NAME,
    providerName: "FHL",
    apiMode: "responses",
    requestPolicy: "openai",
    baseURL: FHL_BASE_URL,
    textModelID: FHL_TEXT_MODEL_ID,
    imageModelID: FHL_IMAGE_MODEL_ID,
    concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT,
    imagesNewAPICompat: false,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
}

export function makeAPIMartProfile(): UpstreamProfile {
  return {
    id: APIMART_PROFILE_ID,
    name: APIMART_PROFILE_NAME,
    providerName: "APIMart",
    apiMode: "apimart",
    requestPolicy: "openai",
    baseURL: APIMART_BASE_URL,
    textModelID: APIMART_TEXT_MODEL_ID,
    imageModelID: APIMART_IMAGE_MODEL_ID,
    concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT,
    imagesNewAPICompat: false,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
}

export function makeRunningHubProfile(): UpstreamProfile {
  return {
    id: RUNNINGHUB_PROFILE_ID,
    name: RUNNINGHUB_BANANA2_PROFILE_NAME,
    providerName: "RunningHub",
    apiMode: "runninghub",
    requestPolicy: "openai",
    baseURL: RUNNINGHUB_BASE_URL,
    textModelID: "",
    imageModelID: RUNNINGHUB_DEFAULT_MODEL_ID,
    concurrencyLimit: 1,
    imagesNewAPICompat: false,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };
}

// crypto.randomUUID 在 WebView2 / 现代 Chromium 都有。fallback 防御老内核。
export function genProfileId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch { /* ignore */ }
  return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// keyringUser 把前端的 profile id 翻成后端 credentials.go 用的 user 字段。
// 命名空间 "profile:" 是为了和老的 "api-key:responses" / "api-key:images" 区分。
export function keyringUserFor(profileId: string): string {
  return `profile:${STORAGE_NAMESPACE}:${profileId}`;
}

export function apiModeLabel(mode: APIMode): string {
  if (mode === "apimart") return "APIMart";
  if (mode === "runninghub") return "RunningHub";
  return mode === "images" ? "OpenAI 标准 v1" : "Responses API";
}

export function requestPolicyLabel(mode: RequestPolicy): string {
  return mode === "compat" ? "兼容中转扩展" : "OpenAI 标准";
}

// 从可信任的 JSON 反序列化一个 profile。字段缺失 / 类型不对回 null,bootstrap
// 里遇到坏的就跳过,不让一条坏数据带崩整张表。
export function tryParseProfile(raw: unknown): UpstreamProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const name = typeof o.name === "string" ? o.name : "";
  const providerName = typeof o.providerName === "string" ? o.providerName.trim() : "";
  const apiMode = normalizeProfileAPIMode(o.apiMode);
  const requestPolicy = o.requestPolicy === "compat" ? "compat" : "openai";
  const baseURL = typeof o.baseURL === "string" ? o.baseURL : "";
  const textModelID = typeof o.textModelID === "string" ? o.textModelID : "";
  const imageModelID = typeof o.imageModelID === "string" ? o.imageModelID : "";
  const concurrencyLimit = typeof o.concurrencyLimit === "number" && o.concurrencyLimit >= 0
    ? Math.floor(o.concurrencyLimit) : 0;
  const imagesNewAPICompat = o.imagesNewAPICompat === true;
  const createdAt = typeof o.createdAt === "number" ? o.createdAt : Date.now();
  const lastUsedAt = typeof o.lastUsedAt === "number" ? o.lastUsedAt : undefined;
  if (!id || !name) return null;
  return { id, name, providerName, apiMode, requestPolicy, baseURL, textModelID, imageModelID, concurrencyLimit, imagesNewAPICompat, createdAt, lastUsedAt };
}

// 列表里挑当前 active —— activeProfileId 命中时用它,否则用最近使用过的,
// 否则就第一条。空列表返回 null,调用方据此弹「首次配置」modal。
export function pickActiveProfile(
  profiles: UpstreamProfile[],
  activeId: string,
): UpstreamProfile | null {
  if (profiles.length === 0) return null;
  const byId = profiles.find((p) => p.id === activeId);
  if (byId) return byId;
  const sorted = [...profiles].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
  return sorted[0] ?? profiles[0];
}

export function nextDefaultProfileName(profiles: UpstreamProfile[] = []): string {
  const usedNumbers = new Set<number>();
  for (const profile of profiles) {
    const match = profile.name.trim().match(/^配置\s*(\d+)$/);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > 0) usedNumbers.add(value);
  }
  let index = 1;
  while (usedNumbers.has(index)) index += 1;
  return `配置${index}`;
}

// 新建 profile 的默认值 —— UpstreamConfigModal 里点「+ 新建」用。
export function makeBlankProfile(apiMode: APIMode = "responses", profiles: UpstreamProfile[] = []): UpstreamProfile {
  const defaults = defaultProfileValuesForAPIMode(apiMode);
  return {
    id: genProfileId(),
    name: nextDefaultProfileName(profiles),
    apiMode,
    requestPolicy: defaults.requestPolicy,
    baseURL: defaults.baseURL,
    textModelID: defaults.textModelID,
    imageModelID: defaults.imageModelID,
    concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT,
    imagesNewAPICompat: false,
    createdAt: Date.now(),
  };
}

// 复制一个 profile,name 末尾追加「副本」并生成新 id。
// keyring 里的 apiKey 由调用方在 commit 后单独搬过来(get → set)。
export function duplicateProfile(p: UpstreamProfile): UpstreamProfile {
  return {
    ...p,
    id: genProfileId(),
    name: `${p.name} · 副本`,
    createdAt: Date.now(),
    lastUsedAt: undefined,
  };
}
