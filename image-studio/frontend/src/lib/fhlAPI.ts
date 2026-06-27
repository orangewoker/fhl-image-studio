import type { StudioState } from "../state/studioStore.types";
import { GetStoredAPIKey } from "../platform/runtime/host";
import { requestImagesOnce } from "../platform/runtime/remote-kernel/images";
import { requestResponsesOnce } from "../platform/runtime/remote-kernel/responses";
import { RemoteKernelError, type RemoteJobRequest } from "../platform/runtime/remote-kernel/types";
import type { UpstreamProfile } from "../types/domain";
import { syncCLIConfigQuietly } from "./cliConfigSync";
import {
  DEFAULT_CONCURRENCY_LIMIT,
  FHL_BASE_URL,
  FHL_IMAGE_MODEL_ID,
  FHL_IMAGES_PROFILE_ID,
  FHL_PROFILE_ID,
  FHL_TEXT_MODEL_ID,
  keyringUserFor,
} from "./profiles";

export const FHL_INVITE_CODE = "LPUH6EEHGK3R";
export const FHL_REGISTER_URL = `https://www.fhl.mom/register?aff=${FHL_INVITE_CODE}`;

type FHLProfileActions = Pick<
  StudioState,
  "profiles" | "activeProfileId" | "createProfile" | "updateProfile" | "setActiveProfile"
>;

type FHLPairConfig = {
  responsesId: string;
  imagesId: string;
  baseName: string;
};

export type FHLQuickVerifyResult = {
  ok: boolean;
  detail: string;
  rawPath: string | null;
  profileId: string;
  profileName: string;
  apiMode: "responses" | "images";
};

type FHLVerifyOptions = {
  proxyMode?: string;
  proxyURL?: string;
  signal?: AbortSignal;
};

const FHL_VERIFY_PROMPT = "Minimal test image of a plain white ceramic mug on a neutral background.";
const FHL_VERIFY_SIZE = "1024x1024";
const FHL_VERIFY_QUALITY = "low";
const FHL_VERIFY_OUTPUT_FORMAT = "png";
const FHL_VERIFY_TIMEOUT_MS = 45_000;

function normalizeBaseURL(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function isOfficialFHLProfile(
  profile: Pick<StudioState["profiles"][number], "apiMode" | "baseURL" | "imageModelID"> | null | undefined,
): boolean {
  if (!profile) return false;
  return (profile.apiMode === "images" || profile.apiMode === "responses")
    && normalizeBaseURL(profile.baseURL) === FHL_BASE_URL
    && profile.imageModelID === FHL_IMAGE_MODEL_ID;
}

function parseFHLBaseName(name: string): string | null {
  const match = name.trim().match(/^(FHL-\d+)(?:\s+(?:Responses|Images))?$/i);
  return match ? match[1] : null;
}

function desiredFHLProfileName(baseName: string, apiMode: "responses" | "images"): string {
  return `${baseName} ${apiMode === "responses" ? "Responses" : "Images"}`;
}

function shouldRenameLegacyFHLProfile(name: string, desiredName: string): boolean {
  const trimmed = name.trim();
  if (trimmed === desiredName) return false;
  if (trimmed === "" || trimmed === "FHL Responses" || trimmed === "FHL Images") return true;
  if (/^配置\s*\d+$/u.test(trimmed)) return true;
  return parseFHLBaseName(trimmed) !== null;
}

function nextFHLBaseName(store: FHLProfileActions, currentIds: string[] = []): string {
  const ignored = new Set(currentIds.filter(Boolean));
  const usedNumbers = new Set<number>();
  for (const profile of store.profiles) {
    if (ignored.has(profile.id)) continue;
    const baseName = parseFHLBaseName(profile.name);
    if (!baseName) continue;
    const match = baseName.match(/^FHL-(\d+)$/i);
    const value = match ? Number(match[1]) : Number.NaN;
    if (Number.isInteger(value) && value > 0) usedNumbers.add(value);
  }
  let index = 1;
  while (usedNumbers.has(index)) index += 1;
  return `FHL-${index}`;
}

function findFHLProfile(
  store: FHLProfileActions,
  apiMode: "responses" | "images",
): StudioState["profiles"][number] | null {
  const expectedId = apiMode === "responses" ? FHL_PROFILE_ID : FHL_IMAGES_PROFILE_ID;
  return store.profiles.find((profile) => (
    (profile.id === expectedId)
    || (profile.apiMode === apiMode && isOfficialFHLProfile(profile))
  )) ?? null;
}

async function loadStoredProfileAPIKey(profileId: string): Promise<string> {
  const stored = await GetStoredAPIKey(keyringUserFor(profileId)).catch(() => "");
  return stored.trim();
}

function resolveFHLBaseName(
  store: FHLProfileActions,
  responsesProfile: StudioState["profiles"][number] | null,
  imagesProfile: StudioState["profiles"][number] | null,
): string {
  const existingBase = parseFHLBaseName(responsesProfile?.name || "")
    || parseFHLBaseName(imagesProfile?.name || "");
  return existingBase || nextFHLBaseName(store, [responsesProfile?.id || "", imagesProfile?.id || ""]);
}

export async function ensureFHLProfiles(store: FHLProfileActions): Promise<FHLPairConfig> {
  const responsesProfile = findFHLProfile(store, "responses");
  const imagesProfile = findFHLProfile(store, "images");
  const baseName = resolveFHLBaseName(store, responsesProfile, imagesProfile);
  const responsesName = desiredFHLProfileName(baseName, "responses");
  const imagesName = desiredFHLProfileName(baseName, "images");
  const responsesKey = responsesProfile ? await loadStoredProfileAPIKey(responsesProfile.id) : "";
  const imagesKey = imagesProfile ? await loadStoredProfileAPIKey(imagesProfile.id) : "";
  const sharedKey = responsesKey || imagesKey;
  let responsesId = responsesProfile?.id || "";
  let imagesId = imagesProfile?.id || "";

  if (!responsesProfile) {
    responsesId = await store.createProfile({
      name: responsesName,
      apiMode: "responses",
      requestPolicy: "openai",
      baseURL: FHL_BASE_URL,
      textModelID: FHL_TEXT_MODEL_ID,
      imageModelID: FHL_IMAGE_MODEL_ID,
      concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT,
      imagesNewAPICompat: false,
      apiKey: sharedKey || undefined,
      setActive: true,
    });
  } else {
    const patch: Parameters<FHLProfileActions["updateProfile"]>[1] = {
      name: shouldRenameLegacyFHLProfile(responsesProfile.name, responsesName)
        ? responsesName
        : responsesProfile.name,
      apiMode: "responses",
      requestPolicy: "openai",
      baseURL: FHL_BASE_URL,
      textModelID: FHL_TEXT_MODEL_ID,
      imageModelID: FHL_IMAGE_MODEL_ID,
      concurrencyLimit: responsesProfile.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT,
      imagesNewAPICompat: false,
    };
    if (!responsesKey && sharedKey) patch.apiKey = sharedKey;
    await store.updateProfile(responsesProfile.id, patch);
    if (responsesProfile.id !== store.activeProfileId) {
      await store.setActiveProfile(responsesProfile.id);
    }
    responsesId = responsesProfile.id;
  }

  if (!imagesProfile) {
    imagesId = await store.createProfile({
      name: imagesName,
      apiMode: "images",
      requestPolicy: "openai",
      baseURL: FHL_BASE_URL,
      textModelID: "",
      imageModelID: FHL_IMAGE_MODEL_ID,
      concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT,
      imagesNewAPICompat: true,
      apiKey: sharedKey || undefined,
      setActive: false,
    });
  } else {
    const patch: Parameters<FHLProfileActions["updateProfile"]>[1] = {
      name: shouldRenameLegacyFHLProfile(imagesProfile.name, imagesName)
        ? imagesName
        : imagesProfile.name,
      apiMode: "images",
      requestPolicy: "openai",
      baseURL: FHL_BASE_URL,
      textModelID: "",
      imageModelID: FHL_IMAGE_MODEL_ID,
      concurrencyLimit: imagesProfile.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT,
      imagesNewAPICompat: true,
    };
    if (!imagesKey && sharedKey) patch.apiKey = sharedKey;
    await store.updateProfile(imagesProfile.id, patch);
    imagesId = imagesProfile.id;
  }

  syncCLIConfigQuietly();
  return { responsesId, imagesId, baseName };
}

export async function configureFHLProfilesWithSharedAPIKey(
  store: FHLProfileActions,
  apiKey: string,
): Promise<FHLPairConfig> {
  const pair = await ensureFHLProfiles(store);
  await store.updateProfile(pair.responsesId, { apiKey });
  await store.updateProfile(pair.imagesId, { apiKey });
  if (pair.responsesId !== store.activeProfileId) {
    await store.setActiveProfile(pair.responsesId);
  }
  syncCLIConfigQuietly();
  return pair;
}

function buildFHLVerificationRequest(
  profile: UpstreamProfile,
  apiKey: string,
  options: FHLVerifyOptions,
): RemoteJobRequest {
  return {
    payload: {
      apiKey,
      mode: "generate",
      prompt: FHL_VERIFY_PROMPT,
      size: FHL_VERIFY_SIZE,
      quality: FHL_VERIFY_QUALITY,
      outputFormat: FHL_VERIFY_OUTPUT_FORMAT,
      imagePaths: [],
      imagePath: "",
      maskB64: "",
      seed: 0,
      negativePrompt: "",
      baseURL: profile.baseURL || FHL_BASE_URL,
      textModelID: profile.textModelID || FHL_TEXT_MODEL_ID,
      imageModelID: profile.imageModelID || FHL_IMAGE_MODEL_ID,
      proxyMode: options.proxyMode || "system",
      proxyURL: options.proxyURL || "",
      apiMode: profile.apiMode,
      requestPolicy: profile.requestPolicy || "openai",
      imagesNewAPICompat: profile.apiMode === "images" ? (profile.imagesNewAPICompat ?? true) : false,
      noPromptRevision: true,
      concurrencyLimit: 1,
      partialImages: 0,
    },
  };
}

function createVerificationSignal(
  options: FHLVerifyOptions,
): {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FHL_VERIFY_TIMEOUT_MS);
  const abortFromParent = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromParent, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromParent);
    },
    didTimeout: () => timedOut,
  };
}

function formatVerificationError(error: unknown, timedOut: boolean): string {
  if (timedOut) return `验证超时（${Math.ceil(FHL_VERIFY_TIMEOUT_MS / 1000)} 秒）`;
  if (error instanceof DOMException && error.name === "AbortError") return "验证已取消";
  const message = String((error as any)?.message || error || "").trim();
  if (!message) return "连接失败";
  return message;
}

export async function verifyFHLImageCapability(
  profile: UpstreamProfile,
  apiKey: string,
  options: FHLVerifyOptions = {},
): Promise<FHLQuickVerifyResult> {
  const verify = createVerificationSignal(options);
  const request = buildFHLVerificationRequest(profile, apiKey, options);
  try {
    const result = profile.apiMode === "images"
      ? await requestImagesOnce(request, 1, { signal: verify.signal })
      : await requestResponsesOnce(request, 1, { signal: verify.signal });
    return {
      ok: true,
      detail: "成功",
      rawPath: result.rawPath,
      profileId: profile.id,
      profileName: profile.name,
      apiMode: profile.apiMode === "images" ? "images" : "responses",
    };
  } catch (error) {
    return {
      ok: false,
      detail: formatVerificationError(error, verify.didTimeout()),
      rawPath: error instanceof RemoteKernelError ? error.rawPath : null,
      profileId: profile.id,
      profileName: profile.name,
      apiMode: profile.apiMode === "images" ? "images" : "responses",
    };
  } finally {
    verify.cleanup();
  }
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the legacy path below in restricted browser shells.
    }
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.top = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    input.remove();
  }

  if (!copied) throw new Error("Copy command was blocked");
}

export async function ensureFHLResponsesProfile(store: FHLProfileActions): Promise<string> {
  const pair = await ensureFHLProfiles(store);
  return pair.responsesId;
}

export function focusFHLAPIKeyInput() {
  const focusOnce = () => {
    const input = document.querySelector<HTMLInputElement>("[data-fhl-api-key-input='true']");
    if (!input) return false;
    const clearHighlight = () => {
      input.removeAttribute("data-fhl-api-key-highlight");
      const timer = Number(input.dataset.fhlApiKeyHighlightTimer || 0);
      if (timer) window.clearTimeout(timer);
      delete input.dataset.fhlApiKeyHighlightTimer;
    };
    clearHighlight();
    input.setAttribute("data-fhl-api-key-highlight", "true");
    input.addEventListener("input", clearHighlight, { once: true });
    input.dataset.fhlApiKeyHighlightTimer = String(window.setTimeout(clearHighlight, 9000));
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus();
    input.select();
    return true;
  };

  if (focusOnce()) return;
  [80, 220, 420, 720].forEach((delay) => {
    window.setTimeout(focusOnce, delay);
  });
}
