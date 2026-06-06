import { buildPromptOptimizePayload } from "../../../../../../shared/kernel/requestModel.js";
import {
  extractResponseErrorMessage,
  extractResponseText,
  fileNameFromPath,
  isRetryableRaw,
  isTransportishError,
  normalizeAPIMode,
  normalizeAPIKeyForHeader,
  normalizeBaseURL,
  readRegisteredText,
  shouldUseAndroidNativeHTTP,
  sleepWithSignal,
  sourceToDataURL,
} from "./common.ts";
import { nativeHttpRequestText } from "./nativeHttp.ts";
import { requestImagesOnce } from "./images.ts";
import { requestResponsesOnce } from "./responses.ts";
import {
  MAX_ATTEMPTS,
  RETRY_BACKOFF_MS,
  RemoteKernelError,
  type RemotePromptOptimizeInput,
  type RemoteJobCallbacks,
  type RemoteJobRequest,
  type RemoteJobResult,
} from "./types.ts";

export * from "./types.ts";

function stableSizeForRetry(size: string): string {
  switch (size) {
    case "2048x2048":
    case "2880x2880":
      return "1024x1024";
    case "2048x1360":
    case "3456x2304":
      return "1536x1024";
    case "1360x2048":
    case "2304x3456":
      return "1024x1536";
    case "2048x1152":
    case "3840x2160":
      return "1536x864";
    case "1152x2048":
    case "2160x3840":
      return "864x1536";
    case "auto":
      return "1024x1024";
    default:
      return size || "1024x1024";
  }
}

function stabilizeRequestForAttempt(request: RemoteJobRequest, attempt: number): RemoteJobRequest {
  if (attempt <= 1) return request;
  const payload = {
    ...request.payload,
    partialImages: 0,
  };
  if (attempt >= 3) {
    payload.size = stableSizeForRetry(payload.size);
    payload.noPromptRevision = false;
    if (payload.quality === "auto" || payload.quality === "high") {
      payload.quality = "medium";
    }
  }
  return { ...request, payload };
}

function isNoFinalImageError(error: RemoteKernelError): boolean {
  const message = String(error.message || "").toLowerCase();
  return message.includes("image_generation_call.result")
    || message.includes("final")
    || message.includes("partial")
    || message.includes("没有返回图片")
    || message.includes("text-only")
    || message.includes("\u4e2d\u95f4\u9884\u89c8");
}

function retryHintForAttempt(attempt: number, request: RemoteJobRequest): string {
  if (attempt === 1) return "Auto retry: disabling partial previews for the next attempt.";
  if (attempt === 2) {
    const next = stabilizeRequestForAttempt(request, 3).payload;
    return `Auto downgrade retry: partial previews off, using ${next.size} / ${next.quality}, allowing safe prompt adaptation.`;
  }
  return "Auto retrying...";
}

export async function runRemoteImageJob(
  request: RemoteJobRequest,
  callbacks: RemoteJobCallbacks,
): Promise<RemoteJobResult> {
  let lastError: RemoteKernelError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptRequest = stabilizeRequestForAttempt(request, attempt);
    try {
      const apiMode = normalizeAPIMode(attemptRequest.payload.apiMode);
      if (apiMode === "images") {
        return await requestImagesOnce(attemptRequest, attempt, callbacks);
      }
      return await requestResponsesOnce(attemptRequest, attempt, callbacks);
    } catch (error) {
      if (callbacks.signal.aborted) throw error;
      const typed = error instanceof RemoteKernelError
        ? error
        : new RemoteKernelError(String((error as any)?.message || error));
      lastError = typed;
      let retryableRaw = false;
      if (typed.rawPath) {
        try {
          retryableRaw = isRetryableRaw(readRegisteredText(typed.rawPath));
        } catch {
          retryableRaw = false;
        }
      }
      const retryable = retryableRaw || isTransportishError(typed) || isNoFinalImageError(typed);
      if (attempt < MAX_ATTEMPTS && retryable) {
        callbacks.onLog?.(typed.message);
        callbacks.onLog?.(retryHintForAttempt(attempt, request));
        callbacks.onLog?.(`${Math.floor(RETRY_BACKOFF_MS / 1000)} 绉掑悗鑷姩閲嶈瘯...`);
        await sleepWithSignal(callbacks.signal, RETRY_BACKOFF_MS);
        continue;
      }
      throw typed;
    }
  }
  throw lastError ?? new RemoteKernelError("Request failed after multiple attempts");
}

export async function optimizePromptRemote(
  input: RemotePromptOptimizeInput,
  signal: AbortSignal,
): Promise<string> {
  const mergedSources = input.sourceImages?.length
    ? input.sourceImages
    : [
        ...(input.imagePaths ?? []).map((path) => ({ path, name: fileNameFromPath(path) })),
        ...(input.imagePath ? [{ path: input.imagePath, name: fileNameFromPath(input.imagePath) }] : []),
      ];
  const sourceDataURLs: string[] = [];
  for (const source of mergedSources) {
    const dataURL = await sourceToDataURL(source);
    if (dataURL) sourceDataURLs.push(dataURL);
  }
  const url = `${normalizeBaseURL(input.baseURL)}/v1/responses`;
  const apiKey = normalizeAPIKeyForHeader(input.apiKey);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const body = JSON.stringify(buildPromptOptimizePayload(input, sourceDataURLs));
  const proxyMode = input.proxyMode === "none" || input.proxyMode === "custom" ? input.proxyMode : "system";
  const response = shouldUseAndroidNativeHTTP()
    ? await nativeHttpRequestText(url, "POST", headers, body, signal, undefined, {
        proxyMode,
        proxyURL: input.proxyURL || "",
      })
    : {
        status: 0,
        body: "",
      };
  const raw = shouldUseAndroidNativeHTTP()
    ? response.body
    : await (async () => {
        if (proxyMode !== "system") {
          throw new RemoteKernelError("褰撳墠杩滅▼鍐呮牳涓嶈兘鎺у埗浠ｇ悊,璇峰垏鍥炴湰鍦板唴鏍告垨浣跨敤 Android 鍘熺敓杩愯");
        }
        const webResponse = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal,
        });
        const text = await webResponse.text();
        response.status = webResponse.status;
        return text;
      })();
  if (response.status < 200 || response.status >= 300) {
    throw new RemoteKernelError(`涓婃父杩斿洖 ${response.status}:${extractResponseErrorMessage(raw)}`);
  }
  const text = extractResponseText(raw);
  if (!text) {
    throw new RemoteKernelError("Upstream did not return a usable prompt optimization result");
  }
  return text;
}

export {
  MAX_ATTEMPTS,
  RETRY_BACKOFF_MS,
};

