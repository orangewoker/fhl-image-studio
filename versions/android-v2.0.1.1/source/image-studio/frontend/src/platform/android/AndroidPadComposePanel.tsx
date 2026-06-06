import { useState } from "react";
import {
  CheckCircle2, ClipboardCopy, ImagePlus, ListPlus, Sparkles, Trash2,
} from "lucide-react";
import { useStudioStore } from "../../state/studioStore";
import { copyText } from "../../lib/fhlAPI";
import { QUALITY_TIERS, STYLE_CHIPS } from "../../components/panel/panelOptions";
import type { Mode } from "../../types/domain";
import { AndroidModeSwitch } from "./AndroidModeSwitch";
import { usePlatform } from "../context";
import { vibrateForPlatform } from "./bridge";
import { AndroidAdvancedSection } from "./AndroidAdvancedSection";
import { AndroidPadParameterSection } from "./AndroidPadParameterSection";
import { AndroidPadSourceSection } from "./AndroidPadSourceSection";
import { AndroidPromptTemplateModal } from "./AndroidPromptTemplateModal";
import {
  availableResolutionPresets,
  deriveAspectPreset,
  deriveResolutionPreset,
} from "../../components/panel/sizeCapabilities";
import {
  buildAndroidAspectSizeSelection,
  buildAndroidResolutionSizeSelection,
} from "./parameters/androidSizeSelection";

export function AndroidPadComposePanel() {
  const {
    apiKey, mode, prompt, negativePrompt, size, quality, seed, styleTag, outputFormat,
    batchCount, sources, currentImage, isRunning, isOptimizingPrompt, apiMode, requestPolicy, baseURL, imageModelID,
    profiles, setField, selectSourceImage, removeSource, clearSources,
    openUpstreamConfig, submit, cancel, optimizePrompt, pushToast,
  } = useStudioStore();
  const [templateOpen, setTemplateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const promptLen = prompt.length;
  const { androidOrientation, androidWidthClass } = usePlatform();
  const isMediumPad = androidWidthClass === "medium";
  const isLandscapePad = androidOrientation === "landscape";
  const needsUpstreamSetup = !apiKey.trim() || !baseURL.trim();
  const hasUsableResponsesProfile = profiles.some(
    (p) => p.apiMode === "responses" && p.baseURL.trim(),
  );
  const optimizeReady = !!(
    prompt.trim() && (hasUsableResponsesProfile || (apiKey.trim() && baseURL.trim()))
  );
  const activeStyleLabel = STYLE_CHIPS.find((item) => item.id === styleTag)?.label ?? "默认风格";
  const activeAspect = deriveAspectPreset(size);
  const activeResolution = deriveResolutionPreset(size);
  const availableResolutions = availableResolutionPresets({ apiMode, requestPolicy, imageModelID });
  const activeAspectLabel = activeAspect === "auto" ? "Auto" : activeAspect;
  const activeResolutionLabel = activeResolution === "auto" ? "自动" : activeResolution.toUpperCase();
  const activeQualityLabel = QUALITY_TIERS.find((item) => item.value === quality)?.label ?? quality;
  const editSourceLabel = sources.length > 0 ? `${sources.length} 张已添加` : currentImage?.savedPath ? "使用当前画板" : "未添加";

  const handleAspectSelect = (aspect: typeof activeAspect) => {
    setField("size", buildAndroidAspectSizeSelection(
      aspect,
      activeResolution,
      { apiMode, requestPolicy, imageModelID },
    ));
  };

  const handleResolutionSelect = (resolution: typeof activeResolution) => {
    setField("size", buildAndroidResolutionSizeSelection(
      activeAspect,
      resolution,
      { apiMode, requestPolicy, imageModelID },
    ));
  };

  const handleModeChange = (next: Mode) => {
    vibrateForPlatform(12);
    setField("mode", next);
  };

  const handleSubmit = () => {
    vibrateForPlatform(15);
    submit();
  };

  const handleOptimize = () => {
    vibrateForPlatform(10);
    optimizePrompt();
  };

  const handleCopyPrompt = async () => {
    if (!prompt.trim()) return;
    vibrateForPlatform(6);
    try {
      await copyText(prompt);
      pushToast("已复制提示词", "success");
    } catch (error: any) {
      pushToast(`复制失败:${error?.message ?? error}`, "error");
    }
  };

  const handleClearPrompt = () => {
    if (!prompt) return;
    vibrateForPlatform(6);
    setField("prompt", "");
    pushToast("已清空", "success");
  };

  const handleSelectSource = () => {
    vibrateForPlatform(8);
    selectSourceImage();
  };

  const submitButton = needsUpstreamSetup ? (
    <button
      type="button"
      onClick={() => { vibrateForPlatform(10); openUpstreamConfig("app"); }}
      className="liquid-primary-button h-[52px] w-full text-[15px] font-semibold text-white"
    >
      配置上游
    </button>
  ) : isRunning ? (
    <button
      type="button"
      onClick={() => { vibrateForPlatform(10); cancel(); }}
      className="h-[52px] w-full rounded-[20px] border border-red-500/30 bg-red-500/10 text-[15px] font-medium text-red-500 transition-colors hover:bg-red-500/16"
    >
      取消生成
    </button>
  ) : (
    <button
      type="button"
      onClick={handleSubmit}
      disabled={!apiKey || !prompt.trim()}
      className="liquid-primary-button h-[52px] w-full text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-800"
    >
      {mode === "edit" ? "开始编辑" : "开始生成"}
    </button>
  );

  return (
    <div
      className="control-panel android-pad-compose flex w-full flex-col gap-4 overflow-y-auto border-r border-[var(--border)] bg-[var(--bg)] px-4 py-4"
      data-mode={mode}
      data-orientation={androidOrientation}
      style={{ paddingLeft: "calc(var(--android-safe-left-value, 0px) + 16px)", paddingRight: "calc(var(--android-safe-right-value, 0px) + 16px)" }}
    >
      <section className="platform-card android-pad-overview p-4">
        <div className="android-pad-overview-row">
          <div className="android-pad-hero-copy">
            <div className="android-phone-kicker">{mode === "edit" ? "图生图工作流" : "文生图工作流"}</div>
            <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-zinc-950 dark:text-zinc-50">
              图像工作区
            </h2>
            <p className="mt-1 text-[12px] leading-6 text-zinc-500 dark:text-zinc-300">
              {isLandscapePad
                ? "横屏下聚焦参数与提示词，画布从左侧导航进入。"
                : isMediumPad
                ? "中等宽度下保留 rail 导航，把主要操作压在单列主区域里。"
                : "参数在左，画布在中，大屏下保持一眼可扫的多窗格结构。"}
            </p>
          </div>
          <div className="android-pad-mode-switch">
            <AndroidModeSwitch mode={mode} onChange={handleModeChange} variant="pad" />
          </div>
        </div>
        <div className="android-inline-metrics mt-3">
          <span>{mode === "edit" ? "图生图" : "文生图"}</span>
          <span>{activeQualityLabel}</span>
          <span>{activeAspectLabel}</span>
          <span>{batchCount} 张</span>
          {!needsUpstreamSetup ? <span>上游已连接</span> : <span>待配置上游</span>}
        </div>
      </section>

      <div className="android-pad-compose-grid">
        <section className="platform-card android-pad-prompt p-5">
        <div className="android-pad-section-head">
          <label className="android-phone-kicker">{mode === "edit" ? "修改要求" : "提示词"}</label>
          <div className="android-prompt-head-actions">
            <div className="android-prompt-quick-actions">
              <button
                type="button"
                className="android-prompt-mini-action"
                disabled={!prompt.trim()}
                onClick={handleCopyPrompt}
                title="复制提示词"
              >
                <ClipboardCopy className="h-3 w-3" />
                <span>复制</span>
              </button>
              <button
                type="button"
                className="android-prompt-mini-action danger"
                disabled={!prompt}
                onClick={handleClearPrompt}
                title="清空提示词"
              >
                <Trash2 className="h-3 w-3" />
                <span>清空</span>
              </button>
            </div>
            <span className="font-mono-token text-[11px] text-zinc-400 dark:text-zinc-500">{promptLen}</span>
          </div>
        </div>
          <div className="android-pad-prompt-input-shell mt-3">
            <textarea
              value={prompt}
              placeholder={mode === "edit"
                ? "描述如何修改源图，例如：把背景换成夜景、保留主体姿态"
                : "描述你想生成的画面内容、光线、构图、风格、镜头感"}
              onChange={(e) => setField("prompt", e.target.value)}
              className="focus-ring android-pad-prompt-textarea min-h-[170px] w-full resize-none border border-black/[0.08] bg-[var(--surface)] px-4 py-3 text-[15px] leading-7 text-zinc-900 placeholder:text-zinc-400 dark:border-white/[0.08] dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <div className="android-pad-action-row mt-3">
            <div className="relative android-pad-action-slot">
              <button
                type="button"
                onClick={() => { vibrateForPlatform(8); setTemplateOpen(true); }}
                className={`platform-pill inline-flex min-h-[40px] items-center gap-1.5 px-3 text-[12px] ${
                  templateOpen
                    ? "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[color:var(--accent)]/20"
                    : "text-zinc-500 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                }`}
              >
                <ListPlus className="h-3.5 w-3.5" /> 模板
              </button>
            </div>
            <button
              type="button"
              onClick={handleOptimize}
              disabled={!optimizeReady || isOptimizingPrompt}
              className={`platform-pill inline-flex min-h-[40px] items-center gap-1.5 px-3 text-[12px] ${
                isOptimizingPrompt
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-zinc-500 hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Sparkles className={`h-3.5 w-3.5 ${isOptimizingPrompt ? "animate-pulse" : ""}`} />
              {isOptimizingPrompt ? "优化中..." : "AI 优化"}
            </button>
          </div>
        </section>

        <div className="android-pad-side-stack">
          <AndroidPadParameterSection
            activeAspect={activeAspect}
            activeAspectLabel={activeAspectLabel}
            activeResolution={activeResolution}
            activeResolutionLabel={activeResolutionLabel}
            activeQualityLabel={activeQualityLabel}
            activeStyleLabel={activeStyleLabel}
            availableResolutions={availableResolutions}
            apiMode={apiMode}
            batchCount={batchCount}
            handleAspectSelect={handleAspectSelect}
            handleResolutionSelect={handleResolutionSelect}
            imageModelID={imageModelID}
            isMediumPad={isMediumPad}
            needsUpstreamSetup={needsUpstreamSetup}
            onOpenUpstream={() => { vibrateForPlatform(8); openUpstreamConfig("app"); }}
            quality={quality}
            requestPolicy={requestPolicy}
            setField={setField as any}
            styleTag={styleTag}
          />

          <div className="android-pad-right-stack">
            {mode === "edit" ? (
              <AndroidPadSourceSection
                clearSources={clearSources}
                currentImage={currentImage}
                editSourceLabel={editSourceLabel}
                onSelectSource={handleSelectSource}
                removeSource={removeSource}
                sources={sources}
              />
            ) : (
              <section className="platform-card android-pad-source-placeholder">
                <ImagePlus className="h-4 w-4" />
                <span>
                  <span className="android-phone-kicker">参考图</span>
                  <strong>无需参考图</strong>
                </span>
                <CheckCircle2 className="h-4 w-4" />
              </section>
            )}

            <AndroidAdvancedSection
              advancedOpen={advancedOpen}
              negativePrompt={negativePrompt}
              outputFormat={outputFormat}
              seed={seed}
              setAdvancedOpen={setAdvancedOpen}
              setField={setField as any}
              surface="pad"
            />

            <div className="android-pad-side-cta">
              {submitButton}
            </div>
          </div>
        </div>
      </div>

      <div className="android-pad-cta" style={{ paddingLeft: "calc(var(--android-safe-left-value, 0px) + 16px)", paddingRight: "calc(var(--android-safe-right-value, 0px) + 16px)" }}>
        {submitButton}
      </div>
      <AndroidPromptTemplateModal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onPick={(text) => {
          const current = useStudioStore.getState().prompt;
          setField("prompt", current ? `${current}\n${text}` : text);
        }}
      />
    </div>
  );
}
