import { create } from "zustand";
import {
  EventsOn,
  EventsOff,
  Generate as wailsGenerate,
  Edit as wailsEdit,
  OptimizePrompt as wailsOptimizePrompt,
  Cancel as wailsCancel,
  ImportImageFromB64,
  ReadImageAsBase64,
  GetOutputDir,
  DeleteStoredAPIKey,
  GetStoredAPIKey,
  SetStoredAPIKey,
  RegisterMediaAsset,
  RegisterImportedImageAsset,
  SetOutputDir,
  detectHostKind,
  probeCurrentUpstream,
  setKernelRuntimeMode,
} from "../platform/runtime/host";
import {
  listBrowserJobGroups,
  submitBrowserJobGroup,
  subscribeToBrowserJob,
} from "../platform/runtime/browserJobClient";
import {
  canUseAndroidJobs,
  listAndroidJobGroups,
  submitAndroidJobGroup,
  subscribeToAndroidJob,
} from "../platform/runtime/androidJobClient";
import type { backend } from "../../wailsjs/go/models";
import {
  APIMode,
  HistoryItem,
  JobGroupSnapshot,
  KernelRuntimeMode,
  Mode,
  OutputFormatValue,
  Preset,
  ProgressInfo,
  QualityValue,
  RequestPolicy,
  SizeValue,
  SourceImage,
  ThemeMode,
  Toast,
  UpstreamProfile,
  Workspace,
} from "../types/domain";
import {
  clearLegacyAPIKeys,
  loadLegacyModeAPIKey,
  loadLegacySharedAPIKey,
  loadTrustedOutputRoots,
  persistHistoryItem,
  persistHistoryItems,
  rememberTrustedOutputRoot,
  loadAllHistory,
  loadHistoryPage,
} from "../lib/storage";
import { purgeForeignAPIKeyStorageKeys, storageKey } from "../lib/storageNamespace.ts";
import {
  cleanBaseURL,
} from "../lib/security";
import { normalizeAPIKeyInput, validateAPIKeyForHeader } from "../lib/apiKey";
import { loadProxyConfig, normalizeProxyMode, persistProxyConfig } from "../lib/proxy";
import { syncCLIConfigQuietly, type CLIConfigSyncInput } from "../lib/cliConfigSync";
import {
  duplicateProfile as cloneProfile,
  FHL_BASE_URL,
  FHL_IMAGE_MODEL_ID,
  FHL_PROFILE_ID,
  FHL_TEXT_MODEL_ID,
  genProfileId,
  keyringUserFor,
  makeFHLResponsesProfile,
  pickActiveProfile,
} from "../lib/profiles";
import { loadLocalFHLConfig } from "../lib/localFHLConfig";
import { isMac, readRuntimePlatformState } from "../platform";
import { dispatchFullscreenResize, setNativeFullscreen } from "../platform/nativeFullscreen";
import {
  activeRuntimePatch,
  apiModeLabel,
  normalizeBatchCount,
  normalizeConcurrencyLimit,
  patchWorkspaceRuntime,
  resetWorkspaceSourcesAfterServiceRestart,
  workspaceRuntimeFromState,
  workspaceRunningCount,
  type APIModeValue,
  type RunningJobMeta,
  type WorkspacePatch,
} from "./workspaceRuntime";
import { normalizeSizeSelection } from "../components/panel/sizeCapabilities";
import { buildMacWorkspacePreview, readPreviewScenario } from "../app/dev/previewData";
import {
  applyTheme,
  augmentPromptWithAnnotations,
  buildMaskPNGDataURL,
  clearLegacyModeLocalStorage,
  genId,
  imageDims,
  loadModeConfig,
  loadStoredActiveProfileId,
  loadStoredProfiles,
  MAX_HISTORY_ITEMS,
  persistActiveProfileId,
  persistProfiles,
  persistWorkspaceSession,
  persistTrimmedHistory,
  loadWorkspaceSession,
  currentWorkspaceServiceInstanceId,
  registerTrustedOutputRoots,
  stripDataURLPrefix,
  tempDataURLFromB64,
  trimHistory,
} from "./studioStore.shared";
import type { ModeConfig, PromptOptimizeRequest, Stroke, StudioState, UndoEntry } from "./studioStore.types";
import {
  historyItemsByIds,
  cryptoIDFallback,
  ensureFullHistoryItem as ensureFullHistoryItemRuntime,
  materializeHistoryItem as materializeHistoryItemRuntime,
  saveActiveWorkspaceSnapshot,
  STYLE_SUFFIXES,
  tryNotify,
  withMediaAssetRef,
} from "./studioStore.runtime";
import { createMediaActions } from "./studioStore.media";
import { createProfileActions } from "./studioStore.profiles";
import { createWorkspaceActions } from "./studioStore.workspaces";
import { createImageActions } from "./studioStore.images";
import {
  mergeWorkspaceJobGroup,
  replaceWorkspaceJobGroups,
  runningJobIdsFromGroup,
  runtimeStateFromJobGroups,
} from "./browserJobs";
import { sourceImagesForHistory } from "./historySourceImages";
import {
  currentImageIdForWorkspaceSnapshot,
  removeStreamPreview,
  restoreCurrentImageAfterPreviewError,
  streamPreviewItemFromWorkspace,
  streamPreviewStatePatch,
  type StreamPreviewPayload,
} from "./studioStore.streamPreview";

type RuntimeGenerateOptions = backend.GenerateOptions & {
  sourceImages?: SourceImage[];
};

const browserJobSubscriptions = new Map<string, () => void>();
const ENABLE_LEGACY_PROFILE_MIGRATION = false;
const STAR_PROMPTED_KEY = storageKey("gptcodex.starPrompted");
const KERNEL_RUNTIME_MODE_KEY = storageKey("gptcodex.kernelRuntimeMode");
const OUTPUT_FORMAT_KEY = storageKey("gptcodex.outputFormat");
const PROMPT_HISTORY_KEY = storageKey("gptcodex.promptHistory");
const PRESETS_KEY = storageKey("gptcodex.presets");
const THEME_KEY = storageKey("gptcodex.theme");
const FONT_SCALE_KEY = storageKey("gptcodex.fontScale");
const OUTPUT_DIR_KEY = storageKey("gptcodex.outputDir");
const INITIAL_HISTORY_LOAD = 48;
const HISTORY_MEDIA_HYDRATE_CONCURRENCY = 4;

let deferredHistoryLoadPromise: Promise<void> | null = null;

function persistWorkspaceSessionFromState(state: StudioState) {
  const workspaces = saveActiveWorkspaceSnapshot(state).map((workspace) => ({
    ...workspace,
    lastPayload: null,
  }));
  persistWorkspaceSession(state.activeWorkspaceId, workspaces);
}

function needsHistoryPreviewHydration(item: HistoryItem): boolean {
  return !!item.savedPath
    && !item.savedPath.startsWith("memory://")
    && !item.previewBlob
    && !item.imageB64
    && !item.previewUrl;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  };
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function mergeHistoryMediaRef(current: HistoryItem | null, nextById: Map<string, HistoryItem>): HistoryItem | null {
  if (!current) return current;
  const next = nextById.get(current.id);
  return next ? withMediaAssetRef(current, next) : current;
}

async function hydrateHistoryPreviewRefs(items: HistoryItem[]): Promise<HistoryItem[]> {
  return mapWithConcurrency(items, HISTORY_MEDIA_HYDRATE_CONCURRENCY, async (item) => {
    if (!needsHistoryPreviewHydration(item)) return item;
    try {
      const ref = item.thumbPath
        ? await RegisterMediaAsset(item.savedPath!, item.thumbPath)
        : await RegisterImportedImageAsset(item.savedPath!);
      return withMediaAssetRef(item, ref);
    } catch {
      return item;
    }
  });
}

async function backfillHistoryPreviewRefs(items: HistoryItem[]): Promise<void> {
  const hydrated = await hydrateHistoryPreviewRefs(items);
  const changed = hydrated.filter((item, index) => item !== items[index]);
  if (changed.length === 0) return;
  const changedById = new Map(changed.map((item) => [item.id, item]));
  useStudioStore.setState((state) => ({
    history: state.history.map((item) => changedById.get(item.id) ?? item),
    batchResults: state.batchResults.map((item) => changedById.get(item.id) ?? item),
    currentImage: mergeHistoryMediaRef(state.currentImage, changedById),
    compareB: mergeHistoryMediaRef(state.compareB, changedById),
    resultDetail: mergeHistoryMediaRef(state.resultDetail, changedById),
  }));
  await persistHistoryItems(changed).catch(() => undefined);
}

async function writeBase64ToTempFile(b64: string, _name: string): Promise<string> {
  // Backend doesn't currently expose a "write temp file from b64" binding,
  // but reuseAsSource needs a path for edit mode. Workaround: use SaveImageAs
  // with a fixed name into the user config dir would prompt the user. Instead,
  // we re-purpose the savedPath field that comes back with every result — it's
  // already on disk under UserConfigDir/image-studio/images. So callers should
  // use item.savedPath; this helper exists for parity and is currently unused.
  void b64;
  return "";
}

function isBrowserTaskProxyMode(): boolean {
  return detectHostKind() === "browser";
}

function isAndroidTaskProxyMode(): boolean {
  return false;
}

function isBackgroundTaskProxyMode(): boolean {
  return isBrowserTaskProxyMode() || isAndroidTaskProxyMode();
}

function shouldUseBackgroundTaskProxyForSubmit(apiMode: APIMode): boolean {
  return isBrowserTaskProxyMode() || (isAndroidTaskProxyMode() && apiMode !== "images");
}

function effectiveAPIModeForSubmit(_mode: Mode, apiMode: APIMode): APIMode {
  return apiMode;
}

function browserHistoryId(jobId: string): string {
  return `job:${jobId}`;
}

function pathLeaf(filePath: string): string {
  const normalized = String(filePath || "").trim().replace(/[\\/]+$/, "");
  if (!normalized) return "image.png";
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] || "image.png";
}

function imageMimeFromName(name: string): string {
  const lower = String(name || "").toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/png";
}

function shouldNormalizeSourceForCLIFallback(name: string, imageB64: string): boolean {
  const trimmed = imageB64.trimStart();
  return /\.webp$/i.test(name) || trimmed.startsWith("data:image/webp");
}

function pngNameForCLIInput(name: string): string {
  const safe = String(name || "image.png").replace(/\.[^.\\/]+$/, "");
  return `${safe || "image"}.png`;
}

async function transcodeSourceToPNGBase64(imageB64: string, name: string): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") return imageB64;
  const trimmed = imageB64.trim();
  const src = trimmed.startsWith("data:")
    ? trimmed
    : `data:${imageMimeFromName(name)};base64,${trimmed}`;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error("source image decode failed"));
    next.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, img.naturalWidth || img.width || 1);
  canvas.height = Math.max(1, img.naturalHeight || img.height || 1);
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageB64;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}

function sourceImagesFromPaths(paths: string[] | undefined): SourceImage[] {
  return (paths ?? [])
    .map((filePath) => String(filePath || "").trim())
    .filter(Boolean)
    .map((filePath) => ({
      path: filePath,
      name: pathLeaf(filePath),
      size: 0,
    }));
}

function isVirtualImagePath(filePath: string | null | undefined): boolean {
  return String(filePath || "").trim().startsWith("memory://image/");
}

async function materializeEditSourcesForBrowserProxy(sources: SourceImage[]): Promise<SourceImage[]> {
  let changed = false;
  const nextSources = await Promise.all(sources.map(async (source) => {
    const rawPath = String(source.path || "").trim();
    if (!isVirtualImagePath(rawPath)) return source;
    const imageB64 = String(source.imageB64 || "").trim() || await ReadImageAsBase64(rawPath).catch(() => "");
    if (!imageB64) return source;
    const sourceName = source.name || pathLeaf(rawPath);
    const needsPNG = shouldNormalizeSourceForCLIFallback(sourceName, imageB64);
    const cliB64 = needsPNG
      ? await transcodeSourceToPNGBase64(imageB64, sourceName).catch(() => imageB64)
      : imageB64;
    const imported = await ImportImageFromB64(cliB64, needsPNG ? pngNameForCLIInput(sourceName) : sourceName).catch(() => null);
    const nextPath = String(imported?.path || "").trim();
    if (!nextPath || isVirtualImagePath(nextPath)) return source;
    changed = true;
    return {
      ...source,
      name: pathLeaf(nextPath),
      path: nextPath,
      previewUrl: imported?.previewUrl || source.previewUrl,
      imageB64: imported?.previewUrl ? undefined : (needsPNG ? cliB64 : (source.imageB64 || imageB64)),
    };
  }));
  return changed ? nextSources : sources;
}

function browserRuntimePatchFromGroups(groups: JobGroupSnapshot[]): WorkspacePatch {
  const runtime = runtimeStateFromJobGroups(groups);
  return {
    runningJobs: runtime.runningJobs,
    jobsTotal: runtime.jobsTotal,
    jobsCompleted: runtime.jobsCompleted,
    progress: runtime.progress,
    streamPreview: null,
    streamPreviews: {},
    lastLogLine: runtime.lastLogLine,
    errorMessage: runtime.errorMessage,
    errorRawPath: runtime.errorRawPath,
  };
}

function cliConfigFromState(state: StudioState, overrides: Partial<CLIConfigSyncInput> = {}): CLIConfigSyncInput {
  return {
    baseURL: state.baseURL,
    apiMode: state.apiMode,
    requestPolicy: state.requestPolicy,
    imagesNewAPICompat: state.apiMode === "images" && state.imagesNewAPICompat === true,
    textModelID: state.textModelID,
    imageModelID: state.imageModelID,
    outputFormat: state.outputFormat,
    quality: state.quality,
    size: state.size,
    partialImages: 1,
    ...overrides,
  };
}

function buildRunningJobMetaFromBrowserGroups(
  groupsByWorkspace: Record<string, JobGroupSnapshot[]>,
): Record<string, RunningJobMeta> {
  const out: Record<string, RunningJobMeta> = {};
  for (const groups of Object.values(groupsByWorkspace)) {
    for (const group of groups) {
      for (const jobId of runningJobIdsFromGroup(group)) {
        out[jobId] = {
          workspaceId: group.workspaceId,
          apiMode: group.apiMode === "images" ? "images" : "responses",
        };
      }
    }
  }
  return out;
}

async function buildHistoryItemFromBrowserSlot(
  group: JobGroupSnapshot,
  slot: JobGroupSnapshot["slots"][number],
  existing: HistoryItem | null,
): Promise<HistoryItem | null> {
  const savedPath = String(slot.savedPath || existing?.savedPath || "").trim();
  if (slot.status !== "succeeded" || !savedPath) return null;
  const slotThumbPath = String(slot.thumbPath || existing?.thumbPath || "").trim();
  const slotPreviewUrl = String(slot.previewUrl || existing?.previewUrl || "").trim();
  const mediaRef = !slotPreviewUrl
    ? await (slotThumbPath
      ? RegisterMediaAsset(savedPath, slotThumbPath)
      : RegisterImportedImageAsset(savedPath)
    ).catch(() => null)
    : null;
  const previewUrl = slotPreviewUrl || mediaRef?.previewUrl || "";
  const imageB64 = previewUrl ? "" : (existing?.imageB64 || await ReadImageAsBase64(savedPath).catch(() => ""));
  if (!previewUrl && !imageB64 && !mediaRef?.imageId && !mediaRef?.fullUrl) return null;
  const seedBase = Number.isFinite(Number(group.seed)) ? Number(group.seed) : 0;
  return {
    ...existing,
    id: browserHistoryId(slot.jobId),
    prompt: group.prompt,
    revisedPrompt: slot.revisedPrompt || existing?.revisedPrompt,
    mode: group.mode,
    size: group.size,
    quality: group.quality,
    outputFormat: group.outputFormat,
    createdAt: slot.finishedAt ?? slot.updatedAt ?? group.createdAt,
    seed: seedBase > 0 ? seedBase + slot.batchIndex : undefined,
    negativePrompt: group.negativePrompt || undefined,
    styleTag: group.styleTag || undefined,
    batchIndex: slot.batchIndex,
    elapsedSec: Number.isFinite(Number(slot.elapsedSec)) ? Number(slot.elapsedSec) : existing?.elapsedSec,
    sourceImages: group.mode === "edit" ? sourceImagesFromPaths(group.sourceImagePaths) : undefined,
    parentId: group.mode === "edit" ? group.sourceImagePaths?.[0] : undefined,
    savedPath,
    imageId: mediaRef?.imageId || existing?.imageId,
    thumbPath: mediaRef?.thumbPath || slotThumbPath || existing?.thumbPath,
    previewUrl: previewUrl || undefined,
    fullUrl: mediaRef?.fullUrl || existing?.fullUrl,
    previewWidth: Number.isFinite(Number(slot.previewWidth))
      ? Number(slot.previewWidth)
      : mediaRef?.previewWidth || existing?.previewWidth,
    previewHeight: Number.isFinite(Number(slot.previewHeight))
      ? Number(slot.previewHeight)
      : mediaRef?.previewHeight || existing?.previewHeight,
    rawPath: String(slot.rawPath || existing?.rawPath || ""),
    imageB64: imageB64 || undefined,
    imageBlob: null,
    previewBlob: null,
    previewOnly: true,
  };
}

async function hydrateHistoryFromBrowserGroups(
  history: HistoryItem[],
  groupsByWorkspace: Record<string, JobGroupSnapshot[]>,
) {
  const byId = new Map(history.map((item) => [item.id, item]));
  let dirty = false;
  const groups = Object.values(groupsByWorkspace)
    .flat()
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const group of groups) {
    for (const slot of [...group.slots].sort((a, b) => a.batchIndex - b.batchIndex)) {
      if (slot.status !== "succeeded") continue;
      const nextItem = await buildHistoryItemFromBrowserSlot(
        group,
        slot,
        byId.get(browserHistoryId(slot.jobId)) ?? null,
      );
      if (!nextItem) continue;
      const previous = byId.get(nextItem.id);
      if (
        previous
        && previous.savedPath === nextItem.savedPath
        && previous.rawPath === nextItem.rawPath
        && previous.thumbPath === nextItem.thumbPath
        && previous.previewUrl === nextItem.previewUrl
        && previous.previewWidth === nextItem.previewWidth
        && previous.previewHeight === nextItem.previewHeight
        && previous.revisedPrompt === nextItem.revisedPrompt
        && previous.imageB64 === nextItem.imageB64
      ) {
        continue;
      }
      byId.set(nextItem.id, nextItem);
      dirty = true;
      await persistHistoryItem(nextItem).catch(() => undefined);
    }
  }
  const nextHistory = trimHistory(
    Array.from(byId.values()).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
  );
  if (dirty) persistTrimmedHistory(nextHistory);
  return { history: nextHistory, dirty };
}

function applyBrowserJobGroupToStore(group: JobGroupSnapshot) {
  useStudioStore.setState((state) => {
    const jobGroupsByWorkspace = mergeWorkspaceJobGroup(state.jobGroupsByWorkspace, group);
    const runtimePatch = browserRuntimePatchFromGroups(jobGroupsByWorkspace[group.workspaceId] ?? []);
    const runningJobMeta = buildRunningJobMetaFromBrowserGroups(jobGroupsByWorkspace);
    return {
      jobGroupsByWorkspace,
      runningJobMeta,
      workspaces: patchWorkspaceRuntime(state.workspaces, group.workspaceId, runtimePatch),
      ...(state.activeWorkspaceId === group.workspaceId ? activeRuntimePatch(runtimePatch) : {}),
    } as Partial<StudioState>;
  });
}

function clearBrowserJobSubscription(jobId: string) {
  const off = browserJobSubscriptions.get(jobId);
  if (!off) return;
  try { off(); } catch {}
  browserJobSubscriptions.delete(jobId);
}

async function syncHistoryItemFromBrowserJobSlot(
  group: JobGroupSnapshot,
  slot: JobGroupSnapshot["slots"][number],
  options: {
    updateWorkspaceSelection: boolean;
  },
) {
  const store = useStudioStore;
  const existing = store.getState().history.find((item) => item.id === browserHistoryId(slot.jobId)) ?? null;
  const historyItem = await buildHistoryItemFromBrowserSlot(group, slot, existing);
  if (!historyItem) return;
  const activeItem: HistoryItem = {
    ...historyItem,
    previewOnly: true,
  };
  store.setState((state) => {
    const nextHistory = trimHistory([
      historyItem,
      ...state.history.filter((item) => item.id !== historyItem.id),
    ]);
    const workspace = state.workspaces.find((entry) => entry.id === group.workspaceId);
    const batchIds = workspace?.batchResultIds ?? [];
    const nextBatchIds = batchIds.includes(historyItem.id)
      ? batchIds
      : [...batchIds, historyItem.id];
    const batchResults = state.activeWorkspaceId === group.workspaceId
      ? [...state.batchResults.filter((item) => item.id !== historyItem.id), historyItem]
        .sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0))
      : state.batchResults;
    const workspacePatch: WorkspacePatch = options.updateWorkspaceSelection
      ? {
          currentImageId: historyItem.id,
          batchResultIds: nextBatchIds,
          resultGridOpen: group.batchCount > 1,
        }
      : {};
    return {
      history: nextHistory,
      batchResults,
      workspaces: patchWorkspaceRuntime(state.workspaces, group.workspaceId, workspacePatch),
      ...(options.updateWorkspaceSelection && state.activeWorkspaceId === group.workspaceId
        ? {
            currentImage: group.batchCount > 1 ? historyItem : activeItem,
            resultGridOpen: group.batchCount > 1,
            maskDataURL: null,
            annotations: [],
            tool: "pan",
          }
        : {}),
    } as Partial<StudioState>;
  });
  await persistHistoryItem(historyItem).catch(() => undefined);
  persistTrimmedHistory(useStudioStore.getState().history);
  const state = useStudioStore.getState();
  if (state.apiKey.trim()) {
    syncCLIConfigQuietly(cliConfigFromState(state, { apiKey: state.apiKey.trim() }));
  }
}

function ensureBrowserJobSubscription(jobId: string) {
  if (!jobId || browserJobSubscriptions.has(jobId)) return;
  const subscribe = isAndroidTaskProxyMode() ? subscribeToAndroidJob : subscribeToBrowserJob;
  const off = subscribe(jobId, (event) => {
    applyBrowserJobGroupToStore(event.group);
    if (event.type === "terminal" && event.slot.status === "succeeded") {
      void syncHistoryItemFromBrowserJobSlot(event.group, event.slot, {
        updateWorkspaceSelection: true,
      });
      clearBrowserJobSubscription(jobId);
      return;
    }
    if (event.type === "cancelled" || event.type === "error" || event.type === "terminal") {
      clearBrowserJobSubscription(jobId);
    }
  }, () => {
    clearBrowserJobSubscription(jobId);
  });
  browserJobSubscriptions.set(jobId, off);
}

function syncBrowserJobSubscriptions(groupsByWorkspace: Record<string, JobGroupSnapshot[]>) {
  const liveIds = new Set<string>();
  for (const groups of Object.values(groupsByWorkspace)) {
    for (const group of groups) {
      for (const jobId of runningJobIdsFromGroup(group)) {
        liveIds.add(jobId);
        ensureBrowserJobSubscription(jobId);
      }
    }
  }
  for (const jobId of Array.from(browserJobSubscriptions.keys())) {
    if (!liveIds.has(jobId)) clearBrowserJobSubscription(jobId);
  }
}

const mediaActions = createMediaActions({
  getState: () => useStudioStore.getState(),
  setState: (patch) => {
    if (typeof patch === "function") {
      useStudioStore.setState((state) => patch(state));
      return;
    }
    useStudioStore.setState(patch);
  },
});

const profileActions = createProfileActions({
  getState: () => useStudioStore.getState(),
  setState: (patch) => {
    if (typeof patch === "function") {
      useStudioStore.setState((state) => patch(state));
      return;
    }
    useStudioStore.setState(patch);
  },
});

const workspaceActions = createWorkspaceActions({
  getState: () => useStudioStore.getState(),
  setState: (patch) => {
    if (typeof patch === "function") {
      useStudioStore.setState((state) => patch(state));
      return;
    }
    useStudioStore.setState(patch);
  },
});

const imageActions = createImageActions({
  getState: () => useStudioStore.getState(),
  setState: (patch) => {
    if (typeof patch === "function") {
      useStudioStore.setState((state) => patch(state));
      return;
    }
    useStudioStore.setState(patch);
  },
});

export const useStudioStore = create<StudioState>((set, get) => ({
  apiKey: "",
  mode: "generate",
  prompt: "",
  negativePrompt: "",
  size: "1024x1024",
  quality: "medium",
  outputFormat: "png",
  seed: 0,
  kernelRuntimeMode: "auto",
  baseURL: "",
  textModelID: "",
  imageModelID: "",
  proxyMode: "system",
  proxyURL: "",
  apiMode: "responses",
  requestPolicy: "openai",
  imagesNewAPICompat: false,
  noPromptRevision: true,
  profiles: [],
  activeProfileId: "",
  sources: [],

  runningJobs: [],
  jobsTotal: 0,
  jobsCompleted: 0,
  progress: null,
  streamPreview: null,
  streamPreviews: {},
  lastLogLine: "",
  errorMessage: null,
  errorRawPath: null,
  isRunning: false,
  lastPayload: null,
  runningJobMeta: {},
  jobGroupsByWorkspace: {},

  currentImage: null,
  history: [],
  historyHasMore: false,
  historyLoading: false,
  historyCursorBeforeDayStart: null,
  batchResults: [],
  resultGridOpen: false,
  historyRailCollapsed: false,
  historyTimelineOpen: false,

  tool: "pan",
  brushSize: 30,
  brushMode: "paint",
  annotationKind: "rect",
  annotationColor: "#ff4d4d",
  selectedAnnotationId: null,
  maskDataURL: null,
  strokes: [],
  annotations: [],
  undoStack: [],
  redoStack: [],

  compareB: null,
  compareSplit: 0.5,

  toasts: [],
  recentDurations: [],
  viewZoom: 1,
  canvasViewResetTick: 0,
  fullscreen: false,
  starPromptOpen: false,
  starPromptSource: "auto",
  promptHistory: [],
  batchCount: 1,
  presets: [],
  theme: "system",
  fontScale: 1,
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true, upstreamModalOpen: false }),
  closeSettings: () => set({ settingsOpen: false }),
  isTestingKey: false,
  isOptimizingPrompt: false,
  upstreamModalOpen: false,
  upstreamReturnTarget: "app",
  openUpstreamConfig: (returnTarget = "app") => set({
    upstreamModalOpen: true,
    upstreamReturnTarget: returnTarget,
    settingsOpen: false,
  }),
  closeUpstreamConfig: () => {
    const { upstreamReturnTarget } = get();
    set({
      upstreamModalOpen: false,
      settingsOpen: upstreamReturnTarget === "settings",
      upstreamReturnTarget: "app",
    });
  },
  openStarPrompt: () => {
    if (isMac) return;
    set({ starPromptOpen: true, starPromptSource: "manual" });
  },
  dismissStarPrompt: () => {
    set({ starPromptOpen: false });
    try { localStorage.setItem(STAR_PROMPTED_KEY, "1"); } catch {}
  },
  workspaces: [],
  activeWorkspaceId: "",
  styleTag: "",

  setField: (key, value) => {
    // 上游字段(apiKey / baseURL / textModelID / imageModelID / apiMode)是
    // active profile 的派生镜像,直接 set 顶层不持久化,改完下次启动就丢。
    // 这些字段必须走 updateProfile / setActiveProfile 这两个 action。开发期
    // 抓一下,生产期还是 set 一下顶层让 UI 不爆炸。
    if (key === "apiMode" || key === "baseURL" || key === "apiKey" ||
        key === "textModelID" || key === "imageModelID") {
      if (typeof console !== "undefined") {
        console.warn(`setField("${String(key)}", ...) 不写持久化;改这个字段请用 updateProfile / setActiveProfile`);
      }
      set({ [key]: value } as any);
      return;
    }
    // 其他全局偏好字段
    const normalizedValue = key === "batchCount" ? normalizeBatchCount(value) : value;
    set({ [key]: normalizedValue } as any);
    if (key === "currentImage") {
      const item = normalizedValue as HistoryItem | null;
      const workspace = get().workspaces.find((w) => w.id === get().activeWorkspaceId);
      set({
        compareB: null,
        resultGridOpen: false,
        workspaces: patchWorkspaceRuntime(get().workspaces, get().activeWorkspaceId, {
          currentImageId: currentImageIdForWorkspaceSnapshot(item, get().streamPreview, get().streamPreviews, workspace?.currentImageId ?? null),
          resultGridOpen: false,
        }),
      });
    } else if (key === "batchCount") {
      const value = normalizedValue as number;
      set({
        workspaces: get().workspaces.map((w) => (
          w.id === get().activeWorkspaceId ? { ...w, batchCount: value } : w
        )),
      });
    } else if (key === "errorMessage") {
      set({ workspaces: patchWorkspaceRuntime(get().workspaces, get().activeWorkspaceId, { errorMessage: value as string | null }) });
    } else if (key === "errorRawPath") {
      set({ workspaces: patchWorkspaceRuntime(get().workspaces, get().activeWorkspaceId, { errorRawPath: value as string | null }) });
    } else if (key === "lastPayload") {
      set({ workspaces: patchWorkspaceRuntime(get().workspaces, get().activeWorkspaceId, { lastPayload: value as backend.GenerateOptions | null }) });
    }
    if (key === "kernelRuntimeMode") {
      try { localStorage.setItem(KERNEL_RUNTIME_MODE_KEY, String(value)); } catch {}
      setKernelRuntimeMode(value as KernelRuntimeMode);
    } else if (key === "outputFormat") {
      try { localStorage.setItem(OUTPUT_FORMAT_KEY, String(value)); } catch {}
    }
  },
  setFullscreen: async (value) => {
    const next = !!value;
    set({ fullscreen: next });
    dispatchFullscreenResize();
    try {
      await setNativeFullscreen(next);
    } catch (error: any) {
      const platform = readRuntimePlatformState();
      const message = platform.isAndroid
        ? `Android 原生全屏切换失败:${error?.message ?? error}`
        : `原生全屏切换失败:${error?.message ?? error}`;
      get().pushToast(message, "error", 6000);
    } finally {
      dispatchFullscreenResize();
      set((state) => ({ canvasViewResetTick: state.canvasViewResetTick + 1 }));
    }
  },
  toggleFullscreen: async () => {
    await get().setFullscreen(!get().fullscreen);
  },

  setAPIKey: async (v) => {
    const trimmed = normalizeAPIKeyInput(v);
    const activeId = get().activeProfileId;
    if (!activeId) {
      // 没有 active profile,设 key 没意义;留个 warning 方便排查。
      if (typeof console !== "undefined") console.warn("setAPIKey: 没有 active profile,丢弃");
      return;
    }
    // 顶层镜像立即更新,UI 立即响应;keyring 写入异步
    set({ apiKey: trimmed });
    await SetStoredAPIKey(keyringUserFor(activeId), trimmed);
    if (!trimmed) {
      syncCLIConfigQuietly(cliConfigFromState(get(), { clearAPIKey: true }));
    }
  },

  createProfile: async (input) => profileActions.createProfile(input),
  updateProfile: async (id, patch) => profileActions.updateProfile(id, patch),
  deleteProfile: async (id) => profileActions.deleteProfile(id),
  duplicateProfile: async (id) => profileActions.duplicateProfile(id),
  setActiveProfile: async (id) => profileActions.setActiveProfile(id),

  clearError: () => {
    const wsId = get().activeWorkspaceId;
    set({
      errorMessage: null,
      errorRawPath: null,
      workspaces: patchWorkspaceRuntime(get().workspaces, wsId, {
        errorMessage: null,
        errorRawPath: null,
      }),
    });
  },

  selectSourceImage: async () => imageActions.selectSourceImage(),
  removeSource: (index) => imageActions.removeSource(index),
  clearSources: () => imageActions.clearSources(),
  reorderSources: (from, to) => imageActions.reorderSources(from, to),

  submit: async () => {
    const s = get();
    if (s.isRunning) return;
    if (!s.apiKey.trim()) {
      set({ errorMessage: "请填写 API Key", errorRawPath: null });
      return;
    }
    let cleanedAPIKey = "";
    try {
      cleanedAPIKey = validateAPIKeyForHeader(s.apiKey);
    } catch (error: any) {
      set({ errorMessage: error?.message ?? "API Key 格式不正确", errorRawPath: null });
      return;
    }
    if (cleanedAPIKey !== s.apiKey) {
      const activeId = s.activeProfileId;
      set({ apiKey: cleanedAPIKey });
      if (activeId) {
        try { await SetStoredAPIKey(keyringUserFor(activeId), cleanedAPIKey); } catch {}
      }
    }
    if (!s.prompt.trim()) {
      set({ errorMessage: "请填写提示词", errorRawPath: null });
      return;
    }
    if (!s.baseURL.trim()) {
      set({ errorMessage: "请在右侧工作栏顶部的「上游配置」中填入你的中转站地址(必须兼容 OpenAI Responses API + image_generation 工具)", errorRawPath: null });
      return;
    }
    const cleanedBaseURL = cleanBaseURL(s.baseURL);
    const batchCount = normalizeBatchCount(s.batchCount);
    const activeProfile = s.profiles.find((p) => p.id === s.activeProfileId);
    const concurrencyLimit = normalizeConcurrencyLimit(activeProfile?.concurrencyLimit ?? 0);
    const effectiveAPIMode = effectiveAPIModeForSubmit(s.mode, s.apiMode);
    if (concurrencyLimit > 0) {
      const activeCount = workspaceRunningCount(s, effectiveAPIMode);
      const available = concurrencyLimit - activeCount;
      if (available < batchCount) {
        const apiLabel = effectiveAPIMode === "responses" ? "Responses API" : "Images API";
        set({
          errorMessage: `${apiLabel} 并发限制 ${concurrencyLimit},当前还可提交 ${Math.max(0, available)} 个,本次需要 ${batchCount} 个。`,
          errorRawPath: null,
        });
        return;
      }
    }
    let editSourcePaths: string[] = [];
    let preparedSources = s.sources;
    if (s.mode === "edit") {
      if (shouldUseBackgroundTaskProxyForSubmit(effectiveAPIMode)) {
        const materializedSources = await materializeEditSourcesForBrowserProxy(preparedSources);
        if (materializedSources !== preparedSources) {
          preparedSources = materializedSources;
          set({ sources: materializedSources });
        }
      }
      editSourcePaths = preparedSources.map((src) => src.path).filter(Boolean);
      if (editSourcePaths.length === 0 && s.currentImage) {
        const materialized = await materializeHistoryItem(s.currentImage).catch(() => null);
        if (materialized?.savedPath) {
          editSourcePaths = [materialized.savedPath];
        }
      }
      if (shouldUseBackgroundTaskProxyForSubmit(effectiveAPIMode) && editSourcePaths.some((filePath) => isVirtualImagePath(filePath))) {
        set({
          errorMessage: "参考图还没有成功保存到 input 文件夹，请重新添加图片后再试。",
          errorRawPath: null,
        });
        return;
      }
      if (editSourcePaths.length === 0) {
        const platform = readRuntimePlatformState();
        set({
          errorMessage: platform.isAndroid
            ? "图生图模式需要先从相册或历史添加源图"
            : "图生图模式需要先添加源图(或从文件管理器拖图到画板)",
          errorRawPath: null,
        });
        return;
      }
    }

    const workspaceId = s.activeWorkspaceId;
    const clearCurrentForNewRun = s.mode === "generate";
    const runPatch = {
      errorMessage: null,
      errorRawPath: null,
      progress: null,
      streamPreview: null,
      streamPreviews: {},
      lastLogLine: "",
      isRunning: true,
      jobsTotal: batchCount,
      jobsCompleted: 0,
      runningJobs: [],
    };
    set({
      ...runPatch,
      batchCount,
      batchResults: [],
      resultGridOpen: batchCount > 1,
      compareB: null,
      currentImage: clearCurrentForNewRun ? null : s.currentImage,
      maskDataURL: null,
      annotations: [],
      strokes: [],
      workspaces: patchWorkspaceRuntime(s.workspaces, workspaceId, {
        ...runPatch,
        currentImageId: clearCurrentForNewRun ? null : s.currentImage?.id ?? null,
        batchResultIds: [],
        resultGridOpen: batchCount > 1,
      }),
    });

    const maskDataURL = s.mode === "edit"
      ? buildMaskPNGDataURL(s.strokes, s.currentImage?.imageB64 ? imageDims(s.currentImage.imageB64) : null)
      : null;
    const maskB64 = maskDataURL ? stripDataURLPrefix(maskDataURL) : "";
    let augmentedPrompt = augmentPromptWithAnnotations(s.prompt, s.annotations, s.currentImage?.imageB64 ? imageDims(s.currentImage.imageB64) : null);
    // Append style chip suffix if the user picked one (other than "全部").
    const styleSuffix = STYLE_SUFFIXES[s.styleTag];
    if (styleSuffix) {
      augmentedPrompt = `${augmentedPrompt}, ${styleSuffix}`;
    }

    const resolvedSize = normalizeSizeSelection(s.size, {
      apiMode: effectiveAPIMode,
      requestPolicy: s.requestPolicy,
      imageModelID: s.imageModelID,
    });

    const basePayload: backend.GenerateOptions = {
      apiKey: cleanedAPIKey,
      mode: s.mode,
      requestedJobId: "",
      prompt: augmentedPrompt,
      size: resolvedSize,
      quality: s.quality,
      outputFormat: s.outputFormat,
      imagePaths: editSourcePaths,
      imagePath: "",
      maskB64: maskB64,
      seed: s.seed,
      negativePrompt: s.negativePrompt,
      baseURL: cleanedBaseURL,
      textModelID: s.textModelID,
      imageModelID: s.imageModelID,
      proxyMode: s.proxyMode,
      proxyURL: s.proxyURL,
      requestPolicy: s.requestPolicy,
      apiMode: effectiveAPIMode,
      imagesNewAPICompat: effectiveAPIMode === "images" && s.imagesNewAPICompat === true,
      noPromptRevision: true,
      concurrencyLimit,
      partialImages: 1,
    };
    const remotePayload: RuntimeGenerateOptions = {
      ...basePayload,
      sourceImages: s.mode === "edit" ? preparedSources : undefined,
    };
    const persistedPayload = basePayload;

    if (s.prompt.trim()) {
      const ph = [s.prompt, ...get().promptHistory.filter((p) => p !== s.prompt)].slice(0, 50);
      set({ promptHistory: ph });
      try { localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(ph)); } catch {}
    }
    set({
      lastPayload: persistedPayload,
      workspaces: patchWorkspaceRuntime(get().workspaces, workspaceId, { lastPayload: persistedPayload }),
    });

    if (shouldUseBackgroundTaskProxyForSubmit(effectiveAPIMode)) {
      try {
        const submitJobGroup = isAndroidTaskProxyMode() ? submitAndroidJobGroup : submitBrowserJobGroup;
        const response = await submitJobGroup({
          workspaceId,
          mode: s.mode,
          prompt: augmentedPrompt,
          size: resolvedSize,
          quality: s.quality,
          outputFormat: s.outputFormat,
          batchCount,
          seed: s.seed,
          negativePrompt: s.negativePrompt,
          styleTag: s.styleTag,
          sourceImagePaths: editSourcePaths,
          maskB64,
          apiKey: cleanedAPIKey,
          baseURL: cleanedBaseURL,
          apiMode: effectiveAPIMode,
          requestPolicy: s.requestPolicy,
          imagesNewAPICompat: effectiveAPIMode === "images" && s.imagesNewAPICompat === true,
          textModelID: s.textModelID,
          imageModelID: s.imageModelID,
        });
        const nextJobGroupsByWorkspace = mergeWorkspaceJobGroup(get().jobGroupsByWorkspace, response.group);
        const runtimePatch = browserRuntimePatchFromGroups(nextJobGroupsByWorkspace[workspaceId] ?? []);
        const runningJobMeta = buildRunningJobMetaFromBrowserGroups(nextJobGroupsByWorkspace);
        set((state) => ({
          jobGroupsByWorkspace: nextJobGroupsByWorkspace,
          runningJobMeta,
          workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, runtimePatch),
          ...(state.activeWorkspaceId === workspaceId ? activeRuntimePatch(runtimePatch) : {}),
        } as Partial<StudioState>));
        syncBrowserJobSubscriptions(nextJobGroupsByWorkspace);
      } catch (error: any) {
        const failedPatch: WorkspacePatch = {
          runningJobs: [],
          jobsTotal: 0,
          jobsCompleted: 0,
          progress: null,
          streamPreview: null,
          streamPreviews: {},
          lastLogLine: "",
          errorMessage: `提交失败:${error?.message ?? error}`,
          errorRawPath: null,
        };
        set((state) => ({
          runningJobs: [],
          jobsTotal: 0,
          jobsCompleted: 0,
          progress: null,
          streamPreview: null,
          streamPreviews: {},
          lastLogLine: "",
          errorMessage: failedPatch.errorMessage ?? null,
          errorRawPath: null,
          isRunning: false,
          runningJobMeta: buildRunningJobMetaFromBrowserGroups(state.jobGroupsByWorkspace),
          workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, failedPatch),
        } as Partial<StudioState>));
      }
      return;
    }

    for (let i = 0; i < batchCount; i++) {
      const jobSeed = s.seed ? s.seed + i : 0;
      const p: RuntimeGenerateOptions = { ...remotePayload, seed: jobSeed };
      void launchOneJob(s.mode, p, {
        workspaceId,
        apiMode: effectiveAPIMode,
        batchIndex: i,
        size: s.size,
        quality: s.quality,
        outputFormat: s.outputFormat,
        sources: s.sources,
        currentImage: s.currentImage,
        styleTag: s.styleTag,
      });
    }
  },

  cancel: async () => {
    const s = get();
    const workspaceId = s.activeWorkspaceId;
    const ids = [...s.runningJobs];
    if (isBackgroundTaskProxyMode()) {
      for (const id of ids) {
        try { await wailsCancel(id); } catch { /* ignore */ }
      }
      return;
    }
    // Cancel every concurrent job in the batch.
    for (const id of ids) {
      try { await wailsCancel(id); } catch { /* ignore */ }
      EventsOff(`progress:${id}`, `log:${id}`, `preview:${id}`, `result:${id}`, `error:${id}`);
    }
    const nextMeta = { ...get().runningJobMeta };
    for (const id of ids) delete nextMeta[id];
    const runPatch = {
      isRunning: false,
      runningJobs: [],
      progress: null,
      streamPreview: null,
      streamPreviews: {},
      jobsTotal: 0,
      jobsCompleted: 0,
    };
    set({
      ...runPatch,
      runningJobMeta: nextMeta,
      workspaces: patchWorkspaceRuntime(get().workspaces, workspaceId, runPatch),
    });
  },

  applyHistoryParams: (item) => imageActions.applyHistoryParams(item),
  regenerateFromHistory: async (item) => imageActions.regenerateFromHistory(item),
  reuseAsSource: async (item) => imageActions.reuseAsSource(item),
  deleteHistoryItem: async (id) => imageActions.deleteHistoryItem(id),
  saveCurrentImageAs: async () => imageActions.saveCurrentImageAs(),
  saveHistoryItemAs: async (item) => imageActions.saveHistoryItemAs(item),
  shareCurrentImage: async () => imageActions.shareCurrentImage(),
  shareHistoryItem: async (item) => imageActions.shareHistoryItem(item),

  bootstrap: async () => {
    purgeForeignAPIKeyStorageKeys();
    const previewScenario = readPreviewScenario();
    if (previewScenario === "mac-workspace") {
      const workspaceId = genId();
      const preview = buildMacWorkspacePreview(workspaceId);
      applyTheme("dark");
      document.documentElement.style.setProperty("--font-scale", "1");
      setKernelRuntimeMode("auto");
      set({
        apiKey: "sk-preview",
        mode: "edit",
        prompt: preview.currentImage.prompt,
        negativePrompt: preview.currentImage.negativePrompt ?? "",
        size: preview.currentImage.size,
        quality: preview.currentImage.quality,
        outputFormat: "png",
        seed: preview.currentImage.seed ?? 3200,
        kernelRuntimeMode: "auto",
        baseURL: preview.profile.baseURL,
        textModelID: preview.profile.textModelID,
        imageModelID: preview.profile.imageModelID,
        proxyMode: "system",
        proxyURL: "",
        apiMode: preview.profile.apiMode,
        requestPolicy: preview.profile.requestPolicy,
        imagesNewAPICompat: preview.profile.imagesNewAPICompat ?? false,
        noPromptRevision: true,
        profiles: [preview.profile],
        activeProfileId: preview.profile.id,
        sources: preview.sources,
        runningJobs: [],
        jobsTotal: 0,
        jobsCompleted: 0,
        progress: null,
        streamPreview: null,
        streamPreviews: {},
        lastLogLine: "",
        errorMessage: null,
        errorRawPath: null,
        isRunning: false,
        lastPayload: null,
        runningJobMeta: {},
        jobGroupsByWorkspace: {},
        currentImage: preview.currentImage,
        history: preview.history,
        historyHasMore: false,
        historyLoading: false,
        historyCursorBeforeDayStart: null,
        batchResults: [],
        resultGridOpen: false,
        historyRailCollapsed: false,
        historyTimelineOpen: false,
        tool: "pan",
        brushSize: 24,
        brushMode: "paint",
        annotationKind: "rect",
        annotationColor: "#ff4d4d",
        selectedAnnotationId: null,
        maskDataURL: null,
        strokes: [],
        annotations: [],
        compareB: null,
        compareSplit: 0.5,
        toasts: [],
        recentDurations: preview.history.map((item) => item.elapsedSec ?? 0).filter((value) => value > 0),
        viewZoom: 1,
        canvasViewResetTick: 0,
        fullscreen: false,
        promptHistory: [],
        batchCount: 1,
        presets: [],
        theme: "dark",
        fontScale: 1,
        workspaces: [preview.workspace],
        activeWorkspaceId: workspaceId,
        styleTag: preview.currentImage.styleTag ?? "",
        undoStack: [],
        redoStack: [],
        resultDetail: null,
        settingsOpen: false,
        isTestingKey: false,
        isOptimizingPrompt: false,
        upstreamModalOpen: false,
        upstreamReturnTarget: "app",
        starPromptOpen: false,
        starPromptSource: "auto",
      });
      return;
    }

    const initialHistoryPage = await loadHistoryPage({ limit: INITIAL_HISTORY_LOAD });
    let items = trimHistory(initialHistoryPage.items);
    let promptHistory: string[] = [];
    let presets: Preset[] = [];
    let theme: ThemeMode = "system";
    let fontScale = 1;
    try {
      const raw = localStorage.getItem(PROMPT_HISTORY_KEY);
      if (raw) promptHistory = JSON.parse(raw);
    } catch {}
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) presets = JSON.parse(raw);
    } catch {}
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === "system" || raw === "light" || raw === "dark") theme = raw;
    } catch {}
    try {
      const raw = localStorage.getItem(FONT_SCALE_KEY);
      const n = Number(raw);
      if (!Number.isNaN(n) && n > 0.5 && n < 2) fontScale = n;
    } catch {}
    let kernelRuntimeMode: KernelRuntimeMode = "auto";
    try {
      const v = localStorage.getItem(KERNEL_RUNTIME_MODE_KEY);
      if (v === "auto" || v === "local" || v === "remote") kernelRuntimeMode = v;
    } catch {}
    const noPromptRevision = true;
    const proxyConfig = loadProxyConfig();
    let outputFormat: OutputFormatValue = "png";
    try {
      const v = localStorage.getItem(OUTPUT_FORMAT_KEY);
      if (v === "png" || v === "jpeg" || v === "webp") outputFormat = v;
    } catch {}
    // ---- v0.1.6 profile 列表加载 / 迁移 -----------------------------------
    // 1) 优先读新格式 gptcodex.profiles。
    // 2) 缺失时尝试从老 gptcodex.{responses,images}.* + 老 keyring 项合成 0-2
    //    个 profile,顺手清理老 localStorage 键。
    let profiles = loadStoredProfiles();
    let activeProfileId = loadStoredActiveProfileId();
    if (profiles.length === 0 && ENABLE_LEGACY_PROFILE_MIGRATION) {
      // 检测老格式
      let legacyApiMode: APIMode = "responses";
      try {
        const v = localStorage.getItem(storageKey("gptcodex.apiMode"));
        if (v === "images" || v === "responses") legacyApiMode = v;
      } catch {}
      const legacyResponses = loadModeConfig("responses");
      const legacyImages = loadModeConfig("images");
      // 沿用 v0.1.5 那套 legacy-shared 字段(更老的 gptcodex.baseURL 等)
      const legacyBaseURL  = (() => { try { return localStorage.getItem(storageKey("gptcodex.baseURL")) ?? ""; } catch { return ""; } })();
      const legacyTextID   = (() => { try { return localStorage.getItem(storageKey("gptcodex.textModelID")) ?? ""; } catch { return ""; } })();
      const legacyImageID  = (() => { try { return localStorage.getItem(storageKey("gptcodex.imageModelID")) ?? ""; } catch { return ""; } })();
      if (legacyApiMode === "responses" && legacyBaseURL && !legacyResponses.baseURL) {
        legacyResponses.baseURL = cleanBaseURL(legacyBaseURL);
        legacyResponses.textModelID = legacyTextID;
        legacyResponses.imageModelID = legacyImageID;
      } else if (legacyApiMode === "images" && legacyBaseURL && !legacyImages.baseURL) {
        legacyImages.baseURL = cleanBaseURL(legacyBaseURL);
        legacyImages.imageModelID = legacyImageID;
      }
      const legacySharedKey = loadLegacySharedAPIKey();
      const legacyResponsesKey = await GetStoredAPIKey("responses").catch(() => "")
        || loadLegacyModeAPIKey("responses")
        || (legacyApiMode === "responses" ? legacySharedKey : "");
      const legacyImagesKey = await GetStoredAPIKey("images").catch(() => "")
        || loadLegacyModeAPIKey("images")
        || (legacyApiMode === "images" ? legacySharedKey : "");
      const synth: UpstreamProfile[] = [];
      if (legacyResponses.baseURL || legacyResponsesKey) {
        const id = genProfileId();
        synth.push({
          id,
          name: "Responses · 默认",
          apiMode: "responses",
          requestPolicy: "openai",
          baseURL: legacyResponses.baseURL,
          textModelID: legacyResponses.textModelID,
          imageModelID: legacyResponses.imageModelID,
          concurrencyLimit: normalizeConcurrencyLimit(legacyResponses.concurrencyLimit),
          imagesNewAPICompat: false,
          createdAt: Date.now(),
          lastUsedAt: legacyApiMode === "responses" ? Date.now() : undefined,
        });
        if (legacyResponsesKey) {
          try { await SetStoredAPIKey(keyringUserFor(id), legacyResponsesKey); } catch {}
        }
      }
      if (legacyImages.baseURL || legacyImagesKey) {
        const id = genProfileId();
        synth.push({
          id,
          name: "Images · 默认",
          apiMode: "images",
          requestPolicy: "openai",
          baseURL: legacyImages.baseURL,
          textModelID: legacyImages.textModelID,
          imageModelID: legacyImages.imageModelID,
          concurrencyLimit: normalizeConcurrencyLimit(legacyImages.concurrencyLimit),
          imagesNewAPICompat: false,
          createdAt: Date.now(),
          lastUsedAt: legacyApiMode === "images" ? Date.now() : undefined,
        });
        if (legacyImagesKey) {
          try { await SetStoredAPIKey(keyringUserFor(id), legacyImagesKey); } catch {}
        }
      }
      if (synth.length > 0) {
        profiles = synth;
        // active = 跟老 apiMode 对应的那个
        const matching = synth.find((p) => p.apiMode === legacyApiMode);
        activeProfileId = (matching ?? synth[0]).id;
        persistProfiles(profiles);
        persistActiveProfileId(activeProfileId);
        // 清掉老的 keyring 项 + localStorage 键(避免下次启动重复迁移)
        try { await DeleteStoredAPIKey("responses"); } catch {}
        try { await DeleteStoredAPIKey("images"); } catch {}
        clearLegacyAPIKeys();
        clearLegacyModeLocalStorage();
      }
    }

    // 决定 active profile 与对应顶层镜像。空列表 → 全置空,后面会自动弹首次配置。
    const localFHLConfig = await loadLocalFHLConfig();
    const localFHLBaseURL = cleanBaseURL(localFHLConfig?.baseURL || FHL_BASE_URL);
    const localFHLTextModelID = (localFHLConfig?.textModelID || FHL_TEXT_MODEL_ID).trim();
    const localFHLImageModelID = (localFHLConfig?.imageModelID || FHL_IMAGE_MODEL_ID).trim();
    let profilesChangedForFHL = false;
    let fhlProfileId = profiles.find((profile) => (
      profile.id === FHL_PROFILE_ID
      || (
        profile.apiMode === "responses"
        && cleanBaseURL(profile.baseURL) === FHL_BASE_URL
        && profile.imageModelID === FHL_IMAGE_MODEL_ID
      )
    ))?.id;

    if (!fhlProfileId && (profiles.length === 0 || localFHLConfig)) {
      const profile = makeFHLResponsesProfile();
      profiles = [...profiles, profile];
      fhlProfileId = profile.id;
      profilesChangedForFHL = true;
    }

    if (fhlProfileId) {
      profiles = profiles.map((profile) => {
        if (profile.id !== fhlProfileId) return profile;
        const next: UpstreamProfile = {
          ...profile,
          name: profile.name || "FHL Responses",
          apiMode: localFHLConfig?.apiMode ?? "responses",
          requestPolicy: localFHLConfig?.requestPolicy ?? "openai",
          baseURL: localFHLBaseURL,
          textModelID: localFHLTextModelID,
          imageModelID: localFHLImageModelID,
          imagesNewAPICompat: false,
        };
        if (JSON.stringify(next) !== JSON.stringify(profile)) profilesChangedForFHL = true;
        return next;
      });
      if (localFHLConfig) {
        activeProfileId = fhlProfileId;
        persistActiveProfileId(activeProfileId);
        if (localFHLConfig.apiKey.trim()) {
          try { await SetStoredAPIKey(keyringUserFor(fhlProfileId), localFHLConfig.apiKey.trim()); } catch {}
        }
      }
    }

    if (profiles.length === 0) {
      const profile = makeFHLResponsesProfile();
      profiles = [profile];
      activeProfileId = profile.id;
      profilesChangedForFHL = true;
      persistActiveProfileId(activeProfileId);
    }

    if (profilesChangedForFHL) {
      persistProfiles(profiles);
    }

    const activeProfile = pickActiveProfile(profiles, activeProfileId);
    if (activeProfile && activeProfile.id !== activeProfileId) {
      activeProfileId = activeProfile.id;
      persistActiveProfileId(activeProfileId);
    }
    const apiMode: APIMode = activeProfile?.apiMode ?? "responses";
    const requestPolicy: RequestPolicy = activeProfile?.requestPolicy ?? "openai";
    const imagesNewAPICompat = apiMode === "images" && activeProfile?.imagesNewAPICompat === true;
    const baseURL = activeProfile?.baseURL ?? "";
    const textModelID = activeProfile?.textModelID ?? "";
    const imageModelID = activeProfile?.imageModelID ?? "";
    const activeKey = activeProfile
      ? await GetStoredAPIKey(keyringUserFor(activeProfile.id)).catch(() => "")
      : "";
    // Apply theme + font scale to root immediately.
    applyTheme(theme);
    document.documentElement.style.setProperty("--font-scale", String(fontScale));
    setKernelRuntimeMode(kernelRuntimeMode);
    // 用户自定义输出目录 —— 推给 backend,并记为可信输出根。
    const trustedRoots = new Set(loadTrustedOutputRoots());
    try {
      const customOutput = localStorage.getItem(OUTPUT_DIR_KEY);
      if (customOutput && customOutput.trim()) {
        await SetOutputDir(customOutput).catch(() => undefined);
        trustedRoots.add(customOutput.trim());
      }
    } catch {}
    const effectiveOutput = await GetOutputDir().catch(() => "");
    if (effectiveOutput) trustedRoots.add(effectiveOutput);
    for (const root of trustedRoots) rememberTrustedOutputRoot(root);
    await registerTrustedOutputRoots(Array.from(trustedRoots));
    items = await hydrateHistoryPreviewRefs(items);
    // Make sure there's always at least one workspace.
    const wsId = genId();
    const initialWorkspace: Workspace = {
      id: wsId,
      name: "图片 1",
      prompt: "",
      negativePrompt: "",
      mode: "generate",
      size: "1024x1024",
      quality: "medium",
      outputFormat,
      seed: 0,
      batchCount: 1,
      styleTag: "",
      sources: [],
      currentImageId: null,
      batchResultIds: [],
      resultGridOpen: false,
      runningJobIds: [],
      jobsTotal: 0,
      jobsCompleted: 0,
      progress: null,
      streamPreview: null,
      streamPreviews: {},
      lastLogLine: "",
      errorMessage: null,
      errorRawPath: null,
      lastPayload: null,
    };
    const restoredSession = loadWorkspaceSession(outputFormat);
    const serviceRestarted = isBrowserTaskProxyMode()
      && !!restoredSession
      && restoredSession.serviceInstanceId !== currentWorkspaceServiceInstanceId();
    let restoredWorkspaces = restoredSession?.workspaces ?? [initialWorkspace];
    if (serviceRestarted) {
      restoredWorkspaces = resetWorkspaceSourcesAfterServiceRestart(restoredWorkspaces);
    }
    let jobGroupsByWorkspace: Record<string, JobGroupSnapshot[]> = {};
    if (isBackgroundTaskProxyMode()) {
      const listJobGroups = isAndroidTaskProxyMode() ? listAndroidJobGroups : listBrowserJobGroups;
      const loadedGroups = await Promise.all(restoredWorkspaces.map(async (workspace) => {
        try {
          const response = await listJobGroups(workspace.id);
          return [workspace.id, response.groups] as const;
        } catch {
          return [workspace.id, []] as const;
        }
      }));
      for (const [workspaceId, groups] of loadedGroups) {
        jobGroupsByWorkspace = replaceWorkspaceJobGroups(jobGroupsByWorkspace, workspaceId, [...groups]);
      }
      const hydrated = await hydrateHistoryFromBrowserGroups(items, jobGroupsByWorkspace);
      items = hydrated.history;
      for (const workspace of restoredWorkspaces) {
        restoredWorkspaces = patchWorkspaceRuntime(
          restoredWorkspaces,
          workspace.id,
          browserRuntimePatchFromGroups(jobGroupsByWorkspace[workspace.id] ?? []),
        );
      }
    }
    const restoredActiveWorkspace = restoredWorkspaces.find(
      (workspace) => workspace.id === restoredSession?.activeWorkspaceId,
    ) ?? restoredWorkspaces[0];
    const restoredCurrentHistory = restoredActiveWorkspace.currentImageId
      ? items.find((item) => item.id === restoredActiveWorkspace.currentImageId) ?? null
      : null;
    const restoredCurrentImage = streamPreviewItemFromWorkspace(
      restoredActiveWorkspace,
      restoredCurrentHistory,
    ) ?? restoredCurrentHistory;
    const restoredBatchResults = historyItemsByIds(items, restoredActiveWorkspace.batchResultIds ?? []);
    const browserRuntime = browserRuntimePatchFromGroups(jobGroupsByWorkspace[restoredActiveWorkspace.id] ?? []);
    const restoredRunningJobs = isBackgroundTaskProxyMode()
      ? browserRuntime.runningJobs ?? []
      : restoredActiveWorkspace.runningJobIds ?? [];
    const runtimePlatform = readRuntimePlatformState();
    const shouldAutoOpenSettings = runtimePlatform.isAndroid
      ? false
      : !activeProfile || !activeKey.trim() || !baseURL.trim();
    set({
      apiKey: activeKey,
      mode: restoredActiveWorkspace.mode,
      prompt: restoredActiveWorkspace.prompt,
      negativePrompt: restoredActiveWorkspace.negativePrompt,
      size: restoredActiveWorkspace.size,
      quality: restoredActiveWorkspace.quality,
      outputFormat: restoredActiveWorkspace.outputFormat ?? outputFormat,
      seed: restoredActiveWorkspace.seed,
      history: items,
      historyHasMore: !!initialHistoryPage.nextCursor && items.length < MAX_HISTORY_ITEMS,
      historyLoading: false,
      historyCursorBeforeDayStart: initialHistoryPage.nextCursor?.beforeDayStart ?? null,
      batchResults: restoredBatchResults,
      resultGridOpen: !!restoredActiveWorkspace.resultGridOpen,
      currentImage: restoredCurrentImage,
      compareB: null,
      annotations: [],
      strokes: [],
      maskDataURL: null,
      runningJobMeta: isBackgroundTaskProxyMode() ? buildRunningJobMetaFromBrowserGroups(jobGroupsByWorkspace) : {},
      jobGroupsByWorkspace,
      apiMode,
      requestPolicy,
      imagesNewAPICompat,
      baseURL,
      textModelID,
      imageModelID,
      kernelRuntimeMode,
      noPromptRevision,
      proxyMode: proxyConfig.mode,
      proxyURL: proxyConfig.url,
      sources: restoredActiveWorkspace.sources,
      runningJobs: restoredRunningJobs,
      jobsTotal: isBackgroundTaskProxyMode()
        ? browserRuntime.jobsTotal ?? 0
        : restoredActiveWorkspace.jobsTotal ?? 0,
      jobsCompleted: isBackgroundTaskProxyMode()
        ? browserRuntime.jobsCompleted ?? 0
        : restoredActiveWorkspace.jobsCompleted ?? 0,
      progress: isBackgroundTaskProxyMode()
        ? browserRuntime.progress ?? null
        : restoredActiveWorkspace.progress ?? null,
      streamPreview: restoredActiveWorkspace.streamPreview ?? null,
      streamPreviews: restoredActiveWorkspace.streamPreviews ?? {},
      lastLogLine: isBackgroundTaskProxyMode()
        ? browserRuntime.lastLogLine ?? ""
        : restoredActiveWorkspace.lastLogLine ?? "",
      errorMessage: isBackgroundTaskProxyMode()
        ? browserRuntime.errorMessage ?? null
        : restoredActiveWorkspace.errorMessage ?? null,
      errorRawPath: isBackgroundTaskProxyMode()
        ? browserRuntime.errorRawPath ?? null
        : restoredActiveWorkspace.errorRawPath ?? null,
      isRunning: restoredRunningJobs.length > 0,
      lastPayload: restoredActiveWorkspace.lastPayload ?? null,
      promptHistory,
      presets,
      theme,
      fontScale,
      batchCount: restoredActiveWorkspace.batchCount,
      styleTag: restoredActiveWorkspace.styleTag ?? "",
      profiles,
      activeProfileId,
      workspaces: restoredWorkspaces,
      activeWorkspaceId: restoredActiveWorkspace.id,
      // Android 走首页 hero 引导，不用启动即弹设置；桌面仍保留首次引导。
      settingsOpen: shouldAutoOpenSettings,
      upstreamModalOpen: false,
      upstreamReturnTarget: shouldAutoOpenSettings ? "settings" : "app",
    });
    if (isBackgroundTaskProxyMode()) {
      syncBrowserJobSubscriptions(jobGroupsByWorkspace);
    }
  },

  setMaskDataURL: (v) => set({ maskDataURL: v }),

  pushStroke: (stroke) => {
    const before = get().strokes;
    const after = [...before, stroke];
    const entry: UndoEntry = {
      label: "stroke",
      undo: (s) => ({ strokes: s.strokes.slice(0, -1) }),
      redo: () => ({ strokes: [...get().strokes, stroke] }),
    };
    set({
      strokes: after,
      undoStack: [...get().undoStack, entry],
      redoStack: [],
    });
  },

  resetMask: () => {
    const before = get().strokes;
    if (before.length === 0) return;
    const entry: UndoEntry = {
      label: "clear-mask",
      undo: () => ({ strokes: before, maskDataURL: get().maskDataURL }),
      redo: () => ({ strokes: [], maskDataURL: null }),
    };
    set({
      strokes: [],
      maskDataURL: null,
      undoStack: [...get().undoStack, entry],
      redoStack: [],
    });
  },

  addAnnotation: (a) => {
    const entry: UndoEntry = {
      label: "annotation",
      undo: (s) => ({ annotations: s.annotations.filter((x) => x.id !== a.id) }),
      redo: () => ({ annotations: [...get().annotations, a] }),
    };
    set({
      annotations: [...get().annotations, a],
      undoStack: [...get().undoStack, entry],
      redoStack: [],
    });
  },

  removeAnnotation: (id) => {
    const target = get().annotations.find((a) => a.id === id);
    if (!target) return;
    const entry: UndoEntry = {
      label: "remove-annotation",
      undo: (s) => ({ annotations: [...s.annotations, target] }),
      redo: () => ({ annotations: get().annotations.filter((x) => x.id !== id) }),
    };
    set({
      annotations: get().annotations.filter((a) => a.id !== id),
      selectedAnnotationId: get().selectedAnnotationId === id ? null : get().selectedAnnotationId,
      undoStack: [...get().undoStack, entry],
      redoStack: [],
    });
  },

  updateAnnotation: (id, patch) => {
    set({
      annotations: get().annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    });
  },

  clearAnnotations: () => {
    const before = get().annotations;
    if (before.length === 0) return;
    const entry: UndoEntry = {
      label: "clear-annotations",
      undo: () => ({ annotations: before }),
      redo: () => ({ annotations: [] }),
    };
    set({
      annotations: [],
      undoStack: [...get().undoStack, entry],
      redoStack: [],
    });
  },

  undo: () => {
    const stack = get().undoStack;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    const patch = entry.undo(get());
    set({
      ...(patch as any),
      undoStack: stack.slice(0, -1),
      redoStack: [...get().redoStack, entry],
    });
  },

  redo: () => {
    const stack = get().redoStack;
    if (stack.length === 0) return;
    const entry = stack[stack.length - 1];
    const patch = entry.redo(get());
    set({
      ...(patch as any),
      redoStack: stack.slice(0, -1),
      undoStack: [...get().undoStack, entry],
    });
  },

  setCompareB: (item) => mediaActions.setCompareB(item),
  setCompareSplit: (v) => mediaActions.setCompareSplit(v),
  openResultGrid: () => mediaActions.openResultGrid(),
  closeResultGrid: () => mediaActions.closeResultGrid(),
  selectBatchResult: async (item) => mediaActions.selectBatchResult(item),
  pushToast: (text, kind = "info", ttl = 3500, action) => mediaActions.pushToast(text, kind, ttl, action),
  dismissToast: (id) => mediaActions.dismissToast(id),
  resultDetail: null,
  openResultDetail: async (item) => mediaActions.openResultDetail(item),
  closeResultDetail: () => mediaActions.closeResultDetail(),
  materializeCurrentImage: async (item) => mediaActions.materializeCurrentImage(item),
  loadMoreHistory: async () => {
    if (deferredHistoryLoadPromise) return deferredHistoryLoadPromise;
    if (!get().historyHasMore || get().historyLoading) return;
    set({ historyLoading: true });
    deferredHistoryLoadPromise = (async () => {
      try {
        const currentHistory = get().history;
        const cursorBeforeDayStart = get().historyCursorBeforeDayStart;
        const nextPage = await loadHistoryPage({
          cursor: typeof cursorBeforeDayStart === "number" ? { beforeDayStart: cursorBeforeDayStart } : null,
          limit: INITIAL_HISTORY_LOAD,
        });
        const existing = new Set(currentHistory.map((item) => item.id));
        const incoming = nextPage.items.filter((item) => !existing.has(item.id));
        const merged = trimHistory([...currentHistory, ...incoming].sort((a, b) => b.createdAt - a.createdAt));
        set({
          history: merged,
          historyHasMore: !!nextPage.nextCursor && merged.length < MAX_HISTORY_ITEMS,
          historyCursorBeforeDayStart: nextPage.nextCursor?.beforeDayStart ?? null,
        });
        void backfillHistoryPreviewRefs(incoming);
      } catch (error) {
        if (typeof console !== "undefined") console.warn("load more history failed", error);
      } finally {
        deferredHistoryLoadPromise = null;
        set({ historyLoading: false });
      }
    })();
    return deferredHistoryLoadPromise;
  },
  setHistoryRailCollapsed: (collapsed) => mediaActions.setHistoryRailCollapsed(collapsed),
  openHistoryTimeline: () => mediaActions.openHistoryTimeline(),
  closeHistoryTimeline: () => mediaActions.closeHistoryTimeline(),
  pruneHistoryOlderThanDays: async (days) => mediaActions.pruneHistoryOlderThanDays(days),
  rotateCurrent: async (degrees) => mediaActions.rotateCurrent(degrees),
  flipCurrent: async (horizontal) => mediaActions.flipCurrent(horizontal),
  cropToRect: async (x, y, w, h) => mediaActions.cropToRect(x, y, w, h),
  savePreset: (name) => mediaActions.savePreset(name),
  applyPreset: (id) => mediaActions.applyPreset(id),
  deletePreset: (id) => mediaActions.deletePreset(id),
  exportHistory: async () => mediaActions.exportHistory(),

  setTheme: (t) => {
    set({ theme: t });
    try { localStorage.setItem(THEME_KEY, t); } catch {}
    applyTheme(t);
  },

  setFontScale: (v) => {
    set({ fontScale: v });
    try { localStorage.setItem(FONT_SCALE_KEY, String(v)); } catch {}
    document.documentElement.style.setProperty("--font-scale", String(v));
  },

  setProxyConfig: (mode, url) => {
    const normalizedMode = normalizeProxyMode(mode);
    const nextURL = (url ?? get().proxyURL).trim();
    set({ proxyMode: normalizedMode, proxyURL: nextURL });
    persistProxyConfig(normalizedMode, nextURL);
  },

  testAPIKey: async () => {
    const s = get();
    if (!s.apiKey.trim()) {
      s.pushToast("先填入 API Key", "warn");
      return;
    }
    if (!s.baseURL.trim()) {
      s.pushToast("先在「上游配置」里填入中转站地址", "warn", 5000);
      return;
    }
    let cleanedAPIKey = "";
    try {
      cleanedAPIKey = validateAPIKeyForHeader(s.apiKey);
    } catch (error: any) {
      s.pushToast(error?.message ?? "API Key 格式不正确", "error", 6000);
      return;
    }
    if (cleanedAPIKey !== s.apiKey) {
      const activeId = s.activeProfileId;
      set({ apiKey: cleanedAPIKey });
      if (activeId) {
        try { await SetStoredAPIKey(keyringUserFor(activeId), cleanedAPIKey); } catch {}
      }
    }
    const cleanedBaseURL = cleanBaseURL(s.baseURL);
    if (s.isTestingKey) return;
    set({ isTestingKey: true });
    s.pushToast("正在测试连接...", "info", 8000);
    try {
      await probeCurrentUpstream(cleanedBaseURL, cleanedAPIKey, s.proxyMode, s.proxyURL);
      set({ isTestingKey: false });
      syncCLIConfigQuietly(cliConfigFromState(get(), {
        apiKey: cleanedAPIKey,
        baseURL: cleanedBaseURL,
      }));
      s.pushToast("连接 OK · 上游 models 列表可访问", "success");
    } catch (e: any) {
      set({ isTestingKey: false });
      s.pushToast(`连接失败:${e?.message ?? e}`, "error", 6000);
    }
  },

  optimizePrompt: async () => {
    const s = get();
    if (s.isRunning || s.isOptimizingPrompt) return;
    // prompt 优化必须走 Responses(它要文本模型),如果用户 active 的是 Images
    // profile,要回头找一个 Responses profile 来跑;它的 key 还是从 keyring 拿。
    let optimizeAPIKey = s.apiKey;
    let optimizeBaseURL = s.baseURL;
    let optimizeTextModelID = s.textModelID;
    if (s.apiMode !== "responses") {
      const responsesProfile = s.profiles.find((p) => p.apiMode === "responses" && p.baseURL);
      if (responsesProfile) {
        optimizeBaseURL = responsesProfile.baseURL;
        optimizeTextModelID = responsesProfile.textModelID;
        const k = await GetStoredAPIKey(keyringUserFor(responsesProfile.id)).catch(() => "");
        if (k) optimizeAPIKey = k;
      }
    }
    optimizeAPIKey = optimizeAPIKey.trim();
    optimizeBaseURL = cleanBaseURL(optimizeBaseURL);
    optimizeTextModelID = optimizeTextModelID.trim();
    if (!optimizeAPIKey) {
      s.pushToast("先填入 API Key", "warn");
      return;
    }
    if (!optimizeBaseURL) {
      s.pushToast("先在上游配置里填入可用于 AI 优化的 Responses API 地址", "warn", 5000);
      return;
    }
    if (!s.prompt.trim()) {
      s.pushToast("先输入 prompt", "warn");
      return;
    }
    const sourcePaths = s.mode === "edit"
      ? s.sources.map((src) => src.path).filter(Boolean)
      : [];
    if (s.mode === "edit" && sourcePaths.length === 0 && s.currentImage?.savedPath) {
      sourcePaths.push(s.currentImage.savedPath);
    }
    set({ isOptimizingPrompt: true, errorMessage: null, errorRawPath: null });
    try {
      const optimized = await wailsOptimizePrompt({
        apiKey: optimizeAPIKey,
        prompt: s.prompt,
        mode: s.mode,
        baseURL: optimizeBaseURL,
        textModelID: optimizeTextModelID,
        proxyMode: s.proxyMode,
        proxyURL: s.proxyURL,
        imagePaths: sourcePaths,
        imagePath: "",
      } satisfies PromptOptimizeRequest);
      const trimmed = optimized.trim();
      if (!trimmed) {
        throw new Error("上游没有返回可用的优化结果");
      }
      set({ prompt: trimmed });
      s.pushToast("已优化提示词", "success");
    } catch (e: any) {
      const msg = `优化失败:${e?.message ?? e}`;
      set({ errorMessage: msg, errorRawPath: null });
      s.pushToast(msg, "error", 6000);
    } finally {
      set({ isOptimizingPrompt: false });
    }
  },

  newWorkspace: (name) => workspaceActions.newWorkspace(name),
  switchWorkspace: (id) => workspaceActions.switchWorkspace(id),
  closeWorkspace: (id) => workspaceActions.closeWorkspace(id),
  renameWorkspace: (id, name) => workspaceActions.renameWorkspace(id, name),

  importHistory: async () => mediaActions.importHistory(),

  retryLast: async () => {
    const s = get();
    if (!s.lastPayload || s.isRunning) return;
    set({ errorMessage: null, errorRawPath: null });
    // Re-invoke submit, which will rebuild the payload from current state.
    // (We don't reuse lastPayload verbatim so any tweaks the user made
    // after the failure — different seed, different prompt — take effect.)
    await get().submit();
  },

  importImageFile: async (file) => imageActions.importImageFile(file),
}));

// Fire one job (concurrent member of a batch). Registers its own EventsOn
// callbacks; updates store.runningJobs / jobsCompleted as the run progresses.
// `snapshot` is the store state at submit time — captures size/quality/sources
// so per-job result writes still see the originating context.
async function launchOneJob(
  mode: string,
  payload: RuntimeGenerateOptions,
  snapshot: {
    workspaceId: string;
    apiMode: APIModeValue;
    batchIndex: number;
    size: SizeValue;
    quality: QualityValue;
    outputFormat: OutputFormatValue;
    sources: SourceImage[];
    currentImage: HistoryItem | null;
    styleTag: string;
  },
): Promise<void> {
  const store = useStudioStore;
  const jobId = cryptoIDFallback();
  let offProgress = () => {};
  let offLog = () => {};
  let offPreview = () => {};
  let offResult = () => {};
  let offError = () => {};
  const cleanup = () => { offProgress(); offLog(); offPreview(); offResult(); offError(); };
  try {
    store.setState((state) => {
      const runtime = workspaceRuntimeFromState(state, snapshot.workspaceId);
      const runningJobs = runtime.runningJobs.includes(jobId)
        ? runtime.runningJobs
        : [...runtime.runningJobs, jobId];
      const patch: WorkspacePatch = { runningJobs };
      return {
        runningJobMeta: {
          ...state.runningJobMeta,
          [jobId]: { workspaceId: snapshot.workspaceId, apiMode: snapshot.apiMode },
        },
        workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, patch),
        ...(state.activeWorkspaceId === snapshot.workspaceId ? activeRuntimePatch(patch) : {}),
      } as Partial<StudioState>;
    });

    const removeFromRunning = () => {
      let completed = 0;
      let total = 0;
      store.setState((state) => {
        const runtime = workspaceRuntimeFromState(state, snapshot.workspaceId);
        const remaining = runtime.runningJobs.filter((id) => id !== jobId);
        const prunedPreview = removeStreamPreview(runtime.streamPreviews, jobId);
        completed = runtime.jobsCompleted + 1;
        total = runtime.jobsTotal;
        const patch: WorkspacePatch = {
          runningJobs: remaining,
          jobsCompleted: completed,
          jobsTotal: runtime.jobsTotal,
          progress: remaining.length === 0 ? null : runtime.progress,
          streamPreview: remaining.length === 0 ? null : prunedPreview.streamPreview,
          streamPreviews: remaining.length === 0 ? {} : prunedPreview.streamPreviews,
          lastLogLine: remaining.length === 0 ? "" : runtime.lastLogLine,
        };
        const nextMeta = { ...state.runningJobMeta };
        delete nextMeta[jobId];
        return {
          runningJobMeta: nextMeta,
          workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, patch),
          ...(state.activeWorkspaceId === snapshot.workspaceId ? activeRuntimePatch(patch) : {}),
        } as Partial<StudioState>;
      });
      return { completed, total };
    };

    offProgress = EventsOn(`progress:${jobId}`, (p: ProgressInfo) => {
      const patch: WorkspacePatch = { progress: p };
      store.setState((state) => ({
        workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, patch),
        ...(state.activeWorkspaceId === snapshot.workspaceId ? activeRuntimePatch(patch) : {}),
      } as Partial<StudioState>));
    });
    offLog = EventsOn(`log:${jobId}`, (line: string) => {
      const patch: WorkspacePatch = { lastLogLine: line };
      store.setState((state) => ({
        workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, patch),
        ...(state.activeWorkspaceId === snapshot.workspaceId ? activeRuntimePatch(patch) : {}),
      } as Partial<StudioState>));
    });
    offPreview = EventsOn(`preview:${jobId}`, (preview: StreamPreviewPayload) => {
      store.setState((state) => (
        streamPreviewStatePatch(state, jobId, preview, {
          workspaceId: snapshot.workspaceId,
          mode: mode === "edit" ? "edit" : "generate",
          prompt: payload.prompt,
          size: snapshot.size,
          quality: snapshot.quality,
          outputFormat: snapshot.outputFormat,
          currentImage: snapshot.currentImage,
          batchIndex: snapshot.batchIndex,
        }) ?? {}
      ));
    });

    const startedAt = Date.now();
    offResult = EventsOn(`result:${jobId}`, (r: any) => {
      cleanup();
      void (async () => {
        try {
          const elapsedSec = (Date.now() - startedAt) / 1000;
          const rd = [elapsedSec, ...store.getState().recentDurations].slice(0, 5);
          const willNotify = typeof document !== "undefined" && document.visibilityState !== "visible";
          const parentId = mode === "edit" ? (snapshot.sources[0]?.path || snapshot.currentImage?.savedPath) : undefined;
          const sourceImages = sourceImagesForHistory(mode, snapshot.sources);
          const itemID = cryptoIDFallback();
          const fallbackB64 = typeof r.imageB64 === "string" ? r.imageB64 : "";
          const previewItem: HistoryItem = {
            id: itemID,
            imageId: r.imageId || undefined,
            previewUrl: r.previewUrl || undefined,
            thumbPath: r.thumbPath || undefined,
            previewWidth: typeof r.previewWidth === "number" ? r.previewWidth : undefined,
            previewHeight: typeof r.previewHeight === "number" ? r.previewHeight : undefined,
            imageB64: fallbackB64 || undefined,
            imageBlob: null,
            previewBlob: null,
            previewOnly: true,
            prompt: r.prompt,
            revisedPrompt: r.revisedPrompt,
            mode: r.mode as Mode,
            size: snapshot.size,
            quality: snapshot.quality,
            outputFormat: snapshot.outputFormat,
            parentId,
            createdAt: Date.now(),
            seed: payload.seed || undefined,
            negativePrompt: payload.negativePrompt || undefined,
            styleTag: snapshot.styleTag || undefined,
            batchIndex: snapshot.batchIndex,
            elapsedSec: Number(elapsedSec.toFixed(1)),
            sourceImages,
            savedPath: r.savedPath,
            rawPath: r.rawPath,
          };
          const activeItem: HistoryItem = {
            ...previewItem,
            fullUrl: r.fullUrl || (r.imageId ? `/media/full/${r.imageId}` : undefined),
            previewOnly: false,
          };
          const historyItem: HistoryItem = {
            ...previewItem,
            previewOnly: true,
          };
          const { completed: completedNow, total: totalNow } = removeFromRunning();
          const currentItem = totalNow > 1 ? historyItem : activeItem;
          const trimmed = trimHistory([historyItem, ...store.getState().history]);
          store.setState((state) => {
            const workspace = state.workspaces.find((w) => w.id === snapshot.workspaceId);
            const existingBatchIDs = state.activeWorkspaceId === snapshot.workspaceId
              ? state.batchResults.map((b) => b.id)
              : workspace?.batchResultIds ?? [];
            const gridWasOpen = state.activeWorkspaceId === snapshot.workspaceId
              ? state.resultGridOpen
              : workspace?.resultGridOpen ?? false;
            const nextBatchIDs = existingBatchIDs.includes(historyItem.id)
              ? existingBatchIDs
              : [...existingBatchIDs, historyItem.id];
            const nextGridOpen = gridWasOpen;
            const batchResults = state.activeWorkspaceId === snapshot.workspaceId
              ? [...state.batchResults, historyItem]
              : state.batchResults;
            return {
              history: trimmed,
              recentDurations: rd,
              workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, {
                currentImageId: historyItem.id,
                batchResultIds: nextBatchIDs,
                resultGridOpen: nextGridOpen,
              }),
              ...(state.activeWorkspaceId === snapshot.workspaceId
                ? {
                    currentImage: currentItem,
                    batchResults,
                    resultGridOpen: nextGridOpen,
                    maskDataURL: null,
                    annotations: [],
                    tool: "pan",
                  }
                : {}),
            } as Partial<StudioState>;
          });
          persistTrimmedHistory(trimmed);
          persistHistoryItem(historyItem).catch(() => undefined);
          // 桌面通知 —— 点击拉前台 + 直达详情抽屉
          if (willNotify) {
            tryNotify("FHL Studio · 已完成", r.prompt ?? "", () => {
              store.getState().openResultDetail(historyItem);
            });
          }
          store.getState().pushToast(
            totalNow > 1
              ? `已完成 (${completedNow}/${totalNow}) · ${elapsedSec.toFixed(0)}s`
              : `已${historyItem.mode === "edit" ? "编辑" : "生成"} · ${elapsedSec.toFixed(0)}s`,
            "success",
            6000,
            { label: "查看详情", onClick: () => store.getState().openResultDetail(historyItem) },
          );
          // 首次成功生图 → 延迟 2s 弹 GitHub Star 引导。localStorage 标志一旦
          // 写入就再也不弹(无论用户点 star 还是关闭)。延迟是为了让用户先看
          // 到图,然后再被礼貌打扰。
          try {
            if (!isMac
                && localStorage.getItem(STAR_PROMPTED_KEY) !== "1"
                && !store.getState().starPromptOpen) {
              setTimeout(() => {
                const snapshot = store.getState();
                const overlayBusy =
                  snapshot.upstreamModalOpen ||
                  snapshot.resultDetail !== null ||
                  document.querySelector('[role="dialog"]') !== null;
                if (!overlayBusy && localStorage.getItem(STAR_PROMPTED_KEY) !== "1") {
                  store.setState({ starPromptOpen: true, starPromptSource: "auto" });
                }
              }, 3500);
            }
          } catch { /* localStorage 不可用 → 静默跳过 */ }
        } catch (err: any) {
          const patch: WorkspacePatch = {
            errorMessage: `处理结果失败:${err?.message ?? err}`,
            errorRawPath: null,
          };
          store.setState((state) => ({
            workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, patch),
            ...(state.activeWorkspaceId === snapshot.workspaceId ? activeRuntimePatch(patch) : {}),
          } as Partial<StudioState>));
          removeFromRunning();
        }
      })();
    });
    offError = EventsOn(`error:${jobId}`, (e: { message: string; rawPath?: string }) => {
      cleanup();
      store.setState((state) => {
        const runtime = workspaceRuntimeFromState(state, snapshot.workspaceId);
        const prunedPreview = removeStreamPreview(runtime.streamPreviews, jobId);
        const patch: WorkspacePatch = {
          errorMessage: e?.message ?? "未知错误",
          errorRawPath: (typeof e?.rawPath === "string" && e.rawPath) ? e.rawPath : null,
          streamPreview: prunedPreview.streamPreview,
          streamPreviews: prunedPreview.streamPreviews,
        };
        return {
          workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, patch),
          ...(state.activeWorkspaceId === snapshot.workspaceId
            ? {
                ...activeRuntimePatch(patch),
                currentImage: restoreCurrentImageAfterPreviewError(state, jobId, {
                  workspaceId: snapshot.workspaceId,
                  mode: mode === "edit" ? "edit" : "generate",
                  prompt: payload.prompt,
                  size: snapshot.size,
                  quality: snapshot.quality,
                  outputFormat: snapshot.outputFormat,
                  currentImage: snapshot.currentImage,
                }),
              }
            : {}),
        } as Partial<StudioState>;
      });
      removeFromRunning();
    });
    const started = mode === "edit"
      ? await wailsEdit({ ...payload, requestedJobId: jobId } as backend.GenerateOptions)
      : await wailsGenerate({ ...payload, requestedJobId: jobId } as backend.GenerateOptions);
    if (started.jobId && started.jobId !== jobId) {
      cleanup();
      throw new Error(`job id 不一致: expected ${jobId}, got ${started.jobId}`);
    }
  } catch (e: any) {
    cleanup();
    const patch: WorkspacePatch = {
      errorMessage: `提交失败:${e?.message ?? e}`,
      errorRawPath: null,
    };
    store.setState((state) => {
      const runtime = workspaceRuntimeFromState(state, snapshot.workspaceId);
      const nextMeta = { ...state.runningJobMeta };
      delete nextMeta[jobId];
      const remaining = runtime.runningJobs.filter((id) => id !== jobId);
      const prunedPreview = removeStreamPreview(runtime.streamPreviews, jobId);
      const nextPatch: WorkspacePatch = {
        ...patch,
        runningJobs: remaining,
        jobsTotal: runtime.jobsTotal,
        jobsCompleted: runtime.jobsCompleted,
        progress: remaining.length === 0 ? null : runtime.progress,
        streamPreview: remaining.length === 0 ? null : prunedPreview.streamPreview,
        streamPreviews: remaining.length === 0 ? {} : prunedPreview.streamPreviews,
        lastLogLine: remaining.length === 0 ? "" : runtime.lastLogLine,
      };
      return {
        runningJobMeta: nextMeta,
        workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, nextPatch),
        ...(state.activeWorkspaceId === snapshot.workspaceId ? activeRuntimePatch(nextPatch) : {}),
      } as Partial<StudioState>;
    });
  }
}

export { tempDataURLFromB64, writeBase64ToTempFile };

async function materializeHistoryItem(item: HistoryItem): Promise<HistoryItem> {
  return materializeHistoryItemRuntime(item, {
    setState: (fn) => useStudioStore.setState((state) => fn(state)),
  });
}

async function ensureFullHistoryItem(item: HistoryItem | null): Promise<HistoryItem | null> {
  return ensureFullHistoryItemRuntime(item, {
    setState: (fn) => useStudioStore.setState((state) => fn(state)),
  });
}

useStudioStore.subscribe((state, prevState) => {
  const workspaceSessionChanged =
    state.activeWorkspaceId !== prevState.activeWorkspaceId
    || state.workspaces !== prevState.workspaces
    || state.prompt !== prevState.prompt
    || state.negativePrompt !== prevState.negativePrompt
    || state.mode !== prevState.mode
    || state.size !== prevState.size
    || state.quality !== prevState.quality
    || state.outputFormat !== prevState.outputFormat
    || state.seed !== prevState.seed
    || state.batchCount !== prevState.batchCount
    || state.styleTag !== prevState.styleTag
    || state.sources !== prevState.sources
    || state.currentImage !== prevState.currentImage
    || state.batchResults !== prevState.batchResults
    || state.resultGridOpen !== prevState.resultGridOpen
    || state.runningJobs !== prevState.runningJobs
    || state.jobsTotal !== prevState.jobsTotal
    || state.jobsCompleted !== prevState.jobsCompleted
    || state.progress !== prevState.progress
    || state.streamPreview !== prevState.streamPreview
    || state.streamPreviews !== prevState.streamPreviews
    || state.lastLogLine !== prevState.lastLogLine
    || state.errorMessage !== prevState.errorMessage
    || state.errorRawPath !== prevState.errorRawPath;
  if (!workspaceSessionChanged) return;
  persistWorkspaceSessionFromState(state);
});
