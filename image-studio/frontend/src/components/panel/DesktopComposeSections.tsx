import { type DragEvent, useState } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import type {
  Mode,
  QualityValue,
  RequestPolicy,
  SizeValue,
} from "../../types/domain";
import { QUALITY_TIERS } from "./panelOptions";
import { Section, Seg, SegItem } from "./panelChrome";
import { AspectRatioPicker } from "./AspectRatioPicker";
import {
  RESOLUTION_PRESETS,
  type AspectPreset,
  type ResolutionPreset,
  sizeCapabilityHint,
} from "./sizeCapabilities";

export function DesktopComposeSections({
  activeAspect,
  activeResolution,
  apiMode,
  batchCount,
  clearSources,
  currentImageSavedPath,
  handleAspectSelect,
  handleResolutionSelect,
  imageModelID,
  importSourceImageFile,
  onRemoveSource,
  mode,
  pushToast,
  quality,
  requestPolicy,
  selectSourceImage,
  setField,
  size,
  sources,
  usesFluentUI,
  availableResolutions,
}: {
  activeAspect: AspectPreset;
  activeResolution: ResolutionPreset;
  apiMode: "responses" | "images";
  batchCount: number;
  clearSources: () => void;
  currentImageSavedPath?: string | null;
  handleAspectSelect: (aspect: AspectPreset) => void;
  handleResolutionSelect: (resolution: ResolutionPreset) => void;
  imageModelID: string;
  importSourceImageFile: (file: File) => Promise<void>;
  usesFluentUI: boolean;
  mode: Mode;
  onRemoveSource: (index: number) => void;
  pushToast: (text: string, kind?: "info" | "success" | "error" | "warn", ttl?: number) => void;
  quality: QualityValue;
  requestPolicy: RequestPolicy;
  selectSourceImage: () => void;
  setField: (key: "styleTag" | "quality" | "batchCount" | "size", value: any) => void;
  size: SizeValue;
  sources: Array<{ path: string; name: string }>;
  availableResolutions: ResolutionPreset[];
}) {
  const [sourceFileDragActive, setSourceFileDragActive] = useState(false);

  const hasDraggedFiles = (event: DragEvent<HTMLElement>) => event.dataTransfer.types.includes("Files");
  const importDroppedSourceImage = (files: FileList | null) => {
    const file = Array.from(files ?? []).find((item) => item.type.startsWith("image/"));
    if (!file) {
      pushToast("请拖入 PNG/JPG/WebP 图片", "warn", 2800);
      return;
    }
    void importSourceImageFile(file);
  };

  const sourceDropHandlers = {
    onDragEnter: (event: DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setSourceFileDragActive(true);
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setSourceFileDragActive(true);
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setSourceFileDragActive(false);
      }
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setSourceFileDragActive(false);
      importDroppedSourceImage(event.dataTransfer.files);
    },
  };

  return (
    <>
      <Section label="比例">
        <AspectRatioPicker
          ariaLabel="比例"
          value={activeAspect}
          onChange={handleAspectSelect}
          className={usesFluentUI ? "aspect-picker-fluent" : ""}
        />
      </Section>

      <Section label="分辨率">
        <Seg>
          {RESOLUTION_PRESETS.filter((item) => availableResolutions.includes(item.value)).map((item) => (
            <SegItem
              key={item.value}
              active={activeResolution === item.value}
              onClick={() => handleResolutionSelect(item.value)}
            >
              {item.label}
            </SegItem>
          ))}
        </Seg>
        {sizeCapabilityHint({ apiMode, requestPolicy, imageModelID }) ? (
          <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {sizeCapabilityHint({ apiMode, requestPolicy, imageModelID })}
          </p>
        ) : null}
      </Section>

      <Section label="质量">
        <Seg>
          {QUALITY_TIERS.map((item) => (
            <SegItem
              key={item.value}
              active={quality === item.value}
              onClick={() => setField("quality", item.value as QualityValue)}
            >
              {item.label}
            </SegItem>
          ))}
        </Seg>
      </Section>

      <Section
        label="出图张数"
        trailing={<span className="font-mono-token text-[10px] text-zinc-400">{batchCount}x</span>}
      >
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 4, 6, 8, 9].map((count) => (
            <button
              key={count}
              type="button"
              aria-pressed={batchCount === count}
              onClick={() => setField("batchCount", count)}
              title={`同一提示词发起 ${count} 次请求`}
              className={`windows-compose-batch-option flex items-center justify-center border text-xs font-medium transition-colors ${
                batchCount === count
                  ? "border-[color:var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] ring-2 ring-[color:var(--accent)]/30 shadow-sm"
                  : "border-black/[0.08] text-zinc-600 hover:border-[color:var(--accent)]/30 hover:text-zinc-900 dark:border-white/[0.08] dark:text-zinc-400 dark:hover:text-zinc-200"
              } ${usesFluentUI ? "h-9 rounded-[8px]" : "h-9 rounded-[12px]"}`}
            >
              {count}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
          多张会并行请求,完成后在画板按网格挑图;受上游并发限制约束。
        </p>
      </Section>

      {mode === "edit" ? (
        <Section label={`源图片 / 参考图${sources.length > 0 ? ` · ${sources.length} 张` : ""}`}>
          <div
            {...sourceDropHandlers}
            title="点击添加图片，或把图片拖入此区域"
            className={`flex flex-col gap-1.5 border border-dashed p-2 transition-colors ${
              sourceFileDragActive
                ? "border-[color:var(--accent)] bg-[var(--accent-soft)] shadow-[inset_0_0_0_1px_var(--accent)]"
                : "border-black/[0.08] bg-black/[0.015] dark:border-white/[0.08] dark:bg-white/[0.02]"
            } ${usesFluentUI ? "rounded-[10px]" : "rounded-[16px]"}`}
          >
            {sources.length === 0 && currentImageSavedPath ? (
              <div className={`border border-black/[0.06] bg-[var(--surface)] px-3 py-2 text-xs italic text-zinc-500 dark:border-white/[0.04] dark:text-zinc-500 ${usesFluentUI ? "rounded-[10px]" : "rounded-[14px]"}`}>
                (画板当前图 · 隐式源图)
              </div>
            ) : null}
            <div className={`border border-black/[0.06] bg-[var(--surface)] px-3 py-2 text-xs text-zinc-500 dark:border-white/[0.04] dark:text-zinc-400 ${usesFluentUI ? "rounded-[10px]" : "rounded-[14px]"}`}>
              {sourceFileDragActive
                ? "松开导入图像为参考图"
                : sources.length > 0
                  ? "已添加显式参考图，可继续追加或把图片拖入这里。"
                  : currentImageSavedPath
                    ? "当前画板图会作为隐式源图，也可以拖入图片改用显式参考图。"
                    : "点击添加图片，或把图片拖入这里作为参考图。"}
            </div>
            {sources.map((source, index) => (
              <div key={source.path} className={`flex items-center gap-1 border border-black/[0.06] bg-[var(--surface)] px-2.5 py-2 dark:border-white/[0.06] ${usesFluentUI ? "rounded-[10px]" : "rounded-[14px]"}`}>
                <span className="flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300" title={source.path}>
                  {index + 1}. {source.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveSource(index)}
                  title="移除"
                  className={`-m-1 p-1 text-zinc-400 hover:bg-red-500/10 hover:text-red-400 ${usesFluentUI ? "rounded-[6px]" : "rounded-full"}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <div className="flex gap-1.5">
              <button onClick={selectSourceImage} className={`platform-action-btn flex-1 inline-flex items-center justify-center gap-1 border border-black/[0.08] px-3 py-2 text-xs text-zinc-700 transition-colors hover:border-[color:var(--accent)]/35 hover:text-[var(--accent)] dark:border-white/[0.08] dark:text-zinc-300 ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}>
                <ImagePlus className="w-3.5 h-3.5" /> 添加图片
              </button>
              {sources.length > 0 ? (
                <button onClick={clearSources} className={`platform-action-btn inline-flex items-center gap-1 border border-black/[0.08] px-3 py-2 text-xs text-zinc-500 transition-colors hover:border-red-400/40 hover:text-red-400 dark:border-white/[0.08] ${usesFluentUI ? "rounded-[8px]" : "rounded-full"}`}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        </Section>
      ) : null}
    </>
  );
}
