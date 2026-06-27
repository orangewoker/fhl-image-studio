import { FileText, RotateCw, Settings2, X } from "lucide-react";
import { OpenFile } from "../../platform/runtime/host";
import { usePlatform } from "../../platform/context";
import type { APIMode } from "../../types/domain";

function shouldRecommendAPISwitch(message: string): boolean {
  const normalized = message.toLowerCase();
  return /账号池|繁忙|稍后重试|自动重试|超时|耗时|排队|未返回|没有返回|返回图缺失|生成失败|503|504|429/.test(message)
    || /busy|timeout|timed out|overloaded|rate limit|too many requests|service unavailable|gateway timeout|no image|no result/.test(normalized);
}

async function copyTextFallback(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
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
  try {
    document.execCommand("copy");
  } finally {
    input.remove();
  }
}

export function ErrorNotice({
  errorMessage,
  errorRawPath,
  showRetry,
  onRetry,
  onClear,
  onPushToast,
  onOpenRawLog,
  onOpenUpstreamConfig,
  apiMode,
}: {
  errorMessage: string;
  errorRawPath: string | null;
  showRetry: boolean;
  onRetry: () => void;
  onClear: () => void;
  onPushToast: (text: string, kind?: "info" | "success" | "error" | "warn", ttl?: number) => void;
  onOpenRawLog?: (path: string) => void;
  onOpenUpstreamConfig?: () => void;
  apiMode?: APIMode;
}) {
  const { usesFluentUI } = usePlatform();
  const recommendAPISwitch = shouldRecommendAPISwitch(errorMessage);
  const recommendAPIMart = recommendAPISwitch && apiMode !== "apimart";

  return (
    <div className={`min-w-0 max-w-full shrink-0 border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-700 shadow-[var(--shadow-card)] dark:text-red-200 ${usesFluentUI ? "rounded-[12px]" : "rounded-[18px]"}`}>
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">{errorMessage}</div>
        <button
          onClick={onClear}
          className={`-m-1 shrink-0 p-1 text-red-400 hover:bg-red-500/10 hover:text-red-300 ${usesFluentUI ? "rounded-[6px]" : "rounded-full"}`}
          title="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {recommendAPISwitch ? (
        <div className={`mt-2 border border-red-500/20 bg-white/65 px-2.5 py-2 text-[11px] leading-5 text-red-700 dark:bg-white/[0.06] dark:text-red-100 ${usesFluentUI ? "rounded-[8px]" : "rounded-[12px]"}`}>
          <div className="font-semibold">
            {recommendAPIMart
              ? "当前上游可能不稳定，建议切换 API 配置，优先试试 APIMart 异步 API。"
              : "当前上游可能不稳定，建议切换 API 配置。"}
          </div>
          {onOpenUpstreamConfig ? (
            <button
              type="button"
              onClick={onOpenUpstreamConfig}
              className={`mt-1.5 inline-flex items-center gap-1 border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-red-500/18 ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}
            >
              <Settings2 className="w-3 h-3" /> 切换 API 配置
            </button>
          ) : null}
        </div>
      ) : null}
      {showRetry || errorRawPath ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {showRetry ? (
            <button
              onClick={onRetry}
              className={`platform-pill inline-flex items-center gap-1 bg-red-500/15 px-2.5 py-1 text-[11px] transition-colors hover:bg-red-500/25 ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}
            >
              <RotateCw className="w-3 h-3" /> 重试上次请求
            </button>
          ) : null}
          {errorRawPath ? (
            <button
              onClick={() => {
                if (onOpenRawLog) {
                  onOpenRawLog(errorRawPath);
                  return;
                }
                OpenFile(errorRawPath).catch((e: any) =>
                  copyTextFallback(errorRawPath)
                    .then(() => onPushToast(`无法打开日志，已复制日志路径:${errorRawPath}`, "warn", 7000))
                    .catch(() => onPushToast(`无法打开日志:${e?.message ?? e}\n日志路径:${errorRawPath}`, "error", 8000))
                );
              }}
              title={errorRawPath}
              className={`platform-pill inline-flex items-center gap-1 px-2.5 py-1 text-[11px] ring-1 ring-red-500/30 transition-colors hover:bg-red-500/10 ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}
            >
              <FileText className="w-3 h-3" /> 查看日志
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
