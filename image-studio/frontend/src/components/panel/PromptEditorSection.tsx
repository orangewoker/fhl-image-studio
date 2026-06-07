import { lazy, Suspense, useLayoutEffect, useRef, useState } from "react";
import { Copy, ImageUp, ListPlus, Sparkles, Trash2 } from "lucide-react";
import { submitShortcutLabel } from "../../platform";
import { usePlatform } from "../../platform/context";
import { useStudioStore } from "../../state/studioStore";
import type { ReversePromptImage } from "../../state/studioStore.types";
import { copyText } from "../../lib/fhlAPI";
import { STYLE_CHIPS } from "./panelOptions";

const PromptPopover = lazy(() => import("./PromptPopover").then((m) => ({ default: m.PromptPopover })));

export function PromptEditorSection({
  mode,
  prompt,
  optimizationGuidance,
  promptLen,
  promptPopover,
  setPromptPopover,
  optimizeReady,
  isOptimizingPrompt,
  isReversingPrompt,
  reverseReady,
  reversePromptImage,
  styleTag,
  onSetPrompt,
  onSetOptimizationGuidance,
  onSelectReversePromptImage,
  onImportReversePromptImageFile,
  onClearReversePromptImage,
  onOptimizePromptBase,
  onReversePrompt,
  onRewritePrompt,
  onSetStyleTag,
}: {
  mode: "generate" | "edit";
  prompt: string;
  optimizationGuidance: string;
  promptLen: number;
  promptPopover: boolean;
  setPromptPopover: (open: boolean | ((v: boolean) => boolean)) => void;
  optimizeReady: boolean;
  isOptimizingPrompt: boolean;
  isReversingPrompt: boolean;
  reverseReady: boolean;
  reversePromptImage: ReversePromptImage | null;
  styleTag: string;
  onSetPrompt: (value: string) => void;
  onSetOptimizationGuidance: (value: string) => void;
  onSelectReversePromptImage: () => void;
  onImportReversePromptImageFile: (file: File) => Promise<void>;
  onClearReversePromptImage: () => void;
  onOptimizePromptBase: () => void;
  onReversePrompt: () => void;
  onRewritePrompt: () => void;
  onSetStyleTag: (value: string) => void;
}) {
  const { isMac, usesFluentUI } = usePlatform();
  const promptPopoverAnchorRef = useRef<HTMLButtonElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const optimizationGuidanceRef = useRef<HTMLTextAreaElement | null>(null);
  const [reverseDragActive, setReverseDragActive] = useState(false);
  const pushToast = useStudioStore((state) => state.pushToast);
  const promptBusy = isOptimizingPrompt || isReversingPrompt;
  const rewriteReady = optimizeReady && optimizationGuidance.trim().length > 0;
  const reversePreviewSrc = reversePromptImage?.previewUrl
    || (reversePromptImage?.imageB64 ? `data:image/png;base64,${reversePromptImage.imageB64}` : "");
  const promptMinHeight = usesFluentUI ? 124 : isMac ? 176 : 124;
  const optimizationGuidanceMinHeight = 62;

  const resizePrompt = () => {
    const el = promptRef.current;
    if (!el) return;
    const borderHeight = el.offsetHeight - el.clientHeight;
    el.style.height = "0px";
    el.style.height = `${Math.max(promptMinHeight, el.scrollHeight + borderHeight)}px`;
  };

  const resizeOptimizationGuidance = () => {
    const el = optimizationGuidanceRef.current;
    if (!el) return;
    if (!el.value) {
      el.style.height = `${optimizationGuidanceMinHeight}px`;
      return;
    }
    el.style.height = "0px";
    el.style.height = `${Math.max(optimizationGuidanceMinHeight, el.scrollHeight)}px`;
  };

  useLayoutEffect(() => {
    resizePrompt();
  }, [prompt, promptMinHeight]);

  useLayoutEffect(() => {
    resizeOptimizationGuidance();
  }, [optimizationGuidance]);

  const copyPrompt = async () => {
    const text = prompt.trim();
    if (!text) return;
    try {
      await copyText(text);
      pushToast("提示词已复制", "success", 2400);
    } catch {
      pushToast("复制失败，请手动复制提示词", "error", 4200);
    }
  };

  const clearPrompt = () => {
    onSetPrompt("");
    requestAnimationFrame(resizePrompt);
  };

  const importDroppedReverseImage = (files: FileList | null) => {
    const file = Array.from(files ?? []).find((item) => item.type.startsWith("image/"));
    if (!file) {
      pushToast("请拖入 PNG/JPG/WebP 图片", "warn", 2800);
      return;
    }
    void onImportReversePromptImageFile(file);
  };

  return (
    <section className={`relative overflow-visible ${promptPopover ? "z-30" : "z-0"}`}>
      <div className="mb-2 flex items-end justify-between gap-3 px-0.5">
        <h2
          className={`text-zinc-950 dark:text-zinc-50 ${usesFluentUI ? "text-[18px] font-semibold" : "text-[21px] font-bold"}`}
          style={{ fontFamily: "var(--title-font)" }}
        >
          提示词
        </h2>
        <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
          {mode === "edit" ? "修改要求" : "文生图 prompt"}
        </span>
      </div>
      <div className={`platform-card relative overflow-visible ${isMac ? "p-5" : "p-4"}`}>
        <div className={`border border-black/[0.06] bg-[var(--surface)]/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:border-white/[0.06] dark:bg-white/[0.025] ${usesFluentUI ? "rounded-[10px]" : isMac ? "rounded-[16px]" : "rounded-[12px]"}`}>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <label className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            主提示词
          </label>
        </div>
        <div
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            event.stopPropagation();
            setReverseDragActive(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "copy";
            setReverseDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setReverseDragActive(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setReverseDragActive(false);
            importDroppedReverseImage(event.dataTransfer.files);
          }}
          className={`mb-2.5 border border-dashed p-2.5 transition-colors ${
            reverseDragActive
              ? "border-[color:var(--accent)] bg-[var(--accent-soft)] ring-2 ring-[color:var(--accent)]/25"
              : "border-[color:var(--accent)]/28 bg-[var(--accent-soft)]/45"
          } ${usesFluentUI ? "rounded-[10px]" : "rounded-[12px]"}`}
        >
          {reversePromptImage ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden bg-[var(--surface)] ring-1 ring-[color:var(--accent)]/20 ${usesFluentUI ? "rounded-[8px]" : "rounded-[10px]"}`}>
                  {reversePreviewSrc ? (
                    <img src={reversePreviewSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageUp className="h-4 w-4 text-[var(--accent)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-zinc-800 dark:text-zinc-100" title={reversePromptImage.name}>
                    {reversePromptImage.name || "反推图片"}
                  </div>
                  <div className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
                    {reverseDragActive ? "松开导入反推图片" : "可选反推图片"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClearReversePromptImage}
                  disabled={promptBusy}
                  className="shrink-0 text-[11px] font-medium text-[var(--accent)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                  title="清除反推图片"
                >
                  清除
                </button>
              </div>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={onReversePrompt}
                  disabled={!reverseReady || promptBusy}
                  className={`platform-pill inline-flex min-h-[34px] min-w-[132px] items-center justify-center gap-1.5 px-4 text-[11px] font-medium transition-colors ${
                    isReversingPrompt
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "bg-[var(--accent)] text-white shadow-sm hover:brightness-105"
                  } disabled:cursor-not-allowed disabled:opacity-45 ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}
                  title={reverseReady ? "把图片反推成中文文生图提示词" : "先上传、生成或导入一张图片"}
                >
                  <ImageUp className={`w-3 h-3 ${isReversingPrompt ? "animate-pulse" : ""}`} />
                  {isReversingPrompt ? "反推中..." : "反推提示词"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSelectReversePromptImage}
              disabled={promptBusy}
              className={`flex min-h-[58px] w-full flex-col items-center justify-center gap-1 text-center transition-colors hover:bg-[var(--surface)]/70 disabled:cursor-not-allowed disabled:opacity-45 ${usesFluentUI ? "rounded-[8px]" : "rounded-[10px]"}`}
              title="可选功能：点击上传或拖入图片，用来反推中文提示词；不上传也可以直接输入提示词生成"
            >
              <span className="inline-flex items-center justify-center gap-2 text-[12px] font-medium text-[var(--accent)]">
                <ImageUp className="h-4 w-4" />
                {reverseDragActive ? "松开导入反推图像" : "可选：导入反推图像"}
              </span>
              <span className="text-[10px] font-normal leading-4 text-zinc-500 dark:text-zinc-400">
                {reverseDragActive ? "释放后从图片反推中文提示词" : "不上传也可以直接输入提示词生成"}
              </span>
            </button>
          )}
        </div>
        <div className="mb-2.5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={copyPrompt}
            disabled={!prompt.trim() || promptBusy}
            className={`platform-pill inline-flex min-h-[28px] items-center gap-1 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-[color:var(--accent)]/35 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-zinc-300 ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}
            title="复制当前提示词"
          >
            <Copy className="h-3 w-3" />
            复制
          </button>
          <button
            type="button"
            onClick={clearPrompt}
            disabled={!prompt.trim() || promptBusy}
            className={`platform-pill inline-flex min-h-[28px] items-center gap-1 border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[0.08] dark:text-zinc-300 ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}
            title="清空当前提示词"
          >
            <Trash2 className="h-3 w-3" />
            清空
          </button>
          <span className={`font-mono-token tabular-nums ${isMac ? "rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] dark:bg-white/[0.06]" : ""} text-zinc-400 dark:text-zinc-500`}>{promptLen}</span>
        </div>
        {isMac && (
          <p className="mb-3 text-[12px] leading-6 text-zinc-500 dark:text-zinc-400">
            建议把主体、场景、镜头、材质和光照拆成短句，模板会追加到当前内容末尾。
          </p>
        )}
        <textarea
          ref={promptRef}
          value={prompt}
          placeholder={mode === "edit"
            ? "主体保持不变\n把背景换成夜空，补一圈冷色边缘光，保留原有构图"
            : "主体 / 场景 / 光照 / 镜头 / 风格\n例如：一只橘猫坐在雨夜窗边，电影级侧逆光，50mm，浅景深，写实摄影"}
          style={{ minHeight: promptMinHeight }}
          onChange={(e) => {
            onSetPrompt(e.target.value);
            requestAnimationFrame(resizePrompt);
          }}
          onInput={() => requestAnimationFrame(resizePrompt)}
          onBlur={resizePrompt}
          className={`focus-ring w-full resize-none overflow-hidden border border-black/[0.08] bg-[var(--surface)] text-zinc-900 placeholder:text-zinc-400 dark:border-white/[0.08] dark:text-zinc-100 dark:placeholder:text-zinc-500 ${usesFluentUI ? "min-h-[124px] rounded-[10px] px-3.5 py-3 text-[14px] leading-[1.65]" : isMac ? "min-h-[176px] rounded-[18px] px-4 py-3.5 text-[15px] leading-[1.72]" : "min-h-[124px] rounded-[14px] px-3.5 py-3 text-[14px] leading-[1.65]"}`}
        />
        <div className={`mt-3 ${isMac ? "flex flex-col gap-3" : "flex gap-2.5 items-center justify-between"}`}>
          <div className={`${isMac ? "grid grid-cols-1 gap-2.5" : "flex gap-2.5 items-center"}`}>
            <div className={`relative ${isMac ? "min-w-0" : "shrink-0"}`}>
              <button
                ref={promptPopoverAnchorRef}
                type="button"
                onClick={() => setPromptPopover((v) => !v)}
                title="prompt 模板与历史"
                className={`platform-pill inline-flex items-center justify-center gap-1.5 ${isMac ? "min-h-[38px] w-full px-3 py-2 text-[11px] font-medium" : "px-3 py-1.5 text-[10px]"} transition-colors ${
                  promptPopover
                    ? "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[color:var(--accent)]/20"
                    : "text-zinc-500 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                } ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}
              >
                <ListPlus className="w-3 h-3" /> 模板 / 历史
              </button>
              {promptPopover && (
                <Suspense fallback={null}>
                  <PromptPopover
                    anchorRef={promptPopoverAnchorRef}
                    onClose={() => setPromptPopover(false)}
                    onPick={(text) => {
                      const current = useStudioStore.getState().prompt;
                      onSetPrompt(current ? `${current}\n${text}` : text);
                    }}
                  />
                </Suspense>
              )}
            </div>
          </div>
          <div className={`flex flex-wrap ${isMac ? "items-center justify-between gap-2.5" : "ml-auto items-center justify-end gap-2"}`}>
            <span className={`${isMac ? "ml-auto rounded-full bg-black/[0.03] px-2.5 py-1.5 text-[11px] dark:bg-white/[0.04]" : "text-[10px]"} text-zinc-400 dark:text-zinc-500`}>{submitShortcutLabel}</span>
            <button
              type="button"
              onClick={onOptimizePromptBase}
              disabled={!optimizeReady || promptBusy}
              className={`platform-pill inline-flex min-h-[38px] min-w-[92px] items-center justify-center gap-1.5 ${isMac ? "px-3 py-2 text-[11px] font-medium" : "px-3 py-1.5 text-[10px]"} transition-colors ${
                isOptimizingPrompt
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-zinc-500 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
              } disabled:cursor-not-allowed disabled:opacity-50 ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}
              title="使用基础系统提示词优化当前提示词"
            >
              <Sparkles className={`w-3 h-3 ${isOptimizingPrompt ? "animate-pulse" : ""}`} />
              {isOptimizingPrompt ? "优化中..." : "AI 优化"}
            </button>
          </div>
        </div>
        </div>
        <div className={`mt-3 border border-[color:var(--accent)]/20 bg-[var(--accent-soft)] p-3 ${usesFluentUI ? "rounded-[10px]" : isMac ? "rounded-[16px]" : "rounded-[12px]"}`}>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <label className="text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
              指令改写提示词
            </label>
            <button
              type="button"
              onClick={() => {
                onSetOptimizationGuidance("");
                requestAnimationFrame(resizeOptimizationGuidance);
              }}
              disabled={!optimizationGuidance.trim() || promptBusy}
              className="text-[11px] font-medium text-[var(--accent)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
              title="清空精准修改指令"
            >
              清除
            </button>
          </div>
          <div className="grid gap-2.5">
            <textarea
              ref={optimizationGuidanceRef}
              value={optimizationGuidance}
              placeholder="输入精准修改指令：去掉帽子 / 天上加一只老鹰..."
              rows={2}
              style={{ minHeight: optimizationGuidanceMinHeight }}
              onChange={(e) => {
                onSetOptimizationGuidance(e.target.value);
                requestAnimationFrame(resizeOptimizationGuidance);
              }}
              onInput={() => requestAnimationFrame(resizeOptimizationGuidance)}
              onBlur={resizeOptimizationGuidance}
              className={`focus-ring min-h-[62px] w-full min-w-0 resize-none overflow-hidden border border-[color:var(--accent)]/20 bg-[var(--surface)] py-2 leading-[1.55] text-zinc-900 placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500 ${usesFluentUI ? "rounded-[10px] px-3.5 text-[13px]" : isMac ? "rounded-[14px] px-4 text-[13px]" : "rounded-[12px] px-3.5 text-[12px]"}`}
              title="输入要强制执行的提示词修改指令"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onRewritePrompt}
                disabled={!rewriteReady || promptBusy}
                className={`platform-pill inline-flex min-h-[38px] min-w-[92px] items-center justify-center gap-1.5 ${isMac ? "px-3 py-2 text-[11px] font-medium" : "px-3 py-1.5 text-[10px]"} transition-colors ${
                  isOptimizingPrompt
                    ? "bg-[var(--surface)] text-[var(--accent)]"
                    : "bg-[var(--surface)] text-[var(--accent)] hover:brightness-95"
                } disabled:cursor-not-allowed disabled:opacity-50 ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}
                title="按照指令改写当前提示词"
              >
                <Sparkles className={`w-3 h-3 ${isOptimizingPrompt ? "animate-pulse" : ""}`} />
                {isOptimizingPrompt ? "优化中..." : "精准修改"}
              </button>
            </div>
          </div>
        </div>
        <div className={`mt-3 border-t border-black/[0.06] pt-3 dark:border-white/[0.06] ${isMac ? "space-y-2.5" : "space-y-2"}`}>
          <div className="flex items-center justify-between gap-3">
            <label className="text-[10px] uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
              风格模板
            </label>
            {styleTag ? (
              <button
                type="button"
                onClick={() => onSetStyleTag("")}
                className="text-[11px] text-[var(--accent)] hover:opacity-80"
              >
                清除
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_CHIPS.map((style) => {
              const active = styleTag === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => onSetStyleTag(active ? "" : style.id)}
                  title={style.hint}
                  className={`platform-chip px-2.5 py-1.5 text-xs ring-1 transition-colors ${
                    active
                      ? "active bg-[var(--accent-soft)] text-[var(--accent)] ring-[color:var(--accent)]/20"
                      : "text-zinc-600 dark:text-zinc-400 ring-black/[0.08] dark:ring-white/[0.08] hover:text-zinc-900 dark:hover:text-zinc-200 hover:ring-[color:var(--accent)]/30"
                  } ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}
                >
                  {style.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
