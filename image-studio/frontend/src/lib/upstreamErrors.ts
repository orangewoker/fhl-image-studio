import { FHL_IMAGE_MODEL_ID } from "./profiles.ts";

export type UpstreamErrorKind = "connection-reset" | "unsupported-image-model" | "generic";

export type UpstreamErrorDisplay = {
  kind: UpstreamErrorKind;
  message: string;
  detail: string | null;
};

function rawErrorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string") return error.trim();
  return String(error ?? "").trim();
}

function stripWrapperPrefixes(message: string): string {
  return message
    .replace(/^Bad state:\s*/i, "")
    .replace(/^Exception:\s*/i, "")
    .trim();
}

export function formatUpstreamError(error: unknown): UpstreamErrorDisplay {
  const raw = rawErrorText(error) || "未知上游错误";
  const clean = stripWrapperPrefixes(raw);
  const normalized = clean.toLowerCase();

  if (/unsupported image model|image model.*(?:unsupported|not supported)/i.test(clean)) {
    const supported = clean.match(/supported models?\s*:\s*([^()\n]+)/i)?.[1]?.trim();
    return {
      kind: "unsupported-image-model",
      message: supported
        ? `当前图像模型不受支持。请在上游配置中选择：${supported}`
        : `当前图像模型不受支持。FHL 推荐使用 ${FHL_IMAGE_MODEL_ID}。`,
      detail: clean === raw ? raw : clean,
    };
  }

  if (/connection reset|socketexception|errno\s*=\s*54|broken pipe|connection closed before/i.test(normalized)) {
    return {
      kind: "connection-reset",
      message: "连接被上游服务器重置。应用会自动重试；如果仍失败，请切换网络后再次测试。",
      detail: clean,
    };
  }

  return {
    kind: "generic",
    message: clean,
    detail: clean === raw ? null : raw,
  };
}

export function upstreamErrorMessage(error: unknown): string {
  return formatUpstreamError(error).message;
}
