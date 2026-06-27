import { create } from "zustand";
import {
  BuildBatchOutputPath,
  EventsOn,
  EventsOff,
  Generate as wailsGenerate,
  Edit as wailsEdit,
  OptimizePrompt as wailsOptimizePrompt,
  ReversePrompt as wailsReversePrompt,
  Cancel as wailsCancel,
  ImportImageFromB64,
  ReadImageAsBase64,
  GetOutputDir,
  DeleteStoredAPIKey,
  GetStoredAPIKey,
  SetStoredAPIKey,
  RegisterMediaAsset,
  RegisterImportedImageAsset,
  ReadTextFile,
  SaveImagePathToDir,
  SetOutputDir,
  SyncMaterialGroupToOutput,
  detectHostKind,
  OpenMaterialSyncDir,
  probeCurrentUpstream,
  setKernelRuntimeMode,
} from "../platform/runtime/host";
import {
  listBrowserJobGroups,
  submitBrowserJobGroup,
  subscribeToBrowserJob,
} from "../platform/runtime/browserJobClient";
import { isTransientGenerationFailureText } from "../platform/runtime/remote-kernel/common.ts";
import {
  canUseAndroidJobs,
  listAndroidJobGroups,
  submitAndroidJobGroup,
  subscribeToAndroidJob,
} from "../platform/runtime/androidJobClient";
import type { backend } from "../../wailsjs/go/models";
import {
  APIMode,
  BatchProcessAutoAspectResolution,
  BatchTaskRecord,
  type EditSourceMode,
  HistoryItem,
  JobGroupSnapshot,
  KernelRuntimeMode,
  MaterialGroup,
  MaterialGroupKind,
  MaterialRef,
  Mode,
  OutputFormatValue,
  PanoramaPastebackAlignment,
  PanoramaProjectRef,
  Preset,
  ProgressInfo,
  QualityValue,
  RequestPolicy,
  SizeValue,
  SourceImage,
  StreamPreviewMap,
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
  fetchRunningHubResultImage,
  recoverRunningHubTask,
  runningHubSizeSelection,
  type RunningHubBridgeTask,
} from "../lib/runninghubAPI";
import {
  extractAPIMartTaskIdFromText,
  fetchAPIMartResultImage,
  recoverAPIMartTask,
  type APIMartRecoveredTask,
} from "../lib/apimartAPI";
import {
  apiModeRequiresDirectAPIKey,
  DEFAULT_CONCURRENCY_LIMIT,
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
  defaultBatchProcessConfig,
  normalizeAPIMode,
  normalizeBatchCount,
  normalizeBatchProcessConfig,
  normalizeConcurrencyLimit,
  normalizeEditSourceMode,
  patchWorkspaceRuntime,
  resetWorkspaceSourcesAfterServiceRestart,
  workspaceRuntimeFromState,
  workspaceRunningCount,
  type APIModeValue,
  type RunningJobMeta,
  type WorkspacePatch,
} from "./workspaceRuntime";
import {
  normalizeSizeSelection,
} from "../components/panel/sizeCapabilities";
import { buildMacWorkspacePreview, readPreviewScenario } from "../app/dev/previewData";
import {
  buildAutoAspectSizeFromDimensions,
  autoAspectSizeInputFromState,
  normalizedReferenceSlotIndex,
  sourceDimensionsFromMetadata,
  syncSharedEditAutoAspect,
  type SourceDimensions,
} from "./sharedEditAutoAspect";
import { base64ToBlob, getImageDimensions, getImageDimensionsFromBase64 } from "../lib/images";
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
import type { ModeConfig, PromptOptimizeRequest, PromptReverseRequest, Stroke, StudioState, UndoEntry } from "./studioStore.types";
import type { MaterialOutputSyncItemLike } from "../platform/runtime/hostTypes";
import {
  historyItemsByIds,
  cryptoIDFallback,
  ensureFullHistoryItem as ensureFullHistoryItemRuntime,
  fileToBase64,
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
import { buildEffectivePrompt } from "./promptComposition";
import {
  continuousSlotIndex,
  continuousRuntimeStateFromJobGroups,
  filterVisibleJobGroupsForWorkspace,
  isJobGroupVisibleForWorkspace,
  mergeWorkspaceJobGroup,
  replaceWorkspaceJobGroups,
  runningJobIdsFromGroup,
  runtimeStateFromJobGroups,
} from "./browserJobs";
import {
  createBatchTaskRecord,
  batchTaskHasResult,
  findTaskForJobSlot,
  findTaskForSlot,
  isRetryableBatchTask,
  localQueuedTasksForWorkspace,
  markMissingJobTasksInterrupted,
  nextSlotIndexFromTasks,
  runningOrSubmittedTaskCountForWorkspace,
  slotIndexForGroupSlot,
  sortedBatchTasksForCurrentView,
  sortedBatchTasksForWorkspace,
  updateTaskForSlot,
  updateTaskFromHistoryItem,
  updateTasksFromJobGroup,
  upsertBatchTasks,
} from "./batchTaskRecords";
import {
  findPanoramaRoundtripRef,
  buildPanoramaProjectRef,
  buildPanoramaProjectRefFromRoundtrip,
  pastePanoramaRoundtripBase64,
  type PanoramaPastebackMaskInput,
  resolvePanoramaRoundtripRef,
  resolvePanoramaProjectRef,
} from "../panorama/core";
import {
  createMaterialGroupInput,
  loadMaterialGroups,
  materialRefKey,
  mergeSources,
  persistMaterialGroups,
  refsFromSources,
  uniqueMaterialGroupName,
  uniqueMaterialRefs,
} from "./materialLibrary";
import { sourceImagesForHistory, sourceImagesFromPaths } from "./historySourceImages";
import { sourceContextPatchFromBatchTask } from "./sourceContextSelection";
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

type BrowserSourceIdentity = {
  batchSourcePath?: string | null;
  size?: SizeValue;
  sourceImages?: SourceImage[];
  panoramaRoundtrip?: HistoryItem["panoramaRoundtrip"];
};

const browserJobSubscriptions = new Map<string, () => void>();
const browserJobRefreshes = new Map<string, Promise<void>>();
const ENABLE_LEGACY_PROFILE_MIGRATION = false;
const STAR_PROMPTED_KEY = storageKey("gptcodex.starPrompted");
const KERNEL_RUNTIME_MODE_KEY = storageKey("gptcodex.kernelRuntimeMode");
const OUTPUT_FORMAT_KEY = storageKey("gptcodex.outputFormat");
const PROMPT_HISTORY_KEY = storageKey("gptcodex.promptHistory");
const PRESETS_KEY = storageKey("gptcodex.presets");
const CONCURRENCY_DEFAULT_V4_MIGRATION_KEY = storageKey("gptcodex.profileConcurrencyDefaultV4Migrated");
const THEME_KEY = storageKey("gptcodex.theme");
const FONT_SCALE_KEY = storageKey("gptcodex.fontScale");
const OUTPUT_DIR_KEY = storageKey("gptcodex.outputDir");
const INITIAL_HISTORY_LOAD = 48;
const HISTORY_MEDIA_HYDRATE_CONCURRENCY = 4;
const PRESSURE_PROMPT_FRUITS = [
  "mango", "dragon fruit", "citrus", "apple", "pear", "peach", "lychee", "pineapple",
  "watermelon", "kiwi", "pomegranate", "grape", "fig", "plum", "strawberry", "papaya",
];
const PRESSURE_PROMPT_SCENES = [
  "rainy night market stall", "sunlit street vendor portrait", "neon fruit shop window",
  "cinematic old town alley", "editorial fashion market scene", "documentary closeup",
  "lantern-lit tea counter", "busy tropical grocery stand", "misty morning bazaar",
  "high-end product display", "handheld street photo", "soft studio marketplace setup",
];
const PRESSURE_PROMPT_STYLES = [
  "realistic 85mm lens", "cinematic shallow depth of field", "crisp commercial detail",
  "natural skin texture", "warm film color", "blue-orange contrast lighting",
  "premium editorial composition", "soft volumetric light", "high dynamic range realism",
];

function pressurePrompt(index: number) {
  const fruit = PRESSURE_PROMPT_FRUITS[index % PRESSURE_PROMPT_FRUITS.length];
  const scene = PRESSURE_PROMPT_SCENES[Math.floor(index / PRESSURE_PROMPT_FRUITS.length) % PRESSURE_PROMPT_SCENES.length];
  const style = PRESSURE_PROMPT_STYLES[index % PRESSURE_PROMPT_STYLES.length];
  const serial = String(index + 1).padStart(3, "0");
  return `pressure ${serial} ${fruit} ${scene}, vertical 9:16, ${style}, detailed realistic image, clean composition`;
}

async function sourceFromHistoryForMaterial(item: HistoryItem): Promise<SourceImage | null> {
  const full = await materializeHistoryItem(item).catch(() => null);
  if (!full?.savedPath) return null;
  let previewItem = full;
  if (!previewItem.previewUrl && !previewItem.previewBlob && !previewItem.imageB64) {
    const ref = await RegisterImportedImageAsset(full.savedPath).catch(() => null);
    if (ref) previewItem = withMediaAssetRef(previewItem, ref);
  }
  return {
    path: full.savedPath,
    name: full.savedPath.split(/[\\/]/).pop() ?? "source.png",
    size: 0,
    imageBlob: previewItem.previewUrl ? null : (previewItem.previewBlob ?? previewItem.imageBlob ?? null),
    imageB64: previewItem.previewUrl ? undefined : previewItem.imageB64,
    previewUrl: previewItem.previewUrl,
  };
}

let deferredHistoryLoadPromise: Promise<void> | null = null;
const startingContinuousTaskIds = new Set<string>();
const autoRetryTimersByTaskId = new Map<string, ReturnType<typeof setTimeout>>();
const recordedTransientFailureSignatures = new Set<string>();
const transientFailureWindowsByProfile = new Map<string, number[]>();
const temporaryConcurrencyCapsByProfile = new Map<string, { limit: number; expiresAt: number; timer?: ReturnType<typeof setTimeout> }>();
const temporaryConcurrencyDowngradeCountsByProfile = new Map<string, number>();
const AUTO_RETRY_DELAY_MS = 15_000;
const AUTO_RETRY_MAX_COUNT = 1;
const TRANSIENT_FAILURE_WINDOW_MS = 2 * 60_000;
const TEMPORARY_CONCURRENCY_CAP_MS = 10 * 60_000;

function persistWorkspaceSessionFromState(state: StudioState) {
  const workspaces = saveActiveWorkspaceSnapshot(state).map((workspace) => ({
    ...workspace,
    lastPayload: null,
  }));
  persistWorkspaceSession(state.activeWorkspaceId, workspaces, state.batchTasksById);
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
  // we re-purpose the savedPath field that comes back with every result 闂?it's
  // already on disk under UserConfigDir/image-studio/images. So callers should
  // use item.savedPath; this helper exists for parity and is currently unused.
  void b64;
  return "";
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

async function loadHistoryItemAsHtmlImage(item: HistoryItem): Promise<HTMLImageElement> {
  const full = await ensureFullHistoryItem(item) ?? item;
  const source = String(full?.imageB64 || "").trim()
    ? tempDataURLFromB64(String(full.imageB64))
    : String(full?.fullUrl || full?.previewUrl || "").trim();
  if (!source && full?.savedPath) {
    const imageB64 = await ReadImageAsBase64(full.savedPath).catch(() => "");
    if (imageB64) return loadHtmlImage(tempDataURLFromB64(imageB64));
  }
  if (!source) throw new Error("No renderable image source available");
  return loadHtmlImage(source);
}

async function loadSavedPathAsHtmlImage(path: string): Promise<HTMLImageElement> {
  const imageB64 = await ReadImageAsBase64(path).catch(() => "");
  if (!imageB64) throw new Error(`Cannot read image bytes from ${path}`);
  return loadHtmlImage(tempDataURLFromB64(imageB64));
}

function panoramaProjectFromEditSources(
  sourceImages: SourceImage[] | undefined,
  roundtrip: HistoryItem["panoramaRoundtrip"],
): PanoramaProjectRef | undefined {
  const sourceProject = (sourceImages ?? []).find((source) => source.panoramaProject)?.panoramaProject;
  if (sourceProject?.sourceHistoryId) {
    return {
      ...sourceProject,
      role: "edited-shot",
    };
  }
  return buildPanoramaProjectRefFromRoundtrip(roundtrip, "edited-shot");
}

function syntheticPanoramaResultItem(
  imported: Awaited<ReturnType<typeof ImportImageFromB64>>,
  imageB64: string,
  source: HistoryItem,
  panoramaSource: Pick<HistoryItem, "id" | "savedPath" | "width" | "height" | "previewWidth" | "previewHeight" | "panoramaProject"> | null,
): HistoryItem {
  const previewBacked = !!(imported.previewUrl || imported.imageId);
  const width = Number.isFinite(Number(imported.width)) ? Number(imported.width) : source.width;
  const height = Number.isFinite(Number(imported.height)) ? Number(imported.height) : source.height;
  const panoramaSourcePath = String(panoramaSource?.savedPath || "").trim();
  const sourceProject = resolvePanoramaProjectRef(source);
  const pastedProject = sourceProject?.sourceHistoryId
    ? {
        sourceHistoryId: sourceProject.sourceHistoryId,
        sourcePath: sourceProject.sourcePath,
        role: "pasted-panorama" as const,
        shotHistoryId: sourceProject.shotHistoryId,
        editedShotHistoryId: source.id,
      }
    : buildPanoramaProjectRefFromRoundtrip(resolvePanoramaRoundtripRef(source), "pasted-panorama", {
        editedShotHistoryId: source.id,
      });
  const panoramaSourceImage = panoramaSourcePath
    ? {
        path: panoramaSourcePath,
        name: panoramaSourcePath.split(/[\\/]/).pop() || "source.png",
        size: 0,
        width: Number.isFinite(Number(panoramaSource?.width))
          ? Number(panoramaSource?.width)
          : (Number.isFinite(Number(panoramaSource?.previewWidth)) ? Number(panoramaSource?.previewWidth) : undefined),
        height: Number.isFinite(Number(panoramaSource?.height))
          ? Number(panoramaSource?.height)
          : (Number.isFinite(Number(panoramaSource?.previewHeight)) ? Number(panoramaSource?.previewHeight) : undefined),
        panoramaProject: panoramaSource?.panoramaProject || (panoramaSource?.id
          ? buildPanoramaProjectRef(panoramaSource, "source")
          : undefined),
      } satisfies SourceImage
    : null;
  return {
    id: cryptoIDFallback(),
    imageId: imported.imageId || undefined,
    previewUrl: imported.previewUrl || undefined,
    fullUrl: imported.imageId ? `/media/full/${imported.imageId}` : undefined,
    imageB64: previewBacked ? undefined : imageB64,
    imageBlob: null,
    previewBlob: null,
    previewOnly: true,
    prompt: source.prompt,
    revisedPrompt: source.revisedPrompt,
    mode: source.mode,
    apiMode: source.apiMode,
    apiProfileId: source.apiProfileId,
    apiProfileName: source.apiProfileName,
    size: `${Math.max(1, Number(width || 0))}x${Math.max(1, Number(height || 0))}` as SizeValue,
    quality: source.quality,
    outputFormat: "png",
    parentId: source.savedPath || source.parentId,
    createdAt: Date.now(),
    seed: source.seed,
    negativePrompt: source.negativePrompt,
    styleTag: source.styleTag,
    elapsedSec: source.elapsedSec,
    savedPath: imported.path,
    sourceImages: panoramaSourceImage ? [panoramaSourceImage] : undefined,
    panoramaProject: pastedProject,
    width,
    height,
    previewWidth: Number.isFinite(Number(imported.previewWidth)) ? Number(imported.previewWidth) : undefined,
    previewHeight: Number.isFinite(Number(imported.previewHeight)) ? Number(imported.previewHeight) : undefined,
  };
}

function externalPanoramaPastebackItem(
  imported: Awaited<ReturnType<typeof ImportImageFromB64>>,
  file: File,
  imageB64: string,
  anchor: HistoryItem,
  roundtrip: NonNullable<HistoryItem["panoramaRoundtrip"]>,
  dimensions: { w: number; h: number },
): HistoryItem {
  const itemId = cryptoIDFallback();
  const previewBacked = !!(imported.previewUrl || imported.imageId);
  const legacyB64 = previewBacked ? "" : (imported.imageB64 || imageB64);
  const legacyBlob = legacyB64 ? base64ToBlob(legacyB64, file.type || "image/png") : null;
  const width = Number.isFinite(Number(imported.width))
    ? Number(imported.width)
    : (Number.isFinite(Number(imported.previewWidth)) ? Number(imported.previewWidth) : dimensions.w);
  const height = Number.isFinite(Number(imported.height))
    ? Number(imported.height)
    : (Number.isFinite(Number(imported.previewHeight)) ? Number(imported.previewHeight) : dimensions.h);
  const anchorProject = resolvePanoramaProjectRef(anchor);
  const shotHistoryId = anchorProject?.shotHistoryId || anchor.id;
  const panoramaProject = anchorProject?.sourceHistoryId
    ? {
        sourceHistoryId: anchorProject.sourceHistoryId,
        sourcePath: anchorProject.sourcePath,
        role: "edited-shot" as const,
        shotHistoryId,
        editedShotHistoryId: itemId,
      }
    : buildPanoramaProjectRefFromRoundtrip(roundtrip, "edited-shot", {
        shotHistoryId,
        editedShotHistoryId: itemId,
      });
  const sourceImage: SourceImage = {
    path: imported.path,
    name: file.name,
    size: file.size,
    width,
    height,
    previewUrl: imported.previewUrl || undefined,
    imageBlob: legacyBlob,
    imageB64: legacyB64 || undefined,
    panoramaRoundtrip: roundtrip,
    panoramaProject,
  };
  return {
    id: itemId,
    imageId: imported.imageId || undefined,
    previewUrl: imported.previewUrl || undefined,
    fullUrl: imported.imageId ? `/media/full/${imported.imageId}` : undefined,
    imageB64: legacyB64 || undefined,
    imageBlob: null,
    previewBlob: legacyBlob,
    previewOnly: previewBacked,
    prompt: `(外部贴回)${file.name}`,
    mode: "edit",
    apiMode: anchor.apiMode,
    apiProfileId: anchor.apiProfileId,
    apiProfileName: anchor.apiProfileName,
    size: `${Math.max(1, Number(width || dimensions.w))}x${Math.max(1, Number(height || dimensions.h))}` as SizeValue,
    quality: anchor.quality || "medium",
    outputFormat: "png",
    parentId: anchor.savedPath || anchor.parentId,
    createdAt: Date.now(),
    savedPath: imported.path,
    sourceImages: [sourceImage],
    panoramaRoundtrip: roundtrip,
    panoramaProject,
    width,
    height,
    previewWidth: Number.isFinite(Number(imported.previewWidth)) ? Number(imported.previewWidth) : width,
    previewHeight: Number.isFinite(Number(imported.previewHeight)) ? Number(imported.previewHeight) : height,
  };
}

function runningHubRecoveryHistoryId(taskId: string): string {
  return `runninghub-recovered:${taskId}`;
}

function apimartRecoveryHistoryId(taskId: string): string {
  return `apimart-recovered:${taskId}`;
}

function parseRunningHubTimestamp(value: string | null | undefined): number | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const millis = Date.parse(normalized);
  return Number.isFinite(millis) ? millis : null;
}

function runningHubElapsedSec(task: RunningHubBridgeTask): number | undefined {
  const startedAt = parseRunningHubTimestamp(task.startedAt);
  const completedAt = parseRunningHubTimestamp(task.completedAt || task.updatedAt);
  if (startedAt === null || completedAt === null || completedAt < startedAt) return undefined;
  return Math.max(0, Math.round((completedAt - startedAt) / 100) / 10);
}

function sourceImagesForRecoveredTask(task: Pick<BatchTaskRecord, "mode" | "sourceImages" | "sourceImagePaths">): SourceImage[] | undefined {
  const sourceImages = sourceImagesForTask(task);
  return sourceImages.length > 0 ? sourceImages : undefined;
}

function recoveredRunningHubHistoryItem(
  task: BatchTaskRecord,
  recoveredTask: RunningHubBridgeTask,
  imported: Awaited<ReturnType<typeof ImportImageFromB64>>,
  imageB64: string,
): HistoryItem {
  const previewBacked = !!(imported.previewUrl || imported.imageId);
  const width = Number.isFinite(Number(imported.width)) ? Number(imported.width) : undefined;
  const height = Number.isFinite(Number(imported.height)) ? Number(imported.height) : undefined;
  const sourceImages = sourceImagesForRecoveredTask(task);
  const panoramaRoundtrip = task.panoramaRoundtrip ?? panoramaRoundtripFromSources(sourceImages);
  const createdAt = parseRunningHubTimestamp(recoveredTask.completedAt || recoveredTask.updatedAt || recoveredTask.startedAt) || Date.now();
  const parentId = String(task.batchSourcePath || task.sourceImagePaths?.[0] || "").trim() || undefined;
  return {
    id: runningHubRecoveryHistoryId(task.id),
    imageId: imported.imageId || undefined,
    previewUrl: imported.previewUrl || undefined,
    fullUrl: imported.imageId ? `/media/full/${imported.imageId}` : undefined,
    imageB64: previewBacked ? undefined : imageB64,
    imageBlob: null,
    previewBlob: null,
    previewOnly: true,
    prompt: task.prompt,
    revisedPrompt: "",
    mode: task.mode,
    apiMode: task.apiMode,
    apiProfileId: task.apiProfileId,
    apiProfileName: task.apiProfileName,
    size: task.size,
    quality: task.quality,
    outputFormat: task.outputFormat,
    parentId,
    createdAt,
    seed: task.seed,
    negativePrompt: task.negativePrompt,
    styleTag: task.styleTag,
    elapsedSec: runningHubElapsedSec(recoveredTask) ?? task.elapsedSec,
    batchIndex: task.slotIndex,
    savedPath: imported.path,
    sourceImages,
    panoramaRoundtrip,
    panoramaProject: panoramaProjectFromEditSources(sourceImages, panoramaRoundtrip),
    width,
    height,
    previewWidth: Number.isFinite(Number(imported.previewWidth)) ? Number(imported.previewWidth) : undefined,
    previewHeight: Number.isFinite(Number(imported.previewHeight)) ? Number(imported.previewHeight) : undefined,
    rawPath: task.rawPath,
  };
}

function recoveredAPIMartHistoryItem(
  task: BatchTaskRecord,
  recoveredTask: APIMartRecoveredTask,
  imported: Awaited<ReturnType<typeof ImportImageFromB64>>,
  imageB64: string,
): HistoryItem {
  const previewBacked = !!(imported.previewUrl || imported.imageId);
  const width = Number.isFinite(Number(imported.width)) ? Number(imported.width) : undefined;
  const height = Number.isFinite(Number(imported.height)) ? Number(imported.height) : undefined;
  const sourceImages = sourceImagesForRecoveredTask(task);
  const panoramaRoundtrip = task.panoramaRoundtrip ?? panoramaRoundtripFromSources(sourceImages);
  const parentId = String(task.batchSourcePath || task.sourceImagePaths?.[0] || "").trim() || undefined;
  return {
    id: apimartRecoveryHistoryId(recoveredTask.taskId || task.id),
    imageId: imported.imageId || undefined,
    previewUrl: imported.previewUrl || undefined,
    fullUrl: imported.imageId ? `/media/full/${imported.imageId}` : undefined,
    imageB64: previewBacked ? undefined : imageB64,
    imageBlob: null,
    previewBlob: null,
    previewOnly: true,
    prompt: task.prompt,
    revisedPrompt: "",
    mode: task.mode,
    apiMode: task.apiMode,
    apiProfileId: task.apiProfileId,
    apiProfileName: task.apiProfileName,
    size: task.size,
    quality: task.quality,
    outputFormat: task.outputFormat,
    parentId,
    createdAt: Date.now(),
    seed: task.seed,
    negativePrompt: task.negativePrompt,
    styleTag: task.styleTag,
    elapsedSec: task.elapsedSec,
    batchIndex: task.slotIndex,
    savedPath: imported.path,
    sourceImages,
    panoramaRoundtrip,
    panoramaProject: panoramaProjectFromEditSources(sourceImages, panoramaRoundtrip),
    width,
    height,
    previewWidth: Number.isFinite(Number(imported.previewWidth)) ? Number(imported.previewWidth) : undefined,
    previewHeight: Number.isFinite(Number(imported.previewHeight)) ? Number(imported.previewHeight) : undefined,
    rawPath: task.rawPath,
  };
}

async function recoverableAPIMartTaskId(task: BatchTaskRecord): Promise<string> {
  const direct = extractAPIMartTaskIdFromText(task.apimartTaskId);
  if (direct) return direct;
  const fromMessage = extractAPIMartTaskIdFromText(`${task.errorMessage || ""}\n${task.lastLogLine || ""}\n${task.rawPath || ""}`);
  if (fromMessage) return fromMessage;
  const rawPath = String(task.rawPath || "").trim();
  if (!rawPath) return "";
  const raw = await ReadTextFile(rawPath).catch(() => "");
  return extractAPIMartTaskIdFromText(raw);
}

async function autoPastePanoramaRoundtripResult(
  item: HistoryItem,
  options: {
    workspaceId: string;
    selectAsCurrent?: boolean;
    alignment?: PanoramaPastebackAlignment | null;
    pasteMask?: PanoramaPastebackMaskInput | null;
  },
): Promise<HistoryItem | null> {
  const roundtrip = resolvePanoramaRoundtripRef(item);
  if (!roundtrip) return null;
  let sourceItem = roundtrip.sourceHistoryId
    ? useStudioStore.getState().history.find((entry) => entry.id === roundtrip.sourceHistoryId) ?? null
    : null;
  if (!sourceItem && roundtrip.sourcePath) {
    sourceItem = {
      id: `panorama-source:${roundtrip.sourceHistoryId || roundtrip.sourcePath}`,
      prompt: item.prompt,
      revisedPrompt: item.revisedPrompt,
      mode: "edit",
      apiMode: item.apiMode,
      apiProfileId: item.apiProfileId,
      apiProfileName: item.apiProfileName,
      size: `${roundtrip.roundtripState.source_erp.width}x${roundtrip.roundtripState.source_erp.height}`,
      quality: item.quality,
      outputFormat: "png",
      createdAt: item.createdAt,
      savedPath: roundtrip.sourcePath,
      width: roundtrip.roundtripState.source_erp.width,
      height: roundtrip.roundtripState.source_erp.height,
    };
  }
  if (!sourceItem) throw new Error("Panorama source image is missing");
  const [erpImage, rectImage] = await Promise.all([
    sourceItem.savedPath
      ? loadSavedPathAsHtmlImage(sourceItem.savedPath)
      : loadHistoryItemAsHtmlImage(sourceItem),
    loadHistoryItemAsHtmlImage(item),
  ]);
  const pasted = pastePanoramaRoundtripBase64(erpImage, rectImage, roundtrip.roundtripState, options.alignment, options.pasteMask ?? null);
  const imported = await ImportImageFromB64(pasted.imageB64, `panorama-roundtrip-${Date.now()}.png`);
  const ref = await RegisterImportedImageAsset(imported.path).catch(() => null);
  const nextItem = ref
    ? withMediaAssetRef(syntheticPanoramaResultItem(imported, pasted.imageB64, item, sourceItem), ref)
    : syntheticPanoramaResultItem(imported, pasted.imageB64, item, sourceItem);
  useStudioStore.setState((state) => {
    const history = trimHistory([nextItem, ...state.history.filter((entry) => entry.id !== nextItem.id)]);
    const workspacePatch: WorkspacePatch = options.selectAsCurrent
      ? {
          currentImageId: nextItem.id,
          resultGridOpen: false,
          historyGalleryOpen: false,
        }
      : {};
    return {
      history,
      workspaces: patchWorkspaceRuntime(state.workspaces, options.workspaceId, workspacePatch),
      ...(options.selectAsCurrent && state.activeWorkspaceId === options.workspaceId
        ? {
            currentImage: nextItem,
            resultGridOpen: false,
            historyGalleryOpen: false,
            historyGallerySinglePreviewId: null,
            compareB: null,
            maskDataURL: null,
            annotations: [],
            tool: "pan",
          }
        : {}),
    } as Partial<StudioState>;
  });
  await persistHistoryItem(nextItem).catch(() => undefined);
  persistTrimmedHistory(useStudioStore.getState().history);
  return nextItem;
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
  if (apiMode === "runninghub") return false;
  if (isBrowserTaskProxyMode()) return true;
  return isAndroidTaskProxyMode() && apiMode !== "images";
}

function effectiveAPIModeForSubmit(_mode: Mode, apiMode: APIMode): APIMode {
  return apiMode;
}

function apiProfileSnapshotForSubmit(profile: UpstreamProfile | undefined, activeProfileId: string) {
  const apiProfileId = String(profile?.id || activeProfileId || "").trim();
  const apiProfileName = String(profile?.name || "").trim();
  return {
    apiProfileId: apiProfileId || undefined,
    apiProfileName: apiProfileName || undefined,
  };
}

function transientProfileKey(apiMode: APIModeValue, apiProfileId?: string) {
  return `${apiMode}:${String(apiProfileId || "default").trim() || "default"}`;
}

function clearAutoRetryTimer(taskId: string) {
  const timer = autoRetryTimersByTaskId.get(taskId);
  if (!timer) return;
  clearTimeout(timer);
  autoRetryTimersByTaskId.delete(taskId);
}

function activeProfileForConcurrency(state: StudioState, apiProfileId?: string) {
  const cleanId = String(apiProfileId || "").trim();
  if (cleanId) {
    const matched = state.profiles.find((profile) => profile.id === cleanId);
    if (matched) return matched;
  }
  return state.profiles.find((profile) => profile.id === state.activeProfileId);
}

function effectiveConcurrencyLimitForProfile(
  state: StudioState,
  apiMode: APIModeValue,
  apiProfileId?: string,
) {
  const profile = activeProfileForConcurrency(state, apiProfileId);
  const baseLimit = normalizeConcurrencyLimit(profile?.concurrencyLimit ?? 0);
  const profileId = profile?.id || apiProfileId || state.activeProfileId;
  const key = transientProfileKey(apiMode, profileId);
  const cap = temporaryConcurrencyCapsByProfile.get(key);
  if (!cap) return baseLimit;
  const now = Date.now();
  if (cap.expiresAt <= now) {
    if (cap.timer) clearTimeout(cap.timer);
    temporaryConcurrencyCapsByProfile.delete(key);
    return baseLimit;
  }
  return baseLimit > 0 ? Math.min(baseLimit, cap.limit) : cap.limit;
}

function recordTransientFailureForTask(task: BatchTaskRecord, reason: string): number | null {
  if (!isTransientGenerationFailureText(reason, task.errorMessage, task.lastLogLine)) return null;
  const signature = `${task.id}:${task.status}:${task.updatedAt}:${reason}`;
  if (recordedTransientFailureSignatures.has(signature)) return null;
  recordedTransientFailureSignatures.add(signature);
  const now = Date.now();
  const key = transientProfileKey(normalizeAPIMode(task.apiMode), task.apiProfileId);
  const recent = (transientFailureWindowsByProfile.get(key) ?? [])
    .filter((time) => now - time <= TRANSIENT_FAILURE_WINDOW_MS);
  recent.push(now);
  transientFailureWindowsByProfile.set(key, recent);
  const lastDowngradeCount = temporaryConcurrencyDowngradeCountsByProfile.get(key) ?? 0;
  if (recent.length - lastDowngradeCount < 2) return null;

  const state = useStudioStore.getState();
  const profile = activeProfileForConcurrency(state, task.apiProfileId);
  const baseLimit = normalizeConcurrencyLimit(profile?.concurrencyLimit ?? 0);
  const existing = temporaryConcurrencyCapsByProfile.get(key);
  const currentEffective = existing && existing.expiresAt > now
    ? existing.limit
    : (baseLimit > 0 ? baseLimit : 0);
  const nextLimit = currentEffective > 0
    ? Math.max(1, Math.floor(currentEffective / 2))
    : 4;
  if (existing && existing.expiresAt > now && nextLimit >= existing.limit) return null;
  if (existing?.timer) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    temporaryConcurrencyCapsByProfile.delete(key);
    temporaryConcurrencyDowngradeCountsByProfile.delete(key);
  }, TEMPORARY_CONCURRENCY_CAP_MS);
  temporaryConcurrencyCapsByProfile.set(key, {
    limit: nextLimit,
    expiresAt: now + TEMPORARY_CONCURRENCY_CAP_MS,
    timer,
  });
  temporaryConcurrencyDowngradeCountsByProfile.set(key, recent.length);
  return nextLimit;
}

function retryContextFromOriginalTask(state: StudioState, task: BatchTaskRecord) {
  const profile = task.apiProfileId
    ? state.profiles.find((entry) => entry.id === task.apiProfileId)
    : undefined;
  const apiMode = normalizeAPIMode(task.apiMode);
  const requestPolicy = task.requestPolicy ?? profile?.requestPolicy ?? state.requestPolicy;
  const textModelID = task.textModelID || profile?.textModelID || state.textModelID;
  const imageModelID = task.imageModelID || profile?.imageModelID || state.imageModelID;
  return {
    activeProfile: profile,
    apiMode,
    apiProfileSnapshot: apiProfileSnapshotForSubmit(profile, task.apiProfileId || state.activeProfileId),
    baseURL: profile?.baseURL ?? state.baseURL,
    requestPolicy,
    textModelID,
    imageModelID,
    imagesNewAPICompat: apiMode === "images" && (task.imagesNewAPICompat ?? profile?.imagesNewAPICompat ?? state.imagesNewAPICompat) === true,
    concurrencyLimit: effectiveConcurrencyLimitForProfile(state, apiMode, task.apiProfileId || profile?.id),
  };
}

async function apiKeyForProfileOrState(state: StudioState, apiProfileId?: string): Promise<string> {
  const cleanProfileId = String(apiProfileId || "").trim();
  if (!cleanProfileId) return state.apiKey;
  const stored = await GetStoredAPIKey(keyringUserFor(cleanProfileId)).catch(() => "");
  return stored;
}

function retrySubmitContextFromState(state: StudioState, mode: Mode) {
  const activeProfile = state.profiles.find((profile) => profile.id === state.activeProfileId);
  const apiMode = effectiveAPIModeForSubmit(mode, activeProfile?.apiMode ?? state.apiMode);
  const requestPolicy = activeProfile?.requestPolicy ?? state.requestPolicy;
  const textModelID = activeProfile?.textModelID ?? state.textModelID;
  const imageModelID = activeProfile?.imageModelID ?? state.imageModelID;
  return {
    activeProfile,
    apiMode,
    apiProfileSnapshot: apiProfileSnapshotForSubmit(activeProfile, state.activeProfileId),
    baseURL: activeProfile?.baseURL ?? state.baseURL,
    requestPolicy,
    textModelID,
    imageModelID,
    imagesNewAPICompat: apiMode === "images" && (activeProfile?.imagesNewAPICompat ?? state.imagesNewAPICompat) === true,
    concurrencyLimit: effectiveConcurrencyLimitForProfile(state, apiMode, activeProfile?.id || state.activeProfileId),
  };
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

function directoryFromPath(filePath: string): string {
  const normalized = String(filePath || "").trim().replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return index >= 0 ? normalized.slice(0, index) : "";
}

function buildBatchAutoAspectSize(
  resolution: "1k" | "2k" | "4k",
  dimensions: SourceDimensions,
  input: {
    apiMode: APIMode;
    requestPolicy: RequestPolicy;
    imageModelID?: string;
  },
): SizeValue | null {
  return buildAutoAspectSizeFromDimensions(
    resolution,
    dimensions.width,
    dimensions.height,
    input,
  );
}

async function resolveAutoAspectDimensions(source: {
  path?: string;
  width?: number;
  height?: number;
  previewWidth?: number;
  previewHeight?: number;
  imageBlob?: Blob | null;
  imageB64?: string | null;
}): Promise<SourceDimensions | null> {
  const cached = sourceDimensionsFromMetadata(source);
  if (cached) return cached;
  const direct = await getImageDimensions(source);
  if (direct?.w && direct?.h) {
    return { width: direct.w, height: direct.h };
  }
  const path = String(source.path || "").trim();
  if (!path) return null;
  const imageB64 = await ReadImageAsBase64(path).catch(() => "");
  const fromPath = imageB64 ? getImageDimensionsFromBase64(imageB64) : null;
  if (!fromPath?.w || !fromPath?.h) return null;
  return { width: fromPath.w, height: fromPath.h };
}

async function buildAutoAspectSizeForSource(
  resolution: "1k" | "2k" | "4k",
  source: {
    path?: string;
    width?: number;
    height?: number;
    previewWidth?: number;
    previewHeight?: number;
    imageBlob?: Blob | null;
    imageB64?: string | null;
  },
  input: {
    apiMode: APIMode;
    requestPolicy: RequestPolicy;
    imageModelID?: string;
  },
): Promise<SizeValue | null> {
  const dimensions = await resolveAutoAspectDimensions(source);
  return dimensions ? buildBatchAutoAspectSize(resolution, dimensions, input) : null;
}

function implicitEditAutoAspectSource(
  currentImage: Pick<HistoryItem, "savedPath" | "width" | "height" | "previewWidth" | "previewHeight" | "imageBlob" | "imageB64"> | null | undefined,
): RetryAutoAspectSource | null {
  if (!currentImage) return null;
  return {
    path: currentImage.savedPath || undefined,
    width: currentImage.width,
    height: currentImage.height,
    previewWidth: currentImage.previewWidth,
    previewHeight: currentImage.previewHeight,
    imageBlob: currentImage.imageBlob ?? null,
    imageB64: currentImage.imageB64 ?? null,
  };
}

type AutoAspectResolutionValue = Exclude<BatchProcessAutoAspectResolution, "">;
type RetryAutoAspectContext = Pick<BatchTaskRecord, "mode" | "autoAspectResolution" | "batchSourcePath" | "sourceImagePaths">;
type RetryAutoAspectSource = {
  path?: string;
  width?: number;
  height?: number;
  previewWidth?: number;
  previewHeight?: number;
  imageBlob?: Blob | null;
  imageB64?: string | null;
};

function normalizeAutoAspectResolutionValue(value: unknown): AutoAspectResolutionValue | undefined {
  return value === "1k" || value === "2k" || value === "4k" ? value : undefined;
}

function autoAspectPathKey(value: unknown): string {
  return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function findWorkspaceSourceForAutoAspect(workspace: Workspace | undefined, sourcePath: string): RetryAutoAspectSource | null {
  const key = autoAspectPathKey(sourcePath);
  if (!key || !workspace) return null;
  const sources: RetryAutoAspectSource[] = [
    ...(workspace.batchProcess.discoveredSources ?? []),
    ...(workspace.sources ?? []),
  ];
  return sources.find((source) => autoAspectPathKey(source.path) === key) ?? null;
}

function sourceForRetryAutoAspect(context: RetryAutoAspectContext, workspace: Workspace | undefined): RetryAutoAspectSource | null {
  const firstReferencePath = context.sourceImagePaths?.map((item) => String(item || "").trim()).find(Boolean) ?? "";
  if (firstReferencePath) {
    return findWorkspaceSourceForAutoAspect(workspace, firstReferencePath) ?? { path: firstReferencePath };
  }
  const batchPath = String(context.batchSourcePath || "").trim();
  if (batchPath) {
    return findWorkspaceSourceForAutoAspect(workspace, batchPath) ?? { path: batchPath };
  }
  return workspace?.sources?.[0] ?? null;
}

function retryAutoAspectResolutionForContext(
  context: RetryAutoAspectContext,
  workspace: Workspace | undefined,
): AutoAspectResolutionValue | undefined {
  const stored = normalizeAutoAspectResolutionValue(context.autoAspectResolution);
  if (stored) return stored;
  const current = normalizeAutoAspectResolutionValue(workspace?.batchProcess.autoAspectResolution);
  if (context.mode === "edit" && context.batchSourcePath && workspace?.editSourceMode === "batch") return current;
  return undefined;
}

async function buildRetryAutoAspectSizeForContext(
  context: RetryAutoAspectContext,
  workspace: Workspace | undefined,
  resolution: AutoAspectResolutionValue,
  input: {
    apiMode: APIMode;
    requestPolicy: RequestPolicy;
    imageModelID?: string;
  },
): Promise<SizeValue | null> {
  const source = sourceForRetryAutoAspect(context, workspace);
  return source ? buildAutoAspectSizeForSource(resolution, source, input) : null;
}

function batchReferenceOrderAutoAspectSource(
  fixedSources: SourceImage[],
  batchSource: {
    path?: string;
    width?: number;
    height?: number;
    previewWidth?: number;
    previewHeight?: number;
    imageBlob?: Blob | null;
    imageB64?: string | null;
  },
  batchSourceSlotIndex: number,
): {
  source: {
    path?: string;
    width?: number;
    height?: number;
    previewWidth?: number;
    previewHeight?: number;
    imageBlob?: Blob | null;
    imageB64?: string | null;
  };
  label: string;
} {
  const firstSlotIsBatchSource = normalizedReferenceSlotIndex(batchSourceSlotIndex, fixedSources.length) === 0;
  const firstFixedSource = fixedSources[0] ?? null;
  if (firstSlotIsBatchSource || !firstFixedSource) {
    return { source: batchSource, label: "\u7b2c1\u683c\u6279\u91cf\u6e90\u56fe" };
  }
  return { source: firstFixedSource, label: "\u7b2c1\u683c\u53c2\u8003\u56fe" };
}

function materialSyncItemsForGroup(
  group: MaterialGroup,
  historyById: Map<string, HistoryItem>,
): MaterialOutputSyncItemLike[] {
  return group.items.map((ref, index) => {
    if (ref.kind === "source") {
      const savedPath = ref.source.path?.trim() ?? "";
      const suggestedName = ref.source.name?.trim() || pathLeaf(savedPath);
      return {
        historyId: savedPath ? `source:${savedPath}` : `source:${group.id}:${index}`,
        savedPath,
        suggestedName,
        missingReason: savedPath ? undefined : "Missing source path",
      };
    }
    const item = historyById.get(ref.historyId);
    if (!item) {
      return {
        historyId: ref.historyId,
        savedPath: "",
        suggestedName: `${ref.historyId}.png`,
        missingReason: "History item not found",
      };
    }
    const savedPath = item.savedPath?.trim() ?? "";
    return {
      historyId: item.id,
      savedPath,
      suggestedName: savedPath ? pathLeaf(savedPath) : `${item.imageId || item.id}.png`,
      missingReason: savedPath ? undefined : "History item has no saved path",
    };
  });
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

function batchProcessLinkFromTask(task: Pick<BatchTaskRecord, "batchOutputMode" | "batchOutputDir" | "batchOutputPrefix" | "sourceImagePaths" | "batchSourcePath"> | undefined): {
  sourcePath: string;
  outputDir: string;
  outputNamePrefix: string;
} | undefined {
  if (!task) return undefined;
  if (!task.batchOutputMode) return undefined;
  const sourcePath = String(task.batchSourcePath || task.sourceImagePaths?.[0] || "").trim();
  if (!sourcePath) return undefined;
  return {
    sourcePath,
    outputDir: task.batchOutputMode === "custom_dir" ? (task.batchOutputDir || "") : "",
    outputNamePrefix: task.batchOutputPrefix || "processed-",
  };
}

function syncBatchOutputAfterSuccess(
  link: {
    sourcePath: string;
    outputDir: string;
    outputNamePrefix: string;
  } | undefined,
  savedPath: string | null | undefined,
) {
  if (!link?.sourcePath) return;
  const sourceSavedPath = String(savedPath || "").trim();
  const targetDirectory = link.outputDir.trim() || directoryFromPath(link.sourcePath);
  if (!sourceSavedPath || !targetDirectory) return;
  void BuildBatchOutputPath(
    link.sourcePath,
    targetDirectory,
    link.outputNamePrefix,
  ).then((targetPath) => {
    const suggestedName = pathLeaf(targetPath) || `${link.outputNamePrefix || "processed-"}image.png`;
    return SaveImagePathToDir(sourceSavedPath, targetDirectory, suggestedName);
  }).catch((error: any) => {
    useStudioStore.getState().pushToast(`批处理输出同步失败：${error?.message ?? error}`, "warn", 6000);
  });
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

async function resolvePromptTextProfile(s: StudioState): Promise<{
  apiKey: string;
  baseURL: string;
  textModelID: string;
}> {
  let apiKey = s.apiKey;
  let baseURL = s.baseURL;
  let textModelID = s.textModelID;
  if (s.apiMode === "apimart") {
    if (s.apiKey.trim() && s.baseURL.trim() && s.textModelID.trim()) {
      return {
        apiKey: s.apiKey.trim(),
        baseURL: cleanBaseURL(s.baseURL),
        textModelID: s.textModelID.trim(),
      };
    }
    const responsesProfile = s.profiles.find((p) => p.apiMode === "responses" && p.baseURL.trim());
    if (!responsesProfile) {
      return { apiKey: "", baseURL: "", textModelID: "" };
    }
    apiKey = "";
    baseURL = responsesProfile.baseURL;
    textModelID = responsesProfile.textModelID;
    const k = await GetStoredAPIKey(keyringUserFor(responsesProfile.id)).catch(() => "");
    if (k) apiKey = k;
  } else if (s.apiMode !== "responses") {
    const responsesProfile = s.profiles.find((p) => p.apiMode === "responses" && p.baseURL);
    if (responsesProfile) {
      baseURL = responsesProfile.baseURL;
      textModelID = responsesProfile.textModelID;
      const k = await GetStoredAPIKey(keyringUserFor(responsesProfile.id)).catch(() => "");
      if (k) apiKey = k;
    }
  }
  return {
    apiKey: apiKey.trim(),
    baseURL: cleanBaseURL(baseURL),
    textModelID: textModelID.trim(),
  };
}

function providerRequiresDirectAPIKey(apiMode: APIMode | string): boolean {
  return apiMode !== "runninghub" && apiModeRequiresDirectAPIKey(apiMode as APIMode);
}

function currentProviderHasRequiredKey(state: Pick<StudioState, "apiMode" | "apiKey">): boolean {
  return !providerRequiresDirectAPIKey(state.apiMode) || !!state.apiKey.trim();
}

function browserRuntimePatchFromGroups(groups: JobGroupSnapshot[], continuousGenerateTest = false): WorkspacePatch {
  const hasContinuousGroups = groups.some((group) => group.continuousGenerateTest === true && group.batchCount === 1);
  const runtime = continuousGenerateTest || hasContinuousGroups
    ? continuousRuntimeStateFromJobGroups(groups)
    : runtimeStateFromJobGroups(groups);
  return {
    runningJobs: runtime.runningJobs,
    jobsTotal: runtime.jobsTotal,
    jobsCompleted: runtime.jobsCompleted,
    jobsFailed: runtime.jobsFailed,
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
          apiMode: normalizeAPIMode(group.apiMode),
          apiProfileId: group.apiProfileId || undefined,
        };
      }
    }
  }
  return out;
}

function nextBatchSlotStartForWorkspace(state: StudioState, workspaceId: string) {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  const tasks = sortedBatchTasksForWorkspace(workspaceId, workspace?.batchTaskIds ?? [], state.batchTasksById);
  const taskStart = nextSlotIndexFromTasks(tasks);
  const workspaceBatchResults = completeWorkspaceBatchResults(state, workspaceId);
  const resultMax = workspaceBatchResults.reduce((max, item) => (
    Math.max(max, Number.isFinite(Number(item.batchIndex)) ? Number(item.batchIndex) : -1)
  ), -1);
  return Math.max(
    taskStart,
    resultMax + 1,
    workspace?.jobsTotal ?? 0,
    workspace?.batchTaskIds?.length ?? 0,
    workspace?.batchResultIds?.length ?? 0,
    state.activeWorkspaceId === workspaceId ? state.batchResults.length : 0,
  );
}

function latestWorkspaceTaskIds(state: StudioState, workspaceId: string) {
  return state.workspaces.find((entry) => entry.id === workspaceId)?.batchTaskIds ?? [];
}

function mergeHistoryItemData(current: HistoryItem | undefined, incoming: HistoryItem): HistoryItem {
  if (!current) return incoming;
  const merged: HistoryItem = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined || value === null) continue;
    const mergedRecord = merged as unknown as Record<string, unknown>;
    const currentValue = mergedRecord[key];
    if (key === "previewOnly" && currentValue === false && value === true) continue;
    if (typeof value === "string" && !value.trim() && typeof currentValue === "string" && currentValue.trim()) {
      continue;
    }
    mergedRecord[key] = value;
  }
  return merged;
}

function sortBatchResultItems(items: HistoryItem[]): HistoryItem[] {
  return [...items].sort((a, b) => {
    const aIndex = Number.isFinite(Number(a.batchIndex)) ? Number(a.batchIndex) : Number.MAX_SAFE_INTEGER;
    const bIndex = Number.isFinite(Number(b.batchIndex)) ? Number(b.batchIndex) : Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex || (a.createdAt ?? 0) - (b.createdAt ?? 0);
  });
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = String(value || "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function mergeHistoryItemsById(items: HistoryItem[]): HistoryItem[] {
  const order: string[] = [];
  const byId = new Map<string, HistoryItem>();
  for (const item of items) {
    const id = String(item.id || "").trim();
    if (!id) continue;
    if (!byId.has(id)) order.push(id);
    byId.set(id, mergeHistoryItemData(byId.get(id), item));
  }
  return order.map((id) => byId.get(id)).filter((item): item is HistoryItem => !!item);
}

function completeWorkspaceBatchResults(
  state: StudioState,
  workspaceId: string,
  options: {
    history?: HistoryItem[];
    batchResults?: HistoryItem[];
    include?: HistoryItem[];
  } = {},
): HistoryItem[] {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  const history = options.history ?? state.history;
  const activeBatchResults = options.batchResults ?? state.batchResults;
  const candidates: HistoryItem[] = [
    ...historyItemsByIds(history, workspace?.batchResultIds ?? []),
  ];
  if (state.activeWorkspaceId === workspaceId) {
    candidates.push(...activeBatchResults);
  }
  if (options.include?.length) candidates.push(...options.include);
  return sortBatchResultItems(mergeHistoryItemsById(candidates));
}

function completeWorkspaceBatchResultIds(
  state: StudioState,
  workspaceId: string,
  batchResults: HistoryItem[],
): string[] {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  return uniqueStrings([...(workspace?.batchResultIds ?? []), ...batchResults.map((item) => item.id)]);
}

function mergeWorkspaceBatchResult(
  state: StudioState,
  workspaceId: string,
  historyItem: HistoryItem,
  history: HistoryItem[] = state.history,
) {
  const batchResults = completeWorkspaceBatchResults(state, workspaceId, {
    history,
    include: [historyItem],
  });
  return {
    batchResults,
    batchResultIds: uniqueStrings([
      ...completeWorkspaceBatchResultIds(state, workspaceId, batchResults),
      historyItem.id,
    ]),
  };
}

function activeBatchTaskIdsForReset(
  workspaceId: string,
  taskIds: string[],
  tasksById: Record<string, BatchTaskRecord>,
): string[] {
  return sortedBatchTasksForWorkspace(workspaceId, taskIds, tasksById)
    .filter((task) => task.status === "queued" || task.status === "running")
    .map((task) => task.id);
}

function preserveStreamPreviewsForJobs(streamPreviews: StreamPreviewMap, jobIds: string[]) {
  const keep = new Set(jobIds);
  const out: Record<string, any> = {};
  for (const [jobId, preview] of Object.entries(streamPreviews ?? {})) {
    if (keep.has(jobId)) out[jobId] = preview;
  }
  return out;
}

function shouldPreserveBatchSessionForSubmit(
  state: StudioState,
  workspaceId: string,
) {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  const taskIds = workspace?.batchTaskIds ?? [];
  const resultIds = workspace?.batchResultIds ?? [];
  const hasSession = taskIds.length > 0 || resultIds.length > 0 || (state.activeWorkspaceId === workspaceId && state.batchResults.length > 0);
  return hasSession;
}

function hasActiveGenerationForWorkspace(state: StudioState, workspaceId: string): boolean {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  const taskIds = workspace?.batchTaskIds ?? [];
  const hasActiveTask = sortedBatchTasksForWorkspace(workspaceId, taskIds, state.batchTasksById)
    .some((task) => task.status === "queued" || task.status === "running" || startingContinuousTaskIds.has(task.id));
  if (hasActiveTask) return true;
  if (state.activeWorkspaceId === workspaceId && state.runningJobs.length > 0) return true;
  if (Object.values(state.runningJobMeta).some((meta) => meta.workspaceId === workspaceId)) return true;
  return (state.jobGroupsByWorkspace[workspaceId] ?? [])
    .some((group) => group.slots.some((slot) => slot.status === "queued" || slot.status === "running"));
}

function clampBatchSourceSlotIndex(value: unknown, fixedSourceCount: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.max(0, fixedSourceCount), Math.floor(n)));
}

function buildBatchCombinedSourcePaths(
  fixedSourcePaths: string[],
  batchSourcePath: string,
  slotIndex: number,
): string[] {
  const cleanFixed = fixedSourcePaths.map((item) => String(item || "").trim()).filter(Boolean);
  const cleanBatch = String(batchSourcePath || "").trim();
  if (!cleanBatch) return cleanFixed;
  const insertAt = clampBatchSourceSlotIndex(slotIndex, cleanFixed.length);
  return [
    ...cleanFixed.slice(0, insertAt),
    cleanBatch,
    ...cleanFixed.slice(insertAt),
  ];
}

function taskRuntimePatchForWorkspace(
  workspaceId: string,
  taskIds: string[],
  tasksById: Record<string, BatchTaskRecord>,
): WorkspacePatch {
  const tasks = sortedBatchTasksForWorkspace(workspaceId, taskIds, tasksById);
  const runningJobs = tasks
    .filter((task) => task.status === "running" || (task.status === "queued" && !!task.jobId))
    .map((task) => task.jobId)
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return {
    batchTaskIds: taskIds,
    jobsTotal: tasks.length,
    jobsCompleted: tasks.filter((task) => (
      task.status === "succeeded"
      || task.status === "failed"
      || task.status === "cancelled"
      || task.status === "interrupted"
    )).length,
    jobsFailed: tasks.filter((task) => task.status === "failed" || task.status === "interrupted").length,
    runningJobs,
    resultGridOpen: tasks.length > 0 || runningJobs.length > 0,
  };
}

function continuousQueueLimitForState(state: StudioState, apiMode: APIModeValue, apiProfileId?: string): number {
  return effectiveConcurrencyLimitForProfile(state, apiMode, apiProfileId);
}

function markWorkspaceTasks(
  workspaceId: string,
  taskIds: string[],
  tasksById: Record<string, BatchTaskRecord>,
  predicate: (task: BatchTaskRecord) => boolean,
  patch: Partial<BatchTaskRecord>,
) {
  let changed = false;
  const now = Date.now();
  const next = { ...tasksById };
  for (const task of sortedBatchTasksForWorkspace(workspaceId, taskIds, tasksById)) {
    if (!predicate(task)) continue;
    next[task.id] = {
      ...task,
      ...patch,
      updatedAt: patch.updatedAt ?? now,
    };
    changed = true;
  }
  return changed ? next : tasksById;
}

function retryHistoryByIdForState(state: StudioState) {
  return new Map([...state.batchResults, ...state.history].map((item) => [item.id, item]));
}

function autoRetryReasonForTask(
  task: BatchTaskRecord,
  historyById: ReturnType<typeof retryHistoryByIdForState>,
): string {
  if (task.status === "succeeded" && !batchTaskHasResult(task, historyById)) return "Missing final image";
  if (task.status === "failed" || task.status === "interrupted") {
    return String(task.errorMessage || task.lastLogLine || "Generation failed");
  }
  return "";
}

function scheduleAutoRetryForTask(task: BatchTaskRecord, reasonOverride?: string) {
  const state = useStudioStore.getState();
  const workspace = state.workspaces.find((entry) => entry.id === task.workspaceId);
  const taskIds = workspace?.batchTaskIds ?? [];
  if (!taskIds.includes(task.id)) return;
  const historyById = retryHistoryByIdForState(state);
  if (!isRetryableBatchTask(task, historyById)) return;
  const reason = String(reasonOverride || autoRetryReasonForTask(task, historyById) || "").trim();
  if (!isTransientGenerationFailureText(reason, task.errorMessage, task.lastLogLine)) return;

  const reducedLimit = recordTransientFailureForTask(task, reason);
  if (reducedLimit !== null) {
    state.pushToast(`Upstream repeated temporary failures; current API concurrency temporarily reduced to ${reducedLimit} for 10 minutes`, "warn", 5200);
  }
  if ((task.autoRetryCount ?? 0) >= AUTO_RETRY_MAX_COUNT) return;
  if (autoRetryTimersByTaskId.has(task.id)) return;

  const scheduledAt = Date.now() + AUTO_RETRY_DELAY_MS;
  const scheduledTasksById: Record<string, BatchTaskRecord> = {
    ...state.batchTasksById,
    [task.id]: {
      ...task,
      autoRetryScheduledAt: scheduledAt,
      autoRetryReason: reason,
      updatedAt: Date.now(),
    },
  };
  const patch = taskRuntimePatchForWorkspace(task.workspaceId, taskIds, scheduledTasksById);
  useStudioStore.setState((current) => ({
    batchTasksById: scheduledTasksById,
    workspaces: patchWorkspaceRuntime(current.workspaces, task.workspaceId, patch),
    ...(current.activeWorkspaceId === task.workspaceId ? activeRuntimePatch(patch) : {}),
  } as Partial<StudioState>));
  state.pushToast("Upstream timeout or busy; auto retry will run once after 15 seconds", "info", 3200);

  const timer = setTimeout(() => {
    autoRetryTimersByTaskId.delete(task.id);
    const latestState = useStudioStore.getState();
    const latestTask = latestState.batchTasksById[task.id];
    if (!latestTask || latestTask.autoRetryScheduledAt !== scheduledAt) return;
    const latestWorkspace = latestState.workspaces.find((entry) => entry.id === latestTask.workspaceId);
    const latestTaskIds = latestWorkspace?.batchTaskIds ?? [];
    const latestHistoryById = retryHistoryByIdForState(latestState);
    if (!latestTaskIds.includes(latestTask.id) || !isRetryableBatchTask(latestTask, latestHistoryById)) return;
    const retryTasksById: Record<string, BatchTaskRecord> = {
      ...latestState.batchTasksById,
      [latestTask.id]: {
        ...latestTask,
        autoRetryCount: (latestTask.autoRetryCount ?? 0) + 1,
        autoRetryScheduledAt: undefined,
        updatedAt: Date.now(),
      },
    };
    const retryPatch = taskRuntimePatchForWorkspace(latestTask.workspaceId, latestTaskIds, retryTasksById);
    useStudioStore.setState((current) => ({
      batchTasksById: retryTasksById,
      workspaces: patchWorkspaceRuntime(current.workspaces, latestTask.workspaceId, retryPatch),
      ...(current.activeWorkspaceId === latestTask.workspaceId ? activeRuntimePatch(retryPatch) : {}),
    } as Partial<StudioState>));
    void useStudioStore.getState().retryBatchTask(latestTask.id, { automatic: true, useTaskProfile: true });
  }, AUTO_RETRY_DELAY_MS);
  autoRetryTimersByTaskId.set(task.id, timer);
}

function scheduleAutoRetriesForBrowserGroup(group: JobGroupSnapshot) {
  for (const slot of group.slots) {
    const missingFinalImage = slot.status === "succeeded" && !String(slot.savedPath || "").trim();
    if (slot.status !== "failed" && slot.status !== "interrupted" && !missingFinalImage) continue;
    const state = useStudioStore.getState();
    const task = Object.values(state.batchTasksById).find((entry) => (
      entry.workspaceId === group.workspaceId
      && (entry.jobId === slot.jobId || entry.slotIndex === slotIndexForGroupSlot(group, slot))
    ));
    if (task) scheduleAutoRetryForTask(task, missingFinalImage ? "Missing final image" : (slot.errorMessage || task.errorMessage || slot.stage || "Generation failed"));
  }
}

async function startContinuousQueuedTask(taskId: string): Promise<boolean> {
  const store = useStudioStore;
  if (startingContinuousTaskIds.has(taskId)) return false;
  const s = store.getState();
  const task = s.batchTasksById[taskId];
  if (!task || task.status !== "queued" || task.jobId) return false;
  startingContinuousTaskIds.add(taskId);
  const workspaceId = task.workspaceId;
  const failQueuedStart = (message: string) => {
    const current = store.getState();
    const currentTask = current.batchTasksById[task.id] ?? task;
    if (currentTask.status === "cancelled") {
      startingContinuousTaskIds.delete(taskId);
      return false;
    }
    const workspace = current.workspaces.find((entry) => entry.id === workspaceId);
    const taskIds = workspace?.batchTaskIds ?? [];
    const failedTasksById = {
      ...current.batchTasksById,
      [task.id]: {
        ...currentTask,
        status: "failed" as const,
        queuedReason: undefined,
        queuePriority: undefined,
        updatedAt: Date.now(),
        errorMessage: message,
        lastLogLine: message,
      },
    };
    const failedPatch: WorkspacePatch = {
      ...taskRuntimePatchForWorkspace(workspaceId, taskIds, failedTasksById),
      errorMessage: message,
      errorRawPath: null,
      progress: null,
      streamPreview: null,
      streamPreviews: {},
      resultGridOpen: true,
      historyGalleryOpen: false,
    };
    store.setState((state) => ({
      batchTasksById: failedTasksById,
      workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, failedPatch),
      ...(state.activeWorkspaceId === workspaceId ? { ...activeRuntimePatch(failedPatch), resultGridOpen: true, historyGalleryOpen: false } : {}),
    } as Partial<StudioState>));
    store.getState().pushToast(message, "error", 4600);
    scheduleAutoRetryForTask(failedTasksById[task.id], message);
    startingContinuousTaskIds.delete(taskId);
    return false;
  };
  const taskContext = retryContextFromOriginalTask(s, task);
  if (task.apiProfileId && !taskContext.activeProfile) {
    return failQueuedStart("Missing API profile for the queued task");
  }
  const taskAPIKey = await apiKeyForProfileOrState(s, task.apiProfileId);
  let cleanedAPIKey = "";
  if (providerRequiresDirectAPIKey(task.apiMode)) {
    try {
      cleanedAPIKey = validateAPIKeyForHeader(taskAPIKey);
    } catch (error: any) {
      const message = error?.message ?? "API key format invalid";
      store.setState({ errorMessage: message, errorRawPath: null });
      store.getState().pushToast(message, "error", 4200);
      startingContinuousTaskIds.delete(taskId);
      return false;
    }
  }
  const cleanedBaseURL = cleanBaseURL(taskContext.baseURL);
  if (!cleanedBaseURL) {
    store.setState({ errorMessage: "Base URL is required for the queued task", errorRawPath: null });
    store.getState().pushToast("Base URL is required for the queued task", "error", 4200);
    startingContinuousTaskIds.delete(taskId);
    return false;
  }
  if (!shouldUseBackgroundTaskProxyForSubmit(task.apiMode)) {
    const latestTask = store.getState().batchTasksById[taskId];
    if (!latestTask || latestTask.status !== "queued" || latestTask.jobId) {
      startingContinuousTaskIds.delete(taskId);
      return false;
    }
    const batchProcessLink = batchProcessLinkFromTask(task);
    if (task.batchOutputMode && !batchProcessLink) {
      return failQueuedStart("Missing batch process context for queued retry task");
    }
    const sources = task.mode === "edit" ? sourceImagesFromPaths(task.sourceImagePaths) : [];
    const directPayload: RuntimeGenerateOptions = {
      apiKey: cleanedAPIKey,
      mode: task.mode,
      requestedJobId: "",
      prompt: task.prompt,
      size: task.size,
      quality: task.quality,
      outputFormat: task.outputFormat,
      imagePaths: task.sourceImagePaths ?? [],
      imagePath: "",
      maskB64: task.maskB64 || "",
      seed: Number.isFinite(Number(task.seed)) ? Number(task.seed) : 0,
      negativePrompt: task.negativePrompt || "",
      baseURL: cleanedBaseURL,
      textModelID: taskContext.textModelID,
      imageModelID: taskContext.imageModelID,
      proxyMode: s.proxyMode,
      proxyURL: s.proxyURL,
      requestPolicy: taskContext.requestPolicy,
      apiMode: task.apiMode,
      imagesNewAPICompat: taskContext.imagesNewAPICompat,
      noPromptRevision: true,
      concurrencyLimit: taskContext.concurrencyLimit,
      partialImages: 1,
      sourceImages: task.mode === "edit" ? sources : undefined,
    };
    void launchOneJob(task.mode, directPayload, {
      workspaceId,
      apiMode: task.apiMode,
      apiProfileId: task.apiProfileId,
      apiProfileName: task.apiProfileName,
      batchIndex: task.slotIndex,
      size: task.size,
      quality: task.quality,
      outputFormat: task.outputFormat,
      sources,
      currentImage: null,
      styleTag: task.styleTag || "",
      continuousGenerateTest: true,
      batchProcessLink,
    }, {
      onSettled: () => {
        void pumpContinuousQueue(workspaceId, task.apiMode);
      },
    });
    startingContinuousTaskIds.delete(taskId);
    return true;
  }
  const submitJobGroup = isAndroidTaskProxyMode() ? submitAndroidJobGroup : submitBrowserJobGroup;
  const optimisticState = store.getState();
  const optimisticTask = optimisticState.batchTasksById[taskId];
  const optimisticWorkspace = optimisticState.workspaces.find((entry) => entry.id === workspaceId);
  const optimisticTaskIds = optimisticWorkspace?.batchTaskIds ?? [];
  if (!optimisticTask || optimisticTask.status !== "queued" || optimisticTask.jobId) {
    startingContinuousTaskIds.delete(taskId);
    return false;
  }
  const optimisticTasksById: Record<string, BatchTaskRecord> = {
    ...optimisticState.batchTasksById,
    [taskId]: {
      ...optimisticTask,
      status: "running",
      queuedReason: undefined,
      queuePriority: undefined,
      updatedAt: Date.now(),
    },
  };
  const optimisticPatch: WorkspacePatch = {
    ...taskRuntimePatchForWorkspace(workspaceId, optimisticTaskIds, optimisticTasksById),
    resultGridOpen: true,
    historyGalleryOpen: false,
  };
  store.setState((state) => ({
    batchTasksById: optimisticTasksById,
    workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, optimisticPatch),
    ...(state.activeWorkspaceId === workspaceId ? {
      ...activeRuntimePatch(optimisticPatch),
      resultGridOpen: true,
      historyGalleryOpen: false,
    } : {}),
  } as Partial<StudioState>));
  try {
    const response = await submitJobGroup({
      workspaceId,
      mode: task.mode,
      prompt: task.prompt,
      size: task.size,
      quality: task.quality,
      outputFormat: task.outputFormat,
      batchCount: 1,
      seed: Number.isFinite(Number(task.seed)) ? Number(task.seed) : 0,
      negativePrompt: task.negativePrompt || "",
      styleTag: task.styleTag || "",
      sourceImagePaths: task.sourceImagePaths ?? [],
      batchSourcePath: task.batchSourcePath || "",
      batchSourceSlotIndex: task.batchSourceSlotIndex,
      maskB64: task.maskB64 || "",
      apiKey: cleanedAPIKey,
      baseURL: cleanedBaseURL,
      apiMode: task.apiMode,
      apiProfileId: task.apiProfileId,
      apiProfileName: task.apiProfileName,
      requestPolicy: taskContext.requestPolicy,
      imagesNewAPICompat: taskContext.imagesNewAPICompat,
      textModelID: taskContext.textModelID,
      imageModelID: taskContext.imageModelID,
      continuousGenerateTest: true,
      continuousBatchIndex: task.slotIndex,
    });
    const nextJobGroupsByWorkspace = mergeWorkspaceJobGroup(store.getState().jobGroupsByWorkspace, response.group);
    const nextWorkspace = store.getState().workspaces.find((entry) => entry.id === workspaceId);
    const batchTasksById = updateTasksFromJobGroup(
      store.getState().batchTasksById,
      nextWorkspace?.batchTaskIds ?? [],
      response.group,
    );
    const browserPatch = browserRuntimePatchFromGroups(nextJobGroupsByWorkspace[workspaceId] ?? [], true);
    const taskPatch = taskRuntimePatchForWorkspace(workspaceId, nextWorkspace?.batchTaskIds ?? [], batchTasksById);
    const runtimePatch = { ...browserPatch, ...taskPatch, resultGridOpen: true, historyGalleryOpen: false };
    const runningJobMeta = buildRunningJobMetaFromBrowserGroups(nextJobGroupsByWorkspace);
    store.setState((state) => ({
      jobGroupsByWorkspace: nextJobGroupsByWorkspace,
      batchTasksById,
      runningJobMeta,
      workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, runtimePatch),
      ...(state.activeWorkspaceId === workspaceId ? { ...activeRuntimePatch(runtimePatch), resultGridOpen: true, historyGalleryOpen: false } : {}),
    } as Partial<StudioState>));
    syncBrowserJobSubscriptions(nextJobGroupsByWorkspace);
    scheduleAutoRetriesForBrowserGroup(response.group);
    startingContinuousTaskIds.delete(taskId);
    return true;
  } catch (error: any) {
    return failQueuedStart(`提交失败:${error?.message ?? error}`);
  }
}

async function pumpContinuousQueue(workspaceId: string, apiMode: APIModeValue) {
  const store = useStudioStore;
  let started = 0;
  while (true) {
    const state = store.getState();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
    if (!workspace) break;
    const taskIds = workspace.batchTaskIds ?? [];
    const queue = localQueuedTasksForWorkspace(workspaceId, taskIds, state.batchTasksById)
      .filter((task) => task.apiMode === apiMode);
    if (queue.length === 0) break;
    const next = queue.find((task) => {
      const limit = continuousQueueLimitForState(state, apiMode, task.apiProfileId);
      if (limit <= 0) return false;
      const active = runningOrSubmittedTaskCountForWorkspace(
        workspaceId,
        taskIds,
        state.batchTasksById,
        apiMode,
        task.apiProfileId,
        startingContinuousTaskIds,
      );
      return limit - active > 0;
    });
    if (!next) break;
    const ok = await startContinuousQueuedTask(next.id);
    if (ok) started += 1;
    if (!ok) break;
  }
  if (started > 0) {
    const state = store.getState();
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
    if (workspace && state.activeWorkspaceId === workspaceId) {
      const patch = taskRuntimePatchForWorkspace(workspaceId, workspace.batchTaskIds ?? [], state.batchTasksById);
      store.setState({
        ...activeRuntimePatch(patch),
        workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, patch),
      });
    }
  }
}

async function submitCurrentRequest(
  get: () => StudioState,
  set: (patch: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void,
): Promise<void> {
  const s = get();
  const batchProcess = normalizeBatchProcessConfig(s.batchProcess);
  const batchProcessMode = s.mode === "edit" && s.editSourceMode === "batch";
  const continuousGenerateTest = s.continuousGenerateTest === true && !batchProcessMode;
  if (!continuousGenerateTest && !batchProcessMode && hasActiveGenerationForWorkspace(s, s.activeWorkspaceId)) {
    const message = "当前已有任务正在生成。连续生成模式关闭时不会并发提交，避免误点后重复扣费。";
    set({ errorMessage: message, errorRawPath: null });
    s.pushToast(message, "warn", 4200);
    return;
  }
  if (!currentProviderHasRequiredKey(s)) {
    set({ errorMessage: "请填写 API Key", errorRawPath: null });
    return;
  }

  let cleanedAPIKey = "";
  if (providerRequiresDirectAPIKey(s.apiMode)) {
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
  }

  if (!s.prompt.trim()) {
    set({ errorMessage: "Prompt is required", errorRawPath: null });
    get().pushToast("Prompt is required", "warn", 2600);
    return;
  }

  const effectivePrompt = buildEffectivePrompt(s.promptPrefix, s.prompt);
  if (!effectivePrompt) {
    set({ errorMessage: "Prompt is required after prompt prefix merge", errorRawPath: null });
    return;
  }
  if (!s.baseURL.trim()) {
    set({ errorMessage: "请填写 Base URL", errorRawPath: null });
    return;
  }

  const cleanedBaseURL = cleanBaseURL(s.baseURL);
  const batchSelectedSources = batchProcessMode
    ? batchProcess.discoveredSources.filter((source) => source.selected !== false)
    : [];
  const batchFixedSources = batchProcessMode ? s.sources : [];
  const batchSourceSlotIndex = batchProcessMode
    ? clampBatchSourceSlotIndex(batchProcess.batchSourceSlotIndex, batchFixedSources.length)
    : 0;
  const batchCount = batchProcessMode
    ? batchSelectedSources.length
    : (continuousGenerateTest ? 1 : normalizeBatchCount(s.batchCount));
  const activeProfile = s.profiles.find((profile) => profile.id === s.activeProfileId);
  const effectiveAPIMode = effectiveAPIModeForSubmit(s.mode, activeProfile?.apiMode ?? s.apiMode);
  const concurrencyLimit = effectiveConcurrencyLimitForProfile(s, effectiveAPIMode, activeProfile?.id || s.activeProfileId);
  const apiProfileSnapshot = apiProfileSnapshotForSubmit(activeProfile, s.activeProfileId);
  const autoAspectInput = autoAspectSizeInputFromState(s);
  const activeCount = workspaceRunningCount(s, effectiveAPIMode, apiProfileSnapshot.apiProfileId);

  if (batchProcessMode) {
    if (batchProcess.discoveredSources.length === 0) {
      set({
        errorMessage: "No batch input directory or files are available for batch edit",
        errorRawPath: null,
      });
      return;
    }
    if (batchSelectedSources.length === 0) {
      set({
        errorMessage: "Please select at least one batch source image",
        errorRawPath: null,
      });
      return;
    }
    if (batchProcess.outputMode === "custom_dir" && !batchProcess.outputDir.trim()) {
      set({ errorMessage: "Please choose a batch output folder", errorRawPath: null });
      return;
    }
    if (concurrencyLimit <= 0) {
      set({
        errorMessage: "Current API concurrency is temporarily limited to 0; please wait and retry",
        errorRawPath: null,
      });
      return;
    }
  } else if (concurrencyLimit > 0 && !continuousGenerateTest) {
    const available = concurrencyLimit - activeCount;
    if (available < batchCount) {
      const apiLabel = apiModeLabel(effectiveAPIMode);
      set({
        errorMessage: `${apiLabel} concurrency limit is ${concurrencyLimit}; only ${Math.max(0, available)} slots are available, but ${batchCount} tasks were requested`,
        errorRawPath: null,
      });
      return;
    }
  } else if (continuousGenerateTest && activeCount > 0) {
    get().pushToast("Continuous mode is already running tasks; new submit was not queued", "warn", 3600);
  }

  let editSourcePaths: string[] = [];
  let preparedSources = s.sources;
  let materializedImplicitCurrentImage: RetryAutoAspectSource | null = null;
  if (s.mode === "edit" && !batchProcessMode) {
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
        materializedImplicitCurrentImage = implicitEditAutoAspectSource(materialized);
      }
    }
    if (shouldUseBackgroundTaskProxyForSubmit(effectiveAPIMode) && editSourcePaths.some((filePath) => isVirtualImagePath(filePath))) {
      set({
        errorMessage: "Edit sources still contain virtual images that cannot be sent as input files",
        errorRawPath: null,
      });
      return;
    }
    if (editSourcePaths.length === 0) {
      const platform = readRuntimePlatformState();
      set({
        errorMessage: platform.isAndroid
          ? "Select or paste a source image before running edit mode on Android"
          : "Select, paste, or drag a source image before running edit mode",
        errorRawPath: null,
      });
      return;
    }
  }

  let resolvedSize = normalizeSizeSelection(s.size, {
    apiMode: effectiveAPIMode,
    requestPolicy: autoAspectInput.requestPolicy,
    imageModelID: autoAspectInput.imageModelID,
    mode: s.mode,
  });
  let batchAutoSizes: Array<SizeValue | null> = [];
  const editAutoAspectResolution = normalizeAutoAspectResolutionValue(batchProcess.autoAspectResolution);
  const editAutoAspectEnabled = s.mode === "edit" && !!editAutoAspectResolution && (batchProcessMode || !s.editAutoAspectUserLocked);
  if (editAutoAspectEnabled && !batchProcessMode) {
    const primarySource = preparedSources[0]
      ?? materializedImplicitCurrentImage
      ?? implicitEditAutoAspectSource(s.currentImage);
    const autoSize = primarySource
      ? await buildAutoAspectSizeForSource(editAutoAspectResolution, primarySource, autoAspectInput)
      : null;
    if (!autoSize) {
      set({ errorMessage: "Auto-aspect could not read the selected source image ratio", errorRawPath: null });
      get().pushToast("Auto-aspect could not rebuild the selected size from the current source image", "error", 4200);
      return;
    }
    resolvedSize = autoSize;
  }
  if (editAutoAspectEnabled && batchProcessMode) {
    for (let index = 0; index < batchSelectedSources.length; index += 1) {
      const autoAspectSource = batchReferenceOrderAutoAspectSource(
        batchFixedSources,
        batchSelectedSources[index],
        batchSourceSlotIndex,
      );
      const autoSize = await buildAutoAspectSizeForSource(editAutoAspectResolution, autoAspectSource.source, autoAspectInput);
      if (!autoSize) {
        const message = `无法读取 ${autoAspectSource.label} 的尺寸，无法按参考图比例生成，请确认图片可访问后重试`;
        set({ errorMessage: message, errorRawPath: null });
        get().pushToast(message, "error", 5200);
        return;
      }
      batchAutoSizes[index] = autoSize;
    }
  }
  const workspaceId = s.activeWorkspaceId;
  const clearCurrentForNewRun = s.mode === "generate";
  const previousRuntime = workspaceRuntimeFromState(s, workspaceId);
  const previousBatchResults = completeWorkspaceBatchResults(s, workspaceId);
  const previousBatchResultIds = completeWorkspaceBatchResultIds(s, workspaceId, previousBatchResults);
  const previousBatchTaskIds = latestWorkspaceTaskIds(s, workspaceId);
  const hasPreviousBatchSession = batchProcessMode
    || continuousGenerateTest
    || previousBatchTaskIds.length > 0
    || previousBatchResultIds.length > 0
    || previousBatchResults.length > 0;
  const preserveCurrentBatchSession = hasPreviousBatchSession
    && shouldPreserveBatchSessionForSubmit(s, workspaceId);
  const batchSlotStart = preserveCurrentBatchSession ? nextBatchSlotStartForWorkspace(s, workspaceId) : 0;
  const shouldOpenBatchView = batchProcessMode || preserveCurrentBatchSession || batchCount > 1;
  const runPatch = {
    errorMessage: null,
    errorRawPath: null,
    progress: null,
    streamPreview: null,
    streamPreviews: {},
    lastLogLine: "",
    isRunning: true,
    jobsTotal: preserveCurrentBatchSession
      ? Math.max(previousRuntime.jobsTotal, previousBatchTaskIds.length, previousBatchResultIds.length, previousBatchResults.length) + batchCount
      : batchCount,
    jobsCompleted: preserveCurrentBatchSession ? previousRuntime.jobsCompleted : 0,
    jobsFailed: preserveCurrentBatchSession ? previousRuntime.jobsFailed : 0,
    runningJobs: preserveCurrentBatchSession ? previousRuntime.runningJobs : [],
  };
  set({
    ...runPatch,
    batchCount: s.batchCount,
    batchResults: preserveCurrentBatchSession ? previousBatchResults : [],
    resultGridOpen: shouldOpenBatchView,
    historyGalleryOpen: false,
    compareB: null,
    compareMode: "curtain",
    currentImage: continuousGenerateTest ? s.currentImage : (clearCurrentForNewRun ? null : s.currentImage),
    maskDataURL: null,
    annotations: [],
    strokes: [],
    workspaces: patchWorkspaceRuntime(s.workspaces, workspaceId, {
      ...runPatch,
      currentImageId: continuousGenerateTest ? (s.currentImage?.id ?? null) : (clearCurrentForNewRun ? null : s.currentImage?.id ?? null),
      batchResultIds: preserveCurrentBatchSession ? previousBatchResultIds : [],
      batchTaskIds: preserveCurrentBatchSession ? previousBatchTaskIds : [],
      resultGridOpen: shouldOpenBatchView,
      historyGalleryOpen: false,
    }),
  });

  const maskDataURL = s.mode === "edit"
    ? buildMaskPNGDataURL(s.strokes, s.currentImage?.imageB64 ? imageDims(s.currentImage.imageB64) : null)
    : null;
  const maskB64 = maskDataURL ? stripDataURLPrefix(maskDataURL) : "";
  let augmentedPrompt = augmentPromptWithAnnotations(effectivePrompt, s.annotations, s.currentImage?.imageB64 ? imageDims(s.currentImage.imageB64) : null);
  const styleSuffix = STYLE_SUFFIXES[s.styleTag];
  if (styleSuffix) {
    augmentedPrompt = `${augmentedPrompt}, ${styleSuffix}`;
  }

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
    sourceImages: s.mode === "edit" && !batchProcessMode ? preparedSources : undefined,
  };
  const persistedPayload = batchProcessMode ? null : basePayload;

  if (s.prompt.trim()) {
    const ph = [s.prompt, ...get().promptHistory.filter((p) => p !== s.prompt)].slice(0, 50);
    set({ promptHistory: ph });
    try { localStorage.setItem(PROMPT_HISTORY_KEY, JSON.stringify(ph)); } catch {}
  }
  set({
    lastPayload: persistedPayload ?? null,
    workspaces: patchWorkspaceRuntime(get().workspaces, workspaceId, { lastPayload: persistedPayload ?? null }),
  });

  const batchFixedSourcePaths = batchProcessMode
    ? batchFixedSources.map((src) => src.path).filter(Boolean)
    : [];
  const preparedPanoramaRoundtrip = panoramaRoundtripFromSources(preparedSources);

  const submittedTasks = batchProcessMode
    ? batchSelectedSources.map((source, index) => {
        const slotIndex = batchSlotStart + index;
        const combinedSourcePaths = buildBatchCombinedSourcePaths(batchFixedSourcePaths, source.path, batchSourceSlotIndex);
        const sourceImages = s.mode === "edit"
          ? [...batchFixedSources, source]
          : [];
        return createBatchTaskRecord({
          workspaceId,
          slotIndex,
          mode: s.mode,
          apiMode: effectiveAPIMode,
          ...apiProfileSnapshot,
          prompt: augmentedPrompt,
          size: batchAutoSizes[index] ?? resolvedSize,
          autoAspectResolution: editAutoAspectEnabled ? batchProcess.autoAspectResolution || undefined : undefined,
          quality: s.quality,
          outputFormat: s.outputFormat,
          requestPolicy: s.requestPolicy,
          imagesNewAPICompat: effectiveAPIMode === "images" && s.imagesNewAPICompat === true,
          textModelID: s.textModelID,
          imageModelID: s.imageModelID,
          seed: s.seed ? s.seed + index : 0,
          negativePrompt: s.negativePrompt,
          styleTag: s.styleTag,
          sourceImagePaths: combinedSourcePaths,
          sourceImages: sourceImages.length > 0 ? sourceImages : undefined,
          panoramaRoundtrip: panoramaRoundtripFromSources(sourceImages),
          batchSourcePath: source.path,
          batchSourceSlotIndex,
          maskB64,
          queuedReason: "batch_shared_concurrency",
          batchOutputMode: batchProcess.outputMode,
          batchOutputDir: batchProcess.outputMode === "custom_dir" ? batchProcess.outputDir : "",
          batchOutputPrefix: "processed-",
        });
      })
    : Array.from({ length: batchCount }, (_, index) => {
        const slotIndex = batchSlotStart + index;
        return createBatchTaskRecord({
          workspaceId,
          slotIndex,
          mode: s.mode,
          apiMode: effectiveAPIMode,
          ...apiProfileSnapshot,
          prompt: augmentedPrompt,
          size: resolvedSize,
          autoAspectResolution: editAutoAspectEnabled ? batchProcess.autoAspectResolution : undefined,
          quality: s.quality,
          outputFormat: s.outputFormat,
          requestPolicy: s.requestPolicy,
          imagesNewAPICompat: effectiveAPIMode === "images" && s.imagesNewAPICompat === true,
          textModelID: s.textModelID,
          imageModelID: s.imageModelID,
          seed: s.seed ? s.seed + index : 0,
          negativePrompt: s.negativePrompt,
          styleTag: s.styleTag,
          sourceImagePaths: editSourcePaths,
          sourceImages: s.mode === "edit" ? preparedSources : undefined,
          panoramaRoundtrip: preparedPanoramaRoundtrip,
          maskB64,
          queuedReason: continuousGenerateTest && concurrencyLimit > 0 ? "local_concurrency" : undefined,
        });
      });
  const submittedTaskIds = submittedTasks.map((task) => task.id);
  const nextBatchTaskIds = preserveCurrentBatchSession
    ? [...previousBatchTaskIds, ...submittedTaskIds]
    : submittedTaskIds;
  const nextBatchTasksById = upsertBatchTasks(get().batchTasksById, submittedTasks);
  set((state) => ({
    batchTasksById: nextBatchTasksById,
    selectedBatchTaskId: null,
    jobsTotal: nextBatchTaskIds.length,
    workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, {
      batchTaskIds: nextBatchTaskIds,
      selectedBatchTaskId: null,
      jobsTotal: nextBatchTaskIds.length,
      resultGridOpen: shouldOpenBatchView,
    }),
  } as Partial<StudioState>));

  if (batchProcessMode) {
    void pumpContinuousQueue(workspaceId, effectiveAPIMode);
    get().pushToast(
      `已提交 ${submittedTasks.length} 个批量任务，最大并发 ${concurrencyLimit}`,
      "info",
      2600,
    );
    return;
  }

  if (shouldUseBackgroundTaskProxyForSubmit(effectiveAPIMode)) {
    if (continuousGenerateTest && concurrencyLimit > 0) {
      void pumpContinuousQueue(workspaceId, effectiveAPIMode);
      get().pushToast(`Added to continuous queue, max concurrency ${concurrencyLimit}`, "info", 2200);
      return;
    }
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
        ...apiProfileSnapshot,
        requestPolicy: s.requestPolicy,
        imagesNewAPICompat: effectiveAPIMode === "images" && s.imagesNewAPICompat === true,
        textModelID: s.textModelID,
        imageModelID: s.imageModelID,
        continuousGenerateTest,
        continuousBatchIndex: batchSlotStart,
      });
      const nextJobGroupsByWorkspace = mergeWorkspaceJobGroup(get().jobGroupsByWorkspace, response.group);
      const workspace = get().workspaces.find((entry) => entry.id === workspaceId);
      const batchTasksById = updateTasksFromJobGroup(
        get().batchTasksById,
        workspace?.batchTaskIds ?? [],
        response.group,
      );
      const browserPatch = browserRuntimePatchFromGroups(nextJobGroupsByWorkspace[workspaceId] ?? [], s.continuousGenerateTest === true);
      const taskPatch = (workspace?.batchTaskIds?.length ?? 0) > 0
        ? taskRuntimePatchForWorkspace(workspaceId, workspace?.batchTaskIds ?? [], batchTasksById)
        : {};
      const runtimePatch = { ...browserPatch, ...taskPatch };
      const runningJobMeta = buildRunningJobMetaFromBrowserGroups(nextJobGroupsByWorkspace);
      set((state) => ({
        jobGroupsByWorkspace: nextJobGroupsByWorkspace,
        batchTasksById,
        runningJobMeta,
        workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, runtimePatch),
        ...(state.activeWorkspaceId === workspaceId ? activeRuntimePatch(runtimePatch) : {}),
      } as Partial<StudioState>));
      syncBrowserJobSubscriptions(nextJobGroupsByWorkspace);
      scheduleAutoRetriesForBrowserGroup(response.group);
    } catch (error: any) {
      const failedTaskIds = latestWorkspaceTaskIds(get(), workspaceId);
      const failedTasksById = { ...get().batchTasksById };
      const now = Date.now();
      for (const taskId of submittedTaskIds) {
        const task = failedTasksById[taskId];
        if (!task) continue;
        failedTasksById[taskId] = {
          ...task,
          status: "failed",
          updatedAt: now,
          errorMessage: `提交失败:${error?.message ?? error}`,
          lastLogLine: `提交失败:${error?.message ?? error}`,
        };
      }
      const taskPatch = taskRuntimePatchForWorkspace(workspaceId, failedTaskIds, failedTasksById);
      const failedPatch: WorkspacePatch = {
        ...taskPatch,
        progress: null,
        streamPreview: null,
        streamPreviews: {},
        lastLogLine: "",
        errorMessage: `提交失败:${error?.message ?? error}`,
        errorRawPath: null,
      };
      set((state) => ({
        ...activeRuntimePatch(failedPatch),
        errorMessage: failedPatch.errorMessage ?? null,
        errorRawPath: null,
        batchTasksById: failedTasksById,
        runningJobMeta: buildRunningJobMetaFromBrowserGroups(state.jobGroupsByWorkspace),
        workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, failedPatch),
      } as Partial<StudioState>));
      for (const taskId of submittedTaskIds) {
        const failedTask = failedTasksById[taskId];
        if (failedTask) scheduleAutoRetryForTask(failedTask, failedTask.errorMessage);
      }
    }
    return;
  }

  for (let i = 0; i < batchCount; i++) {
    const jobSeed = s.seed ? s.seed + i : 0;
    const p: RuntimeGenerateOptions = { ...remotePayload, seed: jobSeed };
    void launchOneJob(s.mode, p, {
      workspaceId,
      apiMode: effectiveAPIMode,
      ...apiProfileSnapshot,
      batchIndex: batchSlotStart + i,
      size: s.size,
      quality: s.quality,
      outputFormat: s.outputFormat,
      sources: preparedSources,
      currentImage: s.currentImage,
      styleTag: s.styleTag,
      continuousGenerateTest,
    });
  }
}

async function buildHistoryItemFromBrowserSlot(
  group: JobGroupSnapshot,
  slot: JobGroupSnapshot["slots"][number],
  existing: HistoryItem | null,
  sourceIdentity?: BrowserSourceIdentity,
): Promise<HistoryItem | null> {
  const savedPath = String(slot.savedPath || existing?.savedPath || "").trim();
  if (slot.status !== "succeeded" || !savedPath) return null;
  const imageB64 = existing?.imageB64 || await ReadImageAsBase64(savedPath).catch(() => "");
  if (!imageB64) return null;
  const dims = getImageDimensionsFromBase64(imageB64);
  const seedBase = Number.isFinite(Number(group.seed)) ? Number(group.seed) : 0;
  const batchIndex = slotIndexForGroupSlot(group, slot);
  const parentSourcePath = group.mode === "edit"
    ? String(sourceIdentity?.batchSourcePath || group.batchSourcePath || group.sourceImagePaths?.[0] || "").trim()
    : "";
  const sourceImages = group.mode === "edit"
    ? ((sourceIdentity?.sourceImages?.length ?? 0) > 0
      ? sourceIdentity?.sourceImages
      : sourceImagesFromPaths(group.sourceImagePaths))
    : undefined;
  const panoramaRoundtrip = sourceIdentity?.panoramaRoundtrip ?? panoramaRoundtripFromSources(sourceImages);
  return {
    ...existing,
    id: browserHistoryId(slot.jobId),
    prompt: group.prompt,
    revisedPrompt: slot.revisedPrompt || existing?.revisedPrompt,
    mode: group.mode,
    apiMode: group.apiMode,
    apiProfileId: group.apiProfileId || existing?.apiProfileId,
    apiProfileName: group.apiProfileName || existing?.apiProfileName,
    size: sourceIdentity?.size ?? group.size,
    quality: group.quality,
    outputFormat: group.outputFormat,
    createdAt: slot.finishedAt ?? slot.updatedAt ?? group.createdAt,
    seed: seedBase > 0 ? seedBase + slot.batchIndex : undefined,
    negativePrompt: group.negativePrompt || undefined,
    styleTag: group.styleTag || undefined,
    batchIndex: batchIndex >= 0 ? batchIndex : slot.batchIndex,
    elapsedSec: Number.isFinite(Number(slot.elapsedSec)) ? Number(slot.elapsedSec) : existing?.elapsedSec,
    width: dims?.w ?? existing?.width,
    height: dims?.h ?? existing?.height,
    sourceImages,
    panoramaRoundtrip,
    panoramaProject: panoramaProjectFromEditSources(sourceImages, panoramaRoundtrip),
    parentId: parentSourcePath || undefined,
    savedPath,
    rawPath: String(slot.rawPath || existing?.rawPath || ""),
    imageB64,
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
        sourceIdentityForBrowserGroupSlot(group, slot),
      );
      if (!nextItem) continue;
      const previous = byId.get(nextItem.id);
      if (
        previous
        && previous.savedPath === nextItem.savedPath
        && previous.rawPath === nextItem.rawPath
        && previous.revisedPrompt === nextItem.revisedPrompt
        && previous.imageB64 === nextItem.imageB64
        && previous.apiMode === nextItem.apiMode
        && previous.apiProfileId === nextItem.apiProfileId
        && previous.apiProfileName === nextItem.apiProfileName
        && previous.width === nextItem.width
        && previous.height === nextItem.height
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
  let accepted = false;
  useStudioStore.setState((state) => {
    const workspace = state.workspaces.find((entry) => entry.id === group.workspaceId);
    if (!isJobGroupVisibleForWorkspace(workspace, group)) return {};
    accepted = true;
    const jobGroupsByWorkspace = mergeWorkspaceJobGroup(state.jobGroupsByWorkspace, group);
    const batchTasksById = updateTasksFromJobGroup(
      state.batchTasksById,
      workspace?.batchTaskIds ?? [],
      group,
    );
    const browserPatch = browserRuntimePatchFromGroups(jobGroupsByWorkspace[group.workspaceId] ?? [], workspace?.continuousGenerateTest === true);
    const taskPatch = (workspace?.batchTaskIds?.length ?? 0) > 0
      ? taskRuntimePatchForWorkspace(group.workspaceId, workspace?.batchTaskIds ?? [], batchTasksById)
      : {};
    const runtimePatch = { ...browserPatch, ...taskPatch };
    const runningJobMeta = buildRunningJobMetaFromBrowserGroups(jobGroupsByWorkspace);
    return {
      jobGroupsByWorkspace,
      batchTasksById,
      runningJobMeta,
      workspaces: patchWorkspaceRuntime(state.workspaces, group.workspaceId, runtimePatch),
      ...(state.activeWorkspaceId === group.workspaceId ? activeRuntimePatch(runtimePatch) : {}),
    } as Partial<StudioState>;
  });
  if (accepted) scheduleAutoRetriesForBrowserGroup(group);
}

function sourceImagesForTask(task: Pick<BatchTaskRecord, "mode" | "sourceImages" | "sourceImagePaths">): SourceImage[] {
  if (task.mode !== "edit") return [];
  return (task.sourceImages?.length ?? 0) > 0
    ? task.sourceImages ?? []
    : sourceImagesFromPaths(task.sourceImagePaths);
}

function panoramaRoundtripFromSources(sources: SourceImage[] | undefined): HistoryItem["panoramaRoundtrip"] {
  return findPanoramaRoundtripRef(sources) ?? undefined;
}

function sourceIdentityForBrowserGroupSlot(group: JobGroupSnapshot, slot: JobGroupSnapshot["slots"][number]): BrowserSourceIdentity {
  const state = useStudioStore.getState();
  const workspace = state.workspaces.find((entry) => entry.id === group.workspaceId);
  const slotIndex = slotIndexForGroupSlot(group, slot);
  const task = findTaskForJobSlot(workspace?.batchTaskIds ?? [], state.batchTasksById, group.workspaceId, slotIndex, slot.jobId);
  const sourceImages = task ? sourceImagesForTask(task) : sourceImagesFromPaths(group.sourceImagePaths);
  return {
    batchSourcePath: task?.batchSourcePath,
    size: task?.size,
    sourceImages: sourceImages.length > 0 ? sourceImages : undefined,
    panoramaRoundtrip: task?.panoramaRoundtrip ?? panoramaRoundtripFromSources(sourceImages),
  };
}

function applyBrowserJobGroupsForWorkspaceToStore(
  workspaceId: string,
  groups: JobGroupSnapshot[],
) {
  useStudioStore.setState((state) => {
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
    const visibleGroups = filterVisibleJobGroupsForWorkspace(workspace, groups);
    const jobGroupsByWorkspace = replaceWorkspaceJobGroups(state.jobGroupsByWorkspace, workspaceId, visibleGroups);
    let batchTasksById = state.batchTasksById;
    for (const group of visibleGroups) {
      batchTasksById = updateTasksFromJobGroup(
        batchTasksById,
        workspace?.batchTaskIds ?? [],
        group,
      );
    }
    const knownJobIds = new Set(visibleGroups.flatMap((group) => group.slots.map((slot) => slot.jobId)));
    batchTasksById = markMissingJobTasksInterrupted(
      batchTasksById,
      workspace?.batchTaskIds ?? [],
      knownJobIds,
    );
    const browserPatch = browserRuntimePatchFromGroups(
      jobGroupsByWorkspace[workspaceId] ?? [],
      workspace?.continuousGenerateTest === true,
    );
    const taskPatch = (workspace?.batchTaskIds?.length ?? 0) > 0
      ? taskRuntimePatchForWorkspace(workspaceId, workspace?.batchTaskIds ?? [], batchTasksById)
      : {};
    const runtimePatch = { ...browserPatch, ...taskPatch };
    const runningJobMeta = buildRunningJobMetaFromBrowserGroups(jobGroupsByWorkspace);
    return {
      jobGroupsByWorkspace,
      batchTasksById,
      runningJobMeta,
      workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, runtimePatch),
      ...(state.activeWorkspaceId === workspaceId ? activeRuntimePatch(runtimePatch) : {}),
    } as Partial<StudioState>;
  });
  const workspace = useStudioStore.getState().workspaces.find((entry) => entry.id === workspaceId);
  for (const group of filterVisibleJobGroupsForWorkspace(workspace, groups)) scheduleAutoRetriesForBrowserGroup(group);
  syncBrowserJobSubscriptions(useStudioStore.getState().jobGroupsByWorkspace);
}

function resolveWorkspaceIdForBrowserJob(jobId: string): string {
  const state = useStudioStore.getState();
  const fromMeta = state.runningJobMeta[jobId]?.workspaceId;
  if (fromMeta) return fromMeta;
  for (const task of Object.values(state.batchTasksById)) {
    if (task.jobId === jobId) return task.workspaceId;
  }
  return "";
}

function browserJobStillLooksActive(jobId: string): boolean {
  const state = useStudioStore.getState();
  if (state.runningJobMeta[jobId]) return true;
  return Object.values(state.batchTasksById).some((task) => (
    task.jobId === jobId && (task.status === "running" || task.status === "queued")
  ));
}

function findBrowserJobGroupSlot(
  groups: JobGroupSnapshot[],
  jobId: string,
): { group: JobGroupSnapshot; slot: JobGroupSnapshot["slots"][number] } | null {
  for (const group of groups) {
    const slot = group.slots.find((entry) => entry.jobId === jobId);
    if (slot) return { group, slot };
  }
  return null;
}

async function refreshBrowserJobGroupsForWorkspace(workspaceId: string, jobId?: string): Promise<void> {
  if (!workspaceId || !isBackgroundTaskProxyMode()) return;
  const existing = browserJobRefreshes.get(workspaceId);
  if (existing) {
    await existing;
    return;
  }
  const listJobGroups = isAndroidTaskProxyMode() ? listAndroidJobGroups : listBrowserJobGroups;
  const task = (async () => {
    try {
      const response = await listJobGroups(workspaceId);
      const workspace = useStudioStore.getState().workspaces.find((entry) => entry.id === workspaceId);
      const visibleGroups = filterVisibleJobGroupsForWorkspace(workspace, response.groups);
      applyBrowserJobGroupsForWorkspaceToStore(workspaceId, visibleGroups);
      if (!jobId) return;
      const match = findBrowserJobGroupSlot(visibleGroups, jobId);
      if (!match || match.slot.status !== "succeeded") return;
      await syncHistoryItemFromBrowserJobSlot(match.group, match.slot, {
        updateWorkspaceSelection: true,
      });
    } catch {
      // Ignore refresh failures; the next job update or reload will reconcile state.
    } finally {
      browserJobRefreshes.delete(workspaceId);
    }
  })();
  browserJobRefreshes.set(workspaceId, task);
  await task;
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
  const taskForOutputSync = Object.values(store.getState().batchTasksById).find((task) => (
    task.workspaceId === group.workspaceId && task.jobId === slot.jobId
  ));
  const shouldSyncBatchOutput = !!taskForOutputSync && taskForOutputSync.historyItemId !== browserHistoryId(slot.jobId);
  const existing = store.getState().history.find((item) => item.id === browserHistoryId(slot.jobId)) ?? null;
  const historyItem = await buildHistoryItemFromBrowserSlot(group, slot, existing, {
    batchSourcePath: taskForOutputSync?.batchSourcePath,
    size: taskForOutputSync?.size,
    sourceImages: taskForOutputSync ? sourceImagesForTask(taskForOutputSync) : undefined,
    panoramaRoundtrip: taskForOutputSync?.panoramaRoundtrip,
  });
  if (!historyItem) return;
  const activeItem: HistoryItem = {
    ...historyItem,
    previewOnly: false,
  };
  store.setState((state) => {
    const nextHistory = trimHistory([
      historyItem,
      ...state.history.filter((item) => item.id !== historyItem.id),
    ]);
    const workspace = state.workspaces.find((entry) => entry.id === group.workspaceId);
    const mergedBatch = mergeWorkspaceBatchResult(state, group.workspaceId, historyItem, nextHistory);
    const batchResults = state.activeWorkspaceId === group.workspaceId
      ? mergedBatch.batchResults
      : state.batchResults;
    const continuousGroup = group.continuousGenerateTest === true;
    const batchTasksById = updateTaskFromHistoryItem(
      state.batchTasksById,
      workspace?.batchTaskIds ?? [],
      group.workspaceId,
      historyItem,
    );
    const workspacePatch: WorkspacePatch = {
      batchResultIds: mergedBatch.batchResultIds,
      ...(options.updateWorkspaceSelection
        ? {
          currentImageId: historyItem.id,
          resultGridOpen: continuousGroup || group.batchCount > 1,
        }
        : {}),
    };
    return {
      history: nextHistory,
      batchTasksById,
      batchResults,
      workspaces: patchWorkspaceRuntime(state.workspaces, group.workspaceId, workspacePatch),
      ...(options.updateWorkspaceSelection && state.activeWorkspaceId === group.workspaceId
        ? {
            currentImage: continuousGroup || group.batchCount > 1 ? historyItem : activeItem,
            resultGridOpen: continuousGroup || group.batchCount > 1,
            maskDataURL: null,
            annotations: [],
            tool: "pan",
          }
        : {}),
    } as Partial<StudioState>;
  });
  await persistHistoryItem(historyItem).catch(() => undefined);
  persistTrimmedHistory(useStudioStore.getState().history);
  const autoPastedPanorama = await autoPastePanoramaRoundtripResult(historyItem, {
    workspaceId: group.workspaceId,
    selectAsCurrent: options.updateWorkspaceSelection && group.continuousGenerateTest !== true && group.batchCount <= 1,
  }).catch((error: any) => {
    store.getState().pushToast(`全景贴回失败: ${error?.message ?? error}`, "warn", 4200);
    return null;
  });
  if (shouldSyncBatchOutput) {
    syncBatchOutputAfterSuccess(batchProcessLinkFromTask(taskForOutputSync), historyItem.savedPath);
  }
  if (taskForOutputSync) clearAutoRetryTimer(taskForOutputSync.id);
  const state = useStudioStore.getState();
  if (autoPastedPanorama) {
    state.pushToast("已自动贴回全景图", "success", 3200);
  }
  if (state.apiKey.trim() && providerRequiresDirectAPIKey(state.apiMode)) {
    syncCLIConfigQuietly(cliConfigFromState(state, { apiKey: state.apiKey.trim() }));
  }
}

function ensureBrowserJobSubscription(jobId: string) {
  if (!jobId || browserJobSubscriptions.has(jobId)) return;
  const subscribe = isAndroidTaskProxyMode() ? subscribeToAndroidJob : subscribeToBrowserJob;
  const reconcileIfStreamEndedEarly = () => {
    const workspaceId = resolveWorkspaceIdForBrowserJob(jobId);
    const shouldRefresh = browserJobStillLooksActive(jobId);
    clearBrowserJobSubscription(jobId);
    if (!shouldRefresh || !workspaceId) return;
    void refreshBrowserJobGroupsForWorkspace(workspaceId, jobId);
  };
  const off = subscribe(jobId, (event) => {
    const workspace = useStudioStore.getState().workspaces.find((entry) => entry.id === event.group.workspaceId);
    if (!isJobGroupVisibleForWorkspace(workspace, event.group)) {
      if (event.type === "cancelled" || event.type === "error" || event.type === "terminal") {
        clearBrowserJobSubscription(jobId);
      }
      return;
    }
    applyBrowserJobGroupToStore(event.group);
    if (event.type === "terminal" && event.slot.status === "succeeded") {
      void syncHistoryItemFromBrowserJobSlot(event.group, event.slot, {
        updateWorkspaceSelection: true,
      });
      clearBrowserJobSubscription(jobId);
      void pumpContinuousQueue(event.group.workspaceId, normalizeAPIMode(event.group.apiMode));
      return;
    }
    if (event.type === "cancelled" || event.type === "error" || event.type === "terminal") {
      clearBrowserJobSubscription(jobId);
      void pumpContinuousQueue(event.group.workspaceId, normalizeAPIMode(event.group.apiMode));
    }
  }, () => {
    reconcileIfStreamEndedEarly();
  }, () => {
    reconcileIfStreamEndedEarly();
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
  promptPrefix: "",
  prompt: "",
  optimizationGuidance: "",
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
  editAutoAspectUserLocked: false,
  profiles: [],
  activeProfileId: "",
  sources: [],
  reversePromptImage: null,

  runningJobs: [],
  jobsTotal: 0,
  jobsCompleted: 0,
  jobsFailed: 0,
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
  batchTasksById: {},

  currentImage: null,
  sourcePreviewReturnImage: null,
  panoramaViewerItem: null,
  panoramaAlignTarget: null,
  history: [],
  historyHasMore: false,
  historyLoading: false,
  historyCursorBeforeDayStart: null,
  batchResults: [],
  selectedBatchTaskId: null,
  resultGridOpen: false,
  historyGalleryOpen: false,
  historyGallerySinglePreviewId: null,
  historyGallerySort: "newest",
  materialManagerOpen: false,
  materialGroups: [],
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
  compareMode: "curtain",
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
  continuousGenerateTest: false,
  editSourceMode: "manual",
  batchProcess: defaultBatchProcessConfig(),
  presets: [],
  theme: "system",
  fontScale: 1,
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true, upstreamModalOpen: false }),
  closeSettings: () => set({ settingsOpen: false }),
  isTestingKey: false,
  isOptimizingPrompt: false,
  isReversingPrompt: false,
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
  resetCurrentWorkspaceDraft: () => {
    const state = get();
    if (state.isOptimizingPrompt || state.isReversingPrompt) {
      state.pushToast("Cannot reset the current workspace while prompt tasks are running", "warn", 2600);
      return;
    }
    const workspaceId = state.activeWorkspaceId;
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
    const preservedTaskIds = activeBatchTaskIdsForReset(workspaceId, workspace?.batchTaskIds ?? [], state.batchTasksById);
    const taskPatch = taskRuntimePatchForWorkspace(workspaceId, preservedTaskIds, state.batchTasksById);
    const runtime = workspaceRuntimeFromState(state, workspaceId);
    const preservedRunningJobs = taskPatch.runningJobs ?? [];
    const preservedStreamPreviews = preserveStreamPreviewsForJobs(runtime.streamPreviews ?? {}, preservedRunningJobs);
    const preservedStreamPreview = preservedRunningJobs.length > 0
      ? (runtime.streamPreview && preservedStreamPreviews[runtime.streamPreview.jobId]
        ? runtime.streamPreview
        : Object.values(preservedStreamPreviews)[0] ?? null)
      : null;
    const hasPreservedTasks = preservedTaskIds.length > 0;
    const resetPatch: WorkspacePatch = {
      promptPrefix: "",
      prompt: "",
      optimizationGuidance: "",
      negativePrompt: "",
      mode: "generate",
      size: "1024x1024",
      quality: "medium",
      outputFormat: "png",
      seed: 0,
      batchCount: 1,
      continuousGenerateTest: false,
      editSourceMode: "manual",
      batchProcess: defaultBatchProcessConfig(),
      editAutoAspectUserLocked: false,
      styleTag: "",
      sources: [],
      currentImageId: null,
      batchResultIds: [],
      batchTaskIds: preservedTaskIds,
      selectedBatchTaskId: null,
      batchSinglePreviewOpen: false,
      resultGridOpen: hasPreservedTasks,
      historyGalleryOpen: false,
      historyGallerySinglePreviewId: null,
      historyGallerySort: "newest",
      ...taskPatch,
      progress: preservedRunningJobs.length > 0 ? runtime.progress : null,
      streamPreview: preservedStreamPreview,
      streamPreviews: preservedRunningJobs.length > 0 ? preservedStreamPreviews : {},
      lastLogLine: preservedRunningJobs.length > 0 ? runtime.lastLogLine : "",
      errorMessage: null,
      errorRawPath: null,
      lastPayload: null,
    };
    set((current) => ({
      promptPrefix: "",
      prompt: "",
      optimizationGuidance: "",
      negativePrompt: "",
      mode: "generate",
      size: "1024x1024",
      quality: "medium",
      outputFormat: "png",
      seed: 0,
      batchCount: 1,
      continuousGenerateTest: false,
      editSourceMode: "manual",
      batchProcess: defaultBatchProcessConfig(),
      editAutoAspectUserLocked: false,
      styleTag: "",
      sources: [],
      reversePromptImage: null,
      currentImage: null,
      sourcePreviewReturnImage: null,
      batchResults: [],
      selectedBatchTaskId: null,
      resultGridOpen: hasPreservedTasks,
      historyGalleryOpen: false,
      historyGallerySort: "newest",
      compareB: null,
      compareMode: "curtain",
      maskDataURL: null,
      strokes: [],
      annotations: [],
      selectedAnnotationId: null,
      undoStack: [],
      redoStack: [],
      runningJobs: preservedRunningJobs,
      jobsTotal: taskPatch.jobsTotal ?? 0,
      jobsCompleted: taskPatch.jobsCompleted ?? 0,
      jobsFailed: taskPatch.jobsFailed ?? 0,
      progress: resetPatch.progress ?? null,
      streamPreview: preservedStreamPreview,
      streamPreviews: resetPatch.streamPreviews ?? {},
      lastLogLine: resetPatch.lastLogLine ?? "",
      errorMessage: null,
      errorRawPath: null,
      isRunning: preservedRunningJobs.length > 0,
      lastPayload: null,
      workspaces: patchWorkspaceRuntime(current.workspaces, workspaceId, resetPatch),
    }));
    get().pushToast("Current workspace draft has been reset", "success", 2200);
  },
  setContinuousPressureLimit: async (limit) => {
    const normalized = normalizeConcurrencyLimit(limit);
    const activeId = get().activeProfileId;
    if (!activeId) {
      get().pushToast("Select an API profile before changing the saved concurrency limit", "warn", 2600);
      return;
    }
    const ok = await get().updateProfile(activeId, { concurrencyLimit: normalized });
    if (!ok) {
      get().pushToast("Failed to update the saved concurrency limit", "error", 2600);
      return;
    }
    get().pushToast(normalized > 0 ? `Saved concurrency limit set to ${normalized}` : "Saved concurrency limit cleared", "success", 2200);
    if (normalized > 0) {
      void pumpContinuousQueue(get().activeWorkspaceId, effectiveAPIModeForSubmit(get().mode, get().apiMode));
    }
  },
  runContinuousPressureTest: async (count) => {
    const total = Math.max(1, Math.min(100, Math.floor(Number(count) || 1)));
    const state = get();
    if (!state.continuousGenerateTest) {
      get().pushToast("Enable continuous generation before starting this test", "warn", 2600);
      return;
    }
    const effectiveAPIMode = effectiveAPIModeForSubmit("generate", state.apiMode);
    if (!shouldUseBackgroundTaskProxyForSubmit(effectiveAPIMode)) {
      get().pushToast("Continuous pressure test is only available in browser task proxy mode", "warn", 3000);
      return;
    }
    if (state.mode !== "generate") {
      set({ mode: "generate" });
      set({ workspaces: patchWorkspaceRuntime(get().workspaces, get().activeWorkspaceId, { mode: "generate" }) });
    }
    const latest = get();
    const workspaceId = latest.activeWorkspaceId;
    const startIndex = nextBatchSlotStartForWorkspace(latest, workspaceId);
    const activeProfile = latest.profiles.find((profile) => profile.id === latest.activeProfileId);
    const apiProfileSnapshot = apiProfileSnapshotForSubmit(activeProfile, latest.activeProfileId);
    const concurrencyLimit = effectiveConcurrencyLimitForProfile(latest, effectiveAPIMode, activeProfile?.id || latest.activeProfileId);
    const resolvedSize = normalizeSizeSelection(latest.size, {
      apiMode: effectiveAPIMode,
      requestPolicy: latest.requestPolicy,
      imageModelID: latest.imageModelID,
      mode: latest.mode,
    });
    const createdAt = Date.now();
    const submittedTasks = Array.from({ length: total }, (_, index) => {
      const slotIndex = startIndex + index;
      return createBatchTaskRecord({
        workspaceId,
        slotIndex,
        mode: "generate",
        apiMode: effectiveAPIMode,
        ...apiProfileSnapshot,
        prompt: pressurePrompt(slotIndex),
        size: resolvedSize,
        quality: latest.quality,
        outputFormat: latest.outputFormat,
        requestPolicy: latest.requestPolicy,
        imagesNewAPICompat: effectiveAPIMode === "images" && latest.imagesNewAPICompat === true,
        textModelID: latest.textModelID,
        imageModelID: latest.imageModelID,
        seed: latest.seed ? latest.seed + index : 0,
        negativePrompt: latest.negativePrompt,
        styleTag: latest.styleTag,
        sourceImagePaths: [],
        maskB64: "",
        queuedReason: concurrencyLimit > 0 ? "local_concurrency" : undefined,
        createdAt: createdAt + index,
      });
    });
    const submittedTaskIds = submittedTasks.map((task) => task.id);
    const previousBatchTaskIds = latestWorkspaceTaskIds(latest, workspaceId);
    const nextBatchTaskIds = [...previousBatchTaskIds, ...submittedTaskIds];
    const nextBatchTasksById = upsertBatchTasks(latest.batchTasksById, submittedTasks);
    const runtimePatch = taskRuntimePatchForWorkspace(workspaceId, nextBatchTaskIds, nextBatchTasksById);
    const lastPrompt = submittedTasks[submittedTasks.length - 1]?.prompt ?? latest.prompt;
    set((current) => ({
      mode: "generate",
      prompt: lastPrompt,
      promptPrefix: "",
      batchCount: 1,
      batchTasksById: nextBatchTasksById,
      selectedBatchTaskId: null,
      resultGridOpen: true,
      historyGalleryOpen: false,
      errorMessage: null,
      errorRawPath: null,
      ...activeRuntimePatch(runtimePatch),
      workspaces: patchWorkspaceRuntime(current.workspaces, workspaceId, {
        mode: "generate",
        prompt: lastPrompt,
        promptPrefix: "",
        batchCount: 1,
        batchTaskIds: nextBatchTaskIds,
        selectedBatchTaskId: null,
        batchResultIds: current.workspaces.find((workspace) => workspace.id === workspaceId)?.batchResultIds ?? [],
        resultGridOpen: true,
        historyGalleryOpen: false,
        ...runtimePatch,
      }),
    } as Partial<StudioState>));
    void pumpContinuousQueue(workspaceId, effectiveAPIMode);
    get().pushToast(`Queued ${total} continuous generation tasks`, "success", 2600);
  },
  workspaces: [],
  activeWorkspaceId: "",
  styleTag: "",

  setField: (key, value) => {
    // 濠电姷鏁告慨鐑藉极閹间礁纾婚柣鎰惈閸ㄥ倿鏌涢锝嗙缂佺姳鍗抽弻鐔兼⒒鐎电濡介梺鍝勬噺缁诲牓寮婚弴鐔风窞闁糕剝蓱閻濇洟姊虹粙娆惧剰妞わ妇鏁诲璇测槈閵忕姷顔掗梺鐓庛偢椤ゅ倿宕ぐ鎺撯拺缂佸顑欓崕鎰版煙閸涘﹥鍊愰柛鈹垮劜瀵板嫭绻涢悙顒傗偓璇测攽閳藉棗鐏ョ€规洜鏁诲鎶芥晜閹存帞绠?apiKey / baseURL / textModelID / imageModelID / apiMode)闂?
    // active profile 闂傚倸鍊搁崐鎼佸磹閻戣姤鍊块柨鏇炲€归崕鎴犳喐閻楀牆绗掔紒鈧径灞稿亾閸忓浜鹃梺閫炲苯澧撮柛鈹惧亾濡炪倖甯婄粈渚€宕甸鍕厱婵☆垰鐏濋ˉ宥囨喐妫颁胶绐旀慨濠呮閹叉挳宕熼銏犘﹀┑鐘愁問閸犳捇宕愬┑鍡欐殾闁硅揪绠戞儫闂佸啿鎼崐濠氬储娴犲鈷戦柛婵嗗閳ь剚鎮傞幃妯衡攽鐎ｎ亞鐣洪梺鐟邦嚟閸嬬喓绮绘ィ鍐╃厱妞ゆ劑鍊曢弸鎴炪亜閵夈儳澧﹂柡?闂傚倸鍊搁崐鎼佸磹閻戣姤鍤勯柛顐ｆ礀绾惧潡鏌ｉ姀銏╃劸闁汇倗鍋撶换娑㈠箣濞嗗繒浠鹃梺绋款儍閸婃繈寮婚弴鐔虹鐟滃秶鈧凹鍘奸埢?set 濠电姷鏁告慨鐑姐€傞鐐潟闁哄洢鍨圭壕濠氭煙鏉堝墽鐣辩痪鎹愵潐缁绘盯骞嬮悙鍐╁哺瀵悂寮介妸褏顔曢梺鐟扮摠閻熴儵鎮橀鍫熺厱閹兼番鍨归悘鎾煛瀹€瀣埌閾绘牠鏌嶈閸撶喖骞冭缁犳稑鈽夊Ο鐓庡箳闂備礁鎼崯顐﹀磹閻㈢纾婚柟鎹愬吹瀹撲線鏌涢…鎴濇灈濠殿喖楠搁埞鎴﹀煡閸℃ぞ绨煎銈冨妼閿曨亪鐛崱妯肩懝闁逞屽墴閵嗕礁鈻庨幋婊呭墾闂佸搫绋侀悡鍫濐焽閺冨牊鈷掑ù锝呮啞閹牓鏌涙繝鍌涜础闁逞屽墰閻熸娊宕惰濡兘鎮峰鍛暭閻㈩垱顨婂畷?闂傚倸鍊搁崐鎼佸磹瀹勬噴褰掑炊椤掆偓杩濋梺閫炲苯澧撮柡灞剧〒閳ь剨缍嗛崑鍛暦瀹€鍕厸鐎光偓鐎ｎ剛袦闂佽鍠撻崹鑽ゅ垝濞嗗繆鏋庨柣鎰靛墻濡棝姊婚崒娆戭槮闁圭⒈鍋勮灋婵炲棙鎸婚崵灞轿旈敐鍛殭闁绘挴鈧剚鐔嗛柤鎼佹涧婵洨绱掗悩宸吋闁哄瞼鍠愰敍鎰媴娓氼垱袦闂備礁鎲￠幐绋跨暦椤掑嫧鈧棃宕橀鍢壯囨煕閳╁喚娈旀い顐㈢焸濮婃椽妫冨☉姘叡濡炪値鍘奸悧鎾诲箖妤ｅ啯鍊婚柦妯猴級閵娾晜鐓冮柛婵嗗閺€濠氭煛閸滀礁澧柍瑙勫灴椤㈡瑩寮妶鍕繑闂備胶顭堟鎼佸床閼煎墎浜欓梻浣告啞娓氭宕伴弽顓炵劦妞ゆ巻鍋撻柣鏍с偢閹繝顢曢敃鈧悙濠囨煏婵犲繒鐣辩痪鏉跨Ф缁辨捇宕掑姣欙繝鏌ｉ幒鐐差洭闁瑰箍鍨归埥澶愬閻樻鍚呮俊鐐€栭幐鑽ゆ崲閸儱纾绘俊銈勮兌缁♀偓?
    // 闂傚倸鍊搁崐椋庣矆娓氣偓楠炴牠顢曚綅閸ヮ剦鏁冮柨鏇楀亾闁汇倗鍋撶换婵囩節閸屾粌顤€闂佺顑戠换婵嬪蓟閺囥垹閱囨繝闈涙川閳规稒绻濆▓鍨灍濠电偛锕鏄忣樁缂佺姵鐩獮姗€宕橀懠鍓佺闂傚倷鑳堕…鍫ヮ敄閸℃稑绠伴柟闂寸閻撯€愁熆鐠哄彿鍫ュ几鎼搭澀绻嗘い鏍ㄧ箓閸氬綊鏌￠崱顓㈡濞ｅ洤锕幃娆擃敂閸曘劌浜鹃柡宥庡幖閽冪喖鏌曟繛鐐珕闁稿孩顨呴湁闁挎繂鐗婇鐘测槈閹惧磭校缂佺粯鐩獮瀣枎韫囨洑鎮ｉ柣搴ｆ嚀閹诧紕鎹㈤崘顏呭床婵炴垯鍨洪弲鏌ュ箹缁厜鍋撻崘鑼吅闂傚倷鑳堕…鍫ヮ敄閸℃稑绠插ù锝堟娑撳秵绻涢幋娆忕仼闁告濞婇弻锝夊籍閸偅顥栧┑?updateProfile / setActiveProfile 闂傚倸鍊搁崐椋庣矆娓氣偓楠炴牠顢曚綅閸ヮ剦鏁冮柨鏇楀亾闁汇倗鍋撶换婵囩節閸屾粌顤€闂佺顑戠换婵嬪蓟閺囥垹閱囨繝闈涙搐椤︹晠姊虹粙娆惧剱闁绘濮撮锝夊醇閺囩偤鍞跺┑鐐村灦閿氭い顒€顑夊?action闂傚倸鍊搁崐鎼佸磹妞嬪孩顐芥慨姗嗗墻閻掔晫鎲稿鍫罕婵犲痉鏉库偓鏇㈠箠鎼达絽顥氱憸鐗堝笚閻撴洘绻濋棃娑橆仼闁告梹绮嶉妵鍕敃閿濆棛顦伴梺鍝勭灱閸犳劕顭囪箛娑樼鐟滃繘寮抽悩缁樷拺婵炶尪顕ч獮妤併亜閵娿儻韬€殿喖顭烽幃銏㈡偘閳ュ厖澹曢梺姹囧灪椤旀牠鎮為幆顬″綊鎮崨顖滄殼闂?
    // 闂傚倸鍊搁崐鎼佸磹閻戣姤鍤勯柛顐ｆ磸閳ь兛鐒︾换婵嬪炊瑜庡Σ顒勬⒑閸濆嫮鈻夐柛妯垮亹缁寮跺▎鐐瘜闁诲函缍嗘禍婵嬪箲閿濆鐓曟俊銈勭閸濇椽鏌熼绛嬫當闁宠棄顦埢搴∥熼悡搴⌒ㄩ梻?闂傚倸鍊搁崐鎼佸磹閻戣姤鍊块柨鏇炲€归崕鎴犳喐閻楀牆绗掗柛銊ュ€搁埞鎴︽偐鐎圭姴顥濈紓浣瑰姈椤ㄥ牓鍩€椤掆偓缁犲秹宕曢崡鐐嶆盯顢橀悙鈺傜亖婵炲濮撮鍡涙偂閺囥垺鐓忓鑸得弸娑橆熆瑜滈崳锝夊箖濡も偓椤繈顢楁径瀣ф瀰闂備礁鎼惌澶岀礊娴ｅ壊鍤曟い鏇楀亾鐎规洘鍎奸ˇ鏌ユ煙椤栨粌浠х紒杈ㄦ尰閹峰懘宕崟鎴欏劦閺屾稖绠涢弮鎾光偓璺ㄢ偓?set 濠电姷鏁告慨鐑藉极閹间礁纾婚柣鎰惈閸ㄥ倿鏌涢锝嗙缂佺姳鍗抽弻鐔虹磼閵忕姵鐏堢紒鐐劤椤兘寮婚悢鍏煎€锋い鎺嶈兌娴煎洤鈹戦埄鍐ㄧ祷闁绘鎹囧濠氭偄閸忕厧鈧攱銇勯幒鍡椾壕婵犫拃灞界仸闁哄本绋掗幆鏃堝閳藉棙顥堥梻浣告惈閺堫剙煤閻旈鏆﹂柛妤冨€ｉ弮鍌楀亾閿濆簼绨绘い顐ゅТ閳规垿鎮欏顔兼婵犳鍨伴顓犲垝婵犳艾绠荤€规洖娲﹀▓楣冩⒑閸︻厼鍔嬮柛銊у枛瀵劍绂掔€ｎ偆鍘甸梻渚囧弿缁犳垶鏅堕鐐寸厸?UI 濠电姷鏁告慨鐑藉极閹间礁纾婚柣鎰惈閸ㄥ倿鏌涢锝嗙缂佺姳鍗抽弻娑樷攽閸曨偄濮㈤梺娲诲幗閹瑰洭寮诲☉銏╂晝闁挎繂妫涢ˇ銉╂⒑閹肩偛濡奸柛濠傛健閻涱噣寮介‖銉ラ叄椤㈡鍩€椤掍椒绻嗗ù鐘差儐閻撴洖鈹戦悩鎻掝仼闁告ɑ鎸抽弻鈥崇暆閳ь剟宕伴弽顓炵疇闁哄稁鍘奸悡娑樏归敐澶嬫暠闁活偄绻樺?
    if (key === "apiMode" || key === "baseURL" || key === "apiKey" ||
        key === "textModelID" || key === "imageModelID") {
      if (typeof console !== "undefined") {
        console.warn(`setField("${String(key)}", ...) 收到 undefined，已忽略，请检查调用方是否漏传字段值`);
      }
      set({ [key]: value } as any);
      return;
    }
    // 闂傚倸鍊搁崐鎼佸磹閻戣姤鍤勯柛顐ｆ磵閳ь剨绠撳畷濂稿閳ュ啿绨ラ梻浣烘嚀閻°劎鎹㈤幇鐗堝殌闁秆勵殕閻撴洟鏌ㄩ弮鍥跺殭妤犵偞鐗犻弻娑㈠Ω閿斿墽鐣洪梺闈涙搐鐎氫即鐛幒妤€绠ｆ繝鍨姃閹絿绱撻崒娆掝唹闁稿鎹囬弻娑樼暆閳ь剟宕戦悙鐑樺亗闊洦鎸撮弨浠嬫煟閹邦垰鐨哄ù鐘灲閺屾盯寮拠娴嬪亾閺嶎偅宕叉繝闈涱儏閻掑灚銇勯幒宥囶槮妞ゆ洟浜堕幃妤€鈽夊▎妯煎姺闂佸憡锕㈡禍鍫曞蓟閿濆棙鍎熸い鏍ㄧ矌鏍″┑鐐茬摠缁酣宕戦悢鍝勫灊缂備焦锚椤曢亶鎮楀☉娆樼劷闁告﹩浜娲礈閹绘帊绨撮梺鎼炲妼閹碱偊鍩㈠澶婂嵆闁靛骏绱曢崢鎾绘偡濠婂嫮鐭掔€规洘绮岄～婵囨綇閳哄啰鍘梻浣告贡閸庛倝濡靛鍫濈劦妞ゆ巻鍋撻柛鐔告綑閻ｇ兘宕￠悙鈺傤潔闁哄鐗勯崝宥呪枍?
    const stateBefore = get();
    const workspaceId = stateBefore.activeWorkspaceId;
    const previousWorkspace = stateBefore.workspaces.find((workspace) => workspace.id === workspaceId);
    const normalizedValue = key === "batchCount"
      ? normalizeBatchCount(value)
      : key === "editSourceMode"
        ? normalizeEditSourceMode(value)
        : key === "batchProcess"
          ? normalizeBatchProcessConfig(value)
          : value;
    set({ [key]: normalizedValue } as any);
    if (key === "currentImage") {
      const item = normalizedValue as HistoryItem | null;
      const workspace = get().workspaces.find((w) => w.id === get().activeWorkspaceId);
      const isSourcePreview = item?.id?.startsWith("source-preview-") === true;
      const currentPreviewReturnImage = get().sourcePreviewReturnImage;
      set({
        compareB: null,
        compareMode: "curtain",
        sourcePreviewReturnImage: isSourcePreview && currentPreviewReturnImage ? currentPreviewReturnImage : null,
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
    } else if (key === "size") {
      const workspacePatch: WorkspacePatch = { size: normalizedValue as SizeValue };
      if (
        stateBefore.mode === "edit"
        && stateBefore.editSourceMode === "manual"
        && stateBefore.batchProcess.autoAspectResolution !== ""
      ) {
        workspacePatch.editAutoAspectUserLocked = true;
      }
      set({
        workspaces: patchWorkspaceRuntime(get().workspaces, workspaceId, workspacePatch),
      });
    } else if (key === "continuousGenerateTest") {
      set({ workspaces: patchWorkspaceRuntime(get().workspaces, get().activeWorkspaceId, { continuousGenerateTest: normalizedValue as boolean }) });
    } else if (key === "editSourceMode") {
      set({ workspaces: patchWorkspaceRuntime(get().workspaces, get().activeWorkspaceId, { editSourceMode: normalizedValue as EditSourceMode }) });
      if ((normalizedValue as EditSourceMode) === "manual" || (normalizedValue as EditSourceMode) === "batch") {
        void syncSharedEditAutoAspect({ getState: get, setState: set });
      }
    } else if (key === "batchProcess") {
      set({ workspaces: patchWorkspaceRuntime(get().workspaces, get().activeWorkspaceId, { batchProcess: normalizedValue as StudioState["batchProcess"] }) });
      const previousResolution = previousWorkspace?.batchProcess.autoAspectResolution ?? stateBefore.batchProcess.autoAspectResolution;
      const nextResolution = (normalizedValue as StudioState["batchProcess"]).autoAspectResolution;
      if (previousResolution !== nextResolution) {
        void syncSharedEditAutoAspect(
          { getState: get, setState: set },
          { resetUserLock: true },
        );
      } else if (stateBefore.mode === "edit" && stateBefore.editSourceMode === "batch") {
        void syncSharedEditAutoAspect({ getState: get, setState: set });
      }
    } else if (key === "promptPrefix") {
      set({ workspaces: patchWorkspaceRuntime(get().workspaces, get().activeWorkspaceId, { promptPrefix: normalizedValue as string }) });
    } else if (key === "optimizationGuidance") {
      set({ workspaces: patchWorkspaceRuntime(get().workspaces, get().activeWorkspaceId, { optimizationGuidance: normalizedValue as string }) });
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
    } else if (key === "mode" && normalizedValue === "edit") {
      void syncSharedEditAutoAspect({ getState: get, setState: set });
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
        ? `Android 全屏切换失败：${error?.message ?? error}`
        : `全屏切换失败：${error?.message ?? error}`;
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
      // 婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柟闂寸绾剧粯绻涢幋鐐垫噧缂佸墎鍋ら弻娑㈠Ψ椤旂厧顫╃紓浣插亾闁割偆鍠撶弧鈧梻鍌氱墛缁嬫帡鏁嶉弮鍫熺厾?active profile,闂?key 婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柟闂寸绾剧粯绻涢幋鐐垫噧缂佸墎鍋ら弻娑㈠Ψ椤旂厧顫╃紓浣插亾闁割偆鍠撶弧鈧梻鍌氱墛娓氭宕曡箛鏇犵＜闁逞屽墴瀹曞ジ濡烽敂鎯у箺婵犲痉鏉库偓鎰板磻閹剧粯鐓熸俊銈傚亾缂佺粯锕㈠畷?闂傚倸鍊搁崐鎼佸磹瀹勯偊娓婚柟鐑樻⒐椤洘銇勯弮鈧崕宕囨閵堝憘鏃堟晲閸涱厽娈查梺绋款儜缁绘繈寮婚弴銏犻唶婵犲灚鍔栨晥闂?warning 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偞鐗犻、鏇㈡晝閳ь剛澹曡ぐ鎺撶厱鐟滃酣銆冮崨瀛樺€块柛顭戝亖娴滄粓鏌熼崫鍕ラ柛蹇撶焸閺屾洟宕卞Ο鐑樿癁闂佸搫鑻粔鍫曞箟閹绢喖绀嬫い鎰剁秬閻т線姊绘担鍛婃儓闁活剙銈稿畷浼村冀椤撶偟鐣哄┑鐘诧工閸氭﹢鎮㈤崗鍏煎劒闂侀潻瀵岄崢浠嬪吹閸愵喗鈷掗柛灞剧懆閸忓瞼绱掗鍛仸妤犵偞鐗犻、鏇㈠Χ閸℃绨ユ繝鐢靛█濞佳兠洪敐鍥ㄥ床?
      if (typeof console !== "undefined") console.warn("setAPIKey: no active profile; ignoring save request");
      return;
    }
    // 濠电姷鏁告慨鐑姐€傞鐐潟闁哄洢鍨圭壕濠氭煙鏉堝墽鐣辩痪鎹愵潐缁绘盯骞嬮悙鍐╁哺瀵悂寮介妸褏顔曢梺鐟扮摠閻熴儵鎮橀鍫熺厱閹兼番鍨归悘銉╂婢舵劖鐓熼柟鎹愭珪閹癸綁鏌熼悾灞解枅闁哄苯绉归弻銊р偓锝庝簻椤秶绱撴担铏瑰笡缂佽鍟伴幑銏犫攽鐎ｎ亞锛滃┑顔斤供閸樹粙顢欓崟顖涒拻濞达絽鎲￠崯鐐烘煙闁稓绐旂€规洘鍨块獮鍥敊缁涘缍楅梻浣告贡閸庛倝銆冮崨顓囨稑螣閼姐倗顔曢梺绯曞墲閿氶柛鏂诲€濋弻娑㈠箻閹绘帒绁梺璇″枟椤ㄥ牓骞夐幘顔肩妞ゆ巻鍋撶痪鏉跨Т閳规垿鍩ラ崱妞剧凹缂備浇顕ч崐鍧椼€佸鑸垫櫜闁搞儻绲芥禍楣冩煟閵忋垺鏆╅柕鍡楋躬閺屾稓鈧綆鍋呯亸顓㈡煃閽樺妲搁柍璇茬Ч閹煎綊顢曢姀顫礉闂備浇顕栭崳顖滄崲濠靛鏄ラ柍?UI 缂傚倸鍊搁崐鎼佸磹閹间礁纾归柣鎴ｅГ閸婂潡鏌ㄩ弴鐐测偓鎼佹嫅閻斿吋鐓忓┑鐐靛亾濞呮捇鏌℃担绋款伃闁哄本绋戦埥澶愬础閻愯尙顔掗梻浣告惈濡酣宕愬┑瀣摕婵炴垯鍨归悞娲煕閹板吀绨存俊鎻掔墛缁绘稓澹曠€ｎ亙姹楁繝娈垮枤閸忔﹢宕洪埀顒併亜閹哄棗浜剧紓浣哄Т缁夌懓鐣烽弴銏＄劶鐎广儱鎳愰悿鍥⒑瑜版帒浜伴柛鐘冲浮瀹?keyring 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偛顦甸弫鎾绘偐閼碱剦妲烽梻浣告惈缁嬩線宕㈡禒瀣；闁跨喓濮甸悡蹇擃熆鐠虹儤顥炴繛鍛嚇閺岋綁顢橀悤浣圭杹闂佸搫鏈惄顖炲春閸曨垰绀冮柣鎰靛墻閸氬倿姊绘担瑙勫仩闁稿﹥鐗曠叅闁绘梻鍘ч拑鐔哥箾閹寸偟鐓繛宀婁邯閺屾稑鈻庡鍛Б缂備浇顔婄欢姘潖?
    set({ apiKey: trimmed });
    await SetStoredAPIKey(keyringUserFor(activeId), trimmed);
    if (trimmed) {
      syncCLIConfigQuietly(cliConfigFromState(get(), { apiKey: trimmed }));
    } else {
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
  selectBatchInputDir: async () => imageActions.selectBatchInputDir(),
  selectBatchInputFiles: async () => imageActions.selectBatchInputFiles(),
  refreshBatchInputDir: async () => imageActions.refreshBatchInputDir(),
  chooseBatchOutputDir: async () => imageActions.chooseBatchOutputDir(),
  importSourceImageFile: async (file) => imageActions.importSourceImageFile(file),
  selectReversePromptImage: async () => imageActions.selectReversePromptImage(),
  importReversePromptImageFile: async (file) => imageActions.importReversePromptImageFile(file),
  clearReversePromptImage: () => imageActions.clearReversePromptImage(),
  removeSource: (index) => imageActions.removeSource(index),
  clearSources: () => imageActions.clearSources(),
  reorderSources: (from, to) => imageActions.reorderSources(from, to),

  submit: async () => {
    return await submitCurrentRequest(get, set);
  },

  cancel: async () => {
    const s = get();
    const workspaceId = s.activeWorkspaceId;
    const ids = [...s.runningJobs];
    const workspace = s.workspaces.find((entry) => entry.id === workspaceId);
    const taskIds = workspace?.batchTaskIds ?? [];
    const cancelledTaskIds = sortedBatchTasksForWorkspace(workspaceId, taskIds, s.batchTasksById)
      .filter((task) => task.status === "queued" || task.status === "running")
      .map((task) => task.id);
    if (isBackgroundTaskProxyMode()) {
      for (const id of ids) {
        try { await wailsCancel(id); } catch { /* ignore */ }
      }
      const nextMeta = { ...get().runningJobMeta };
      for (const id of ids) delete nextMeta[id];
      const batchTasksById = markWorkspaceTasks(
        workspaceId,
        taskIds,
        get().batchTasksById,
        (task) => task.status === "queued" || task.status === "running",
        { status: "cancelled" },
      );
      const taskPatch = taskRuntimePatchForWorkspace(workspaceId, taskIds, batchTasksById);
      const cancelledPatch: WorkspacePatch = {
        ...taskPatch,
        runningJobs: [],
        progress: null,
        streamPreview: null,
        streamPreviews: {},
        lastLogLine: "",
      };
      set({
        runningJobs: [],
        isRunning: false,
        progress: null,
        streamPreview: null,
        streamPreviews: {},
        lastLogLine: "",
        batchTasksById,
        runningJobMeta: nextMeta,
        workspaces: patchWorkspaceRuntime(get().workspaces, workspaceId, cancelledPatch),
      });
      return;
    }
    // Cancel every concurrent job in the batch.
    for (const id of ids) {
      try { await wailsCancel(id); } catch { /* ignore */ }
      EventsOff(`progress:${id}`, `log:${id}`, `preview:${id}`, `result:${id}`, `error:${id}`);
    }
    const nextMeta = { ...get().runningJobMeta };
    for (const id of ids) delete nextMeta[id];
    const batchTasksById = markWorkspaceTasks(
      workspaceId,
      taskIds,
      get().batchTasksById,
      (task) => task.status === "queued" || task.status === "running",
      { status: "cancelled" },
    );
    const taskPatch = taskRuntimePatchForWorkspace(workspaceId, taskIds, batchTasksById);
    const runPatch = {
      ...taskPatch,
      isRunning: false,
      runningJobs: [],
      progress: null,
      streamPreview: null,
      streamPreviews: {},
    };
    set({
      ...runPatch,
      batchTasksById,
      runningJobMeta: nextMeta,
      workspaces: patchWorkspaceRuntime(get().workspaces, workspaceId, runPatch),
    });
  },

  selectBatchTask: (taskId) => {
    const trimmed = typeof taskId === "string" ? taskId.trim() : "";
    const selectedBatchTaskId = trimmed ? trimmed : null;
    const state = get();
    const workspaceId = state.activeWorkspaceId;
    const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
    const task = selectedBatchTaskId ? state.batchTasksById[selectedBatchTaskId] : null;
    if (!task || task.workspaceId !== workspaceId || !(workspace?.batchTaskIds ?? []).includes(task.id)) {
      set({
        selectedBatchTaskId,
        workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, { selectedBatchTaskId }),
      });
      return;
    }
    set(sourceContextPatchFromBatchTask(state, task, selectedBatchTaskId));
    if (task.mode === "edit" && (task.sourceImagePaths?.length ?? 0) > 0) {
      void syncSharedEditAutoAspect({ getState: get, setState: set });
    }
  },

  selectBatchTaskForCancel: (taskId) => {
    get().selectBatchTask(taskId);
  },

  cancelBatchTask: async (taskId) => {
    const s = get();
    const workspaceId = s.activeWorkspaceId;
    const selectedId = typeof taskId === "string" ? taskId.trim() : "";
    const workspace = s.workspaces.find((entry) => entry.id === workspaceId);
    const taskIds = workspace?.batchTaskIds ?? [];
    const task = selectedId ? s.batchTasksById[selectedId] : null;
    if (!task || task.workspaceId !== workspaceId || !taskIds.includes(task.id)) {
      s.pushToast("No matching batch task was found", "warn", 2400);
      return;
    }
    const retryableTerminalTask = isRetryableBatchTask(task, retryHistoryByIdForState(s));
    if (task.status !== "queued" && task.status !== "running" && !retryableTerminalTask) {
      s.pushToast("This task is not queued, running, failed, or missing its final image", "warn", 2400);
      return;
    }

    clearAutoRetryTimer(task.id);
    const jobId = typeof task.jobId === "string" && task.jobId.trim() ? task.jobId.trim() : "";
    if (jobId) {
      try { await wailsCancel(jobId); } catch { /* best effort */ }
    }

    const current = get();
    const currentTask = current.batchTasksById[task.id] ?? task;
    const currentRetryableTerminalTask = isRetryableBatchTask(currentTask, retryHistoryByIdForState(current));
    if (currentTask.status !== "queued" && currentTask.status !== "running" && !currentRetryableTerminalTask) {
      return;
    }
    const now = Date.now();
    const batchTasksById: Record<string, BatchTaskRecord> = {
      ...current.batchTasksById,
      [task.id]: {
        ...currentTask,
        status: "cancelled",
        queuedReason: undefined,
        queuePriority: undefined,
        updatedAt: now,
      },
    };
    const runtime = workspaceRuntimeFromState(current, workspaceId);
    const prunedPreview = jobId ? removeStreamPreview(runtime.streamPreviews, jobId) : {
      streamPreview: runtime.streamPreview,
      streamPreviews: runtime.streamPreviews,
    };
    const taskPatch = taskRuntimePatchForWorkspace(workspaceId, taskIds, batchTasksById);
    const nextMeta = { ...current.runningJobMeta };
    if (jobId) delete nextMeta[jobId];
    const cancelPatch: WorkspacePatch = {
      ...taskPatch,
      selectedBatchTaskId: null,
      progress: taskPatch.runningJobs?.length ? runtime.progress : null,
      streamPreview: taskPatch.runningJobs?.length ? prunedPreview.streamPreview : null,
      streamPreviews: taskPatch.runningJobs?.length ? prunedPreview.streamPreviews : {},
      lastLogLine: taskPatch.runningJobs?.length ? runtime.lastLogLine : "",
      resultGridOpen: true,
      historyGalleryOpen: false,
    };
    set((state) => ({
      batchTasksById,
      selectedBatchTaskId: null,
      runningJobMeta: nextMeta,
      workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, cancelPatch),
      ...(state.activeWorkspaceId === workspaceId ? {
        ...activeRuntimePatch(cancelPatch),
        resultGridOpen: true,
        historyGalleryOpen: false,
      } : {}),
    } as Partial<StudioState>));
    get().pushToast(jobId
      ? "Cancelled running task; upstream work may already be billed"
      : "Cancelled queued task",
      "info",
      3600,
    );
    void pumpContinuousQueue(workspaceId, task.apiMode);
  },

  cancelQueuedBatchTasks: async () => {
    const s = get();
    const workspaceId = s.activeWorkspaceId;
    const workspace = s.workspaces.find((entry) => entry.id === workspaceId);
    const taskIds = workspace?.batchTaskIds ?? [];
    const queuedTasks = sortedBatchTasksForWorkspace(workspaceId, taskIds, s.batchTasksById)
      .filter((task) => task.status === "queued");
    if (queuedTasks.length === 0) {
      s.pushToast("No queued tasks in the current batch", "info", 2200);
      return;
    }

    const queuedTaskIds = new Set(queuedTasks.map((task) => task.id));
    const current = get();
    const currentWorkspace = current.workspaces.find((entry) => entry.id === workspaceId);
    const currentTaskIds = currentWorkspace?.batchTaskIds ?? taskIds;
    const now = Date.now();
    let cancelledCount = 0;
    const cancelledJobIds = new Set<string>();
    const batchTasksById: Record<string, BatchTaskRecord> = { ...current.batchTasksById };
    for (const id of currentTaskIds) {
      const task = batchTasksById[id];
      if (!task || task.workspaceId !== workspaceId || !queuedTaskIds.has(task.id) || task.status !== "queued") continue;
      const jobId = typeof task.jobId === "string" && task.jobId.trim() ? task.jobId.trim() : "";
      if (jobId) cancelledJobIds.add(jobId);
      startingContinuousTaskIds.delete(task.id);
      clearAutoRetryTimer(task.id);
      batchTasksById[task.id] = {
        ...task,
        status: "cancelled",
        queuedReason: undefined,
        queuePriority: undefined,
        updatedAt: now,
      };
      cancelledCount += 1;
    }
    if (cancelledCount === 0) {
      get().pushToast("No cancellable queued tasks were found after refresh", "info", 2200);
      return;
    }

    const runtime = workspaceRuntimeFromState(current, workspaceId);
    let prunedPreview = {
      streamPreview: runtime.streamPreview,
      streamPreviews: runtime.streamPreviews,
    };
    for (const jobId of cancelledJobIds) {
      prunedPreview = removeStreamPreview(prunedPreview.streamPreviews, jobId);
    }
    const taskPatch = taskRuntimePatchForWorkspace(workspaceId, currentTaskIds, batchTasksById);
    const nextMeta = { ...current.runningJobMeta };
    for (const jobId of cancelledJobIds) delete nextMeta[jobId];
    const cancelPatch: WorkspacePatch = {
      ...taskPatch,
      selectedBatchTaskId: null,
      progress: taskPatch.runningJobs?.length ? runtime.progress : null,
      streamPreview: taskPatch.runningJobs?.length ? prunedPreview.streamPreview : null,
      streamPreviews: taskPatch.runningJobs?.length ? prunedPreview.streamPreviews : {},
      lastLogLine: taskPatch.runningJobs?.length ? runtime.lastLogLine : "",
      resultGridOpen: true,
      historyGalleryOpen: false,
    };
    set((state) => ({
      batchTasksById,
      selectedBatchTaskId: null,
      runningJobMeta: nextMeta,
      workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, cancelPatch),
      ...(state.activeWorkspaceId === workspaceId ? {
        ...activeRuntimePatch(cancelPatch),
        resultGridOpen: true,
        historyGalleryOpen: false,
      } : {}),
    } as Partial<StudioState>));
    get().pushToast(`已取消当前批次 ${cancelledCount} 个排队任务`, "info", 3200);
    for (const jobId of cancelledJobIds) {
      try { await wailsCancel(jobId); } catch { /* best effort */ }
    }
  },

  clearFailedBatchTasks: async () => {
    const s = get();
    const workspaceId = s.activeWorkspaceId;
    const workspace = s.workspaces.find((entry) => entry.id === workspaceId);
    const taskIds = workspace?.batchTaskIds ?? [];
    const retryHistoryById = retryHistoryByIdForState(s);
    const retryableTasks = sortedBatchTasksForCurrentView(workspaceId, taskIds, s.batchTasksById)
      .filter((task) => isRetryableBatchTask(task, retryHistoryById));
    if (retryableTasks.length === 0) {
      s.pushToast("当前批次没有可清空的生成失败/终图缺失任务", "info", 2200);
      return;
    }

    const current = get();
    const currentWorkspace = current.workspaces.find((entry) => entry.id === workspaceId);
    const currentTaskIds = currentWorkspace?.batchTaskIds ?? taskIds;
    const currentRetryHistoryById = retryHistoryByIdForState(current);
    const now = Date.now();
    const clearedTaskIds = new Set(retryableTasks.map((task) => task.id));
    const clearedJobIds = new Set<string>();
    let clearedCount = 0;
    const batchTasksById: Record<string, BatchTaskRecord> = { ...current.batchTasksById };
    for (const id of currentTaskIds) {
      const task = batchTasksById[id];
      if (!task || task.workspaceId !== workspaceId || !clearedTaskIds.has(task.id) || !isRetryableBatchTask(task, currentRetryHistoryById)) continue;
      clearAutoRetryTimer(task.id);
      const jobId = typeof task.jobId === "string" && task.jobId.trim() ? task.jobId.trim() : "";
      if (jobId) clearedJobIds.add(jobId);
      batchTasksById[task.id] = {
        ...task,
        status: "cancelled",
        queuedReason: undefined,
        queuePriority: undefined,
        groupId: undefined,
        jobId: undefined,
        autoRetryScheduledAt: undefined,
        autoRetryReason: undefined,
        autoRetryCount: 0,
        updatedAt: now,
      };
      clearedCount += 1;
    }
    if (clearedCount === 0) {
      get().pushToast("刷新后没有剩余的生成失败/终图缺失任务", "info", 2200);
      return;
    }

    const runtime = workspaceRuntimeFromState(current, workspaceId);
    let prunedPreview = {
      streamPreview: runtime.streamPreview,
      streamPreviews: runtime.streamPreviews,
    };
    for (const jobId of clearedJobIds) {
      prunedPreview = removeStreamPreview(prunedPreview.streamPreviews, jobId);
    }
    const taskPatch = taskRuntimePatchForWorkspace(workspaceId, currentTaskIds, batchTasksById);
    const nextMeta = { ...current.runningJobMeta };
    for (const jobId of clearedJobIds) delete nextMeta[jobId];
    const clearPatch: WorkspacePatch = {
      ...taskPatch,
      selectedBatchTaskId: null,
      progress: taskPatch.runningJobs?.length ? runtime.progress : null,
      streamPreview: taskPatch.runningJobs?.length ? prunedPreview.streamPreview : null,
      streamPreviews: taskPatch.runningJobs?.length ? prunedPreview.streamPreviews : {},
      lastLogLine: taskPatch.runningJobs?.length ? runtime.lastLogLine : "",
      resultGridOpen: true,
      historyGalleryOpen: false,
    };
    set((state) => ({
      batchTasksById,
      selectedBatchTaskId: null,
      runningJobMeta: nextMeta,
      workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, clearPatch),
      ...(state.activeWorkspaceId === workspaceId ? {
        ...activeRuntimePatch(clearPatch),
        resultGridOpen: true,
        historyGalleryOpen: false,
      } : {}),
    } as Partial<StudioState>));
    get().pushToast(`已清空 ${clearedCount} 个生成失败/终图缺失任务`, "info", 3200);
  },

  promoteBatchTask: async (taskId) => {
    const s = get();
    const workspaceId = s.activeWorkspaceId;
    const selectedId = typeof taskId === "string" ? taskId.trim() : "";
    const workspace = s.workspaces.find((entry) => entry.id === workspaceId);
    const taskIds = workspace?.batchTaskIds ?? [];
    const task = selectedId ? s.batchTasksById[selectedId] : null;
    if (!task || task.workspaceId !== workspaceId || !taskIds.includes(task.id)) {
      s.pushToast("没有找到对应的排队任务", "warn", 2400);
      return;
    }
    if (task.status !== "queued" || task.jobId || task.queuedReason !== "local_concurrency") {
      s.pushToast("这个排队任务当前不能立即插队", "warn", 3000);
      return;
    }

    const current = get();
    const currentTask = current.batchTasksById[task.id] ?? task;
    if (currentTask.status !== "queued" || currentTask.jobId || currentTask.queuedReason !== "local_concurrency") {
      current.pushToast("这个排队任务状态已经变化，请刷新后重试", "warn", 2600);
      return;
    }
    if (startingContinuousTaskIds.has(currentTask.id)) {
      current.pushToast("这个排队任务已经在启动中", "info", 2400);
      return;
    }
    const batchTasksById: Record<string, BatchTaskRecord> = {
      ...current.batchTasksById,
      [currentTask.id]: {
        ...currentTask,
        updatedAt: Date.now(),
      },
    };
    const taskPatch = taskRuntimePatchForWorkspace(workspaceId, taskIds, batchTasksById);
    const promotePatch: WorkspacePatch = {
      ...taskPatch,
      resultGridOpen: true,
      historyGalleryOpen: false,
    };
    set((state) => ({
      batchTasksById,
      workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, promotePatch),
      ...(state.activeWorkspaceId === workspaceId ? {
        ...activeRuntimePatch(promotePatch),
        resultGridOpen: true,
        historyGalleryOpen: false,
      } : {}),
    } as Partial<StudioState>));
    const started = await startContinuousQueuedTask(currentTask.id);
    if (started) {
      get().pushToast("已立即插队，新增一个并发任务", "success", 2800);
      return;
    }
    get().pushToast("排队任务暂时无法立即启动，请稍后再试", "warn", 3200);
  },

  cancelSelectedTask: async () => {
    const selectedId = get().selectedBatchTaskId;
    if (!selectedId) {
      get().pushToast("没有选中的批次任务可取消", "warn", 2400);
      return;
    }
    await get().cancelBatchTask(selectedId);
  },

  recoverRunningHubResult: async (taskId) => {
    const state = get();
    const task = state.batchTasksById[taskId];
    if (!task) {
      state.pushToast("No matching RunningHub task was found", "warn", 2800);
      return null;
    }
    if (task.apiMode !== "runninghub") {
      state.pushToast("This task was not generated through the RunningHub bridge", "warn", 3200);
      return null;
    }
    const historyById = new Map(state.history.map((item) => [item.id, item]));
    if (task.status === "succeeded" && batchTaskHasResult(task, historyById)) {
      state.pushToast("This RunningHub result is already synced locally", "info", 2600);
      return task.historyItemId ? (historyById.get(task.historyItemId) ?? null) : null;
    }
    if (task.status === "queued" || task.status === "running" || task.status === "cancelled") {
      state.pushToast("This task is still queued, running, or cancelled; it cannot be recovered yet", "warn", 3400);
      return null;
    }
    const workspace = state.workspaces.find((entry) => entry.id === task.workspaceId);
    const profile = state.profiles.find((entry) => entry.id === task.apiProfileId)
      ?? state.profiles.find((entry) => entry.apiMode === "runninghub" && entry.imageModelID === task.imageModelID)
      ?? state.profiles.find((entry) => entry.apiMode === "runninghub")
      ?? null;
    const baseURL = cleanBaseURL(String(profile?.baseURL || state.baseURL || "").trim());
    if (!baseURL) {
      state.pushToast("RunningHub bridge base URL is missing", "error", 3600);
      return null;
    }
    const modelKey = String(task.imageModelID || profile?.imageModelID || "banana2").trim() || "banana2";
    const sizeSelection = runningHubSizeSelection(task.size, task.mode);
    try {
      state.pushToast(
        `Re-syncing RunningHub result: ${modelKey} ${sizeSelection.aspectRatio} ${sizeSelection.resolution}`,
        "info",
        2600,
      );
      const recoveredTask = await recoverRunningHubTask(baseURL, {
        prompt: task.prompt,
        mode: task.mode,
        model: modelKey,
        size: task.size,
      });
      const firstImage = Array.isArray(recoveredTask.images) ? recoveredTask.images[0] : null;
      if (!firstImage) {
        throw new Error("RunningHub bridge returned no recoverable image");
      }
      const imageB64 = await fetchRunningHubResultImage(baseURL, firstImage);
      const imported = await ImportImageFromB64(imageB64, `runninghub-recovered-${task.slotIndex + 1}.png`);
      const ref = await RegisterImportedImageAsset(imported.path).catch(() => null);
      const historyItem = ref
        ? withMediaAssetRef(recoveredRunningHubHistoryItem(task, recoveredTask, imported, imageB64), ref)
        : recoveredRunningHubHistoryItem(task, recoveredTask, imported, imageB64);
      const activeItem: HistoryItem = { ...historyItem, previewOnly: false };
      set((current) => {
        const nextHistory = trimHistory([
          historyItem,
          ...current.history.filter((item) => item.id !== historyItem.id),
        ]);
        const mergedBatch = mergeWorkspaceBatchResult(current, task.workspaceId, historyItem, nextHistory);
        let nextTasksById = updateTaskFromHistoryItem(
          current.batchTasksById,
          workspace?.batchTaskIds ?? [],
          task.workspaceId,
          historyItem,
        );
        const recoveredRecord = nextTasksById[task.id];
        if (recoveredRecord) {
          nextTasksById = {
            ...nextTasksById,
            [task.id]: {
              ...recoveredRecord,
              errorMessage: undefined,
              lastLogLine: "Recovered from RunningHub bridge",
            },
          };
        }
        const keepGridOpen = (workspace?.resultGridOpen ?? false) || ((workspace?.batchTaskIds?.length ?? 0) > 1);
        const previousCurrentImageId = current.activeWorkspaceId === task.workspaceId
          ? current.currentImage?.id ?? workspace?.currentImageId ?? null
          : workspace?.currentImageId ?? null;
        const workspacePatch: WorkspacePatch = {
          batchResultIds: mergedBatch.batchResultIds,
          currentImageId: keepGridOpen ? previousCurrentImageId : historyItem.id,
          resultGridOpen: keepGridOpen,
        };
        return {
          history: nextHistory,
          batchTasksById: nextTasksById,
          batchResults: current.activeWorkspaceId === task.workspaceId ? mergedBatch.batchResults : current.batchResults,
          workspaces: patchWorkspaceRuntime(current.workspaces, task.workspaceId, workspacePatch),
          ...(current.activeWorkspaceId === task.workspaceId
            ? {
                currentImage: keepGridOpen ? current.currentImage : activeItem,
                resultGridOpen: keepGridOpen,
                maskDataURL: null,
                annotations: [],
                tool: "pan",
              }
            : {}),
        } as Partial<StudioState>;
      });
      await persistHistoryItem(historyItem).catch(() => undefined);
      persistTrimmedHistory(useStudioStore.getState().history);
      clearAutoRetryTimer(task.id);
      syncBatchOutputAfterSuccess(batchProcessLinkFromTask(task), historyItem.savedPath);
      const autoPastedPanorama = await autoPastePanoramaRoundtripResult(historyItem, {
        workspaceId: task.workspaceId,
        selectAsCurrent: !(workspace?.resultGridOpen ?? false) && (workspace?.batchTaskIds?.length ?? 0) <= 1,
      }).catch((error: any) => {
        useStudioStore.getState().pushToast(`Panorama paste-back failed: ${error?.message ?? error}`, "warn", 4200);
        return null;
      });
      get().pushToast(autoPastedPanorama ? "RunningHub result re-synced and pasted back" : "RunningHub result re-synced", "success", 3400);
      return historyItem;
    } catch (error: any) {
      state.pushToast(`RunningHub re-sync failed: ${error?.message ?? error}`, "error", 5200);
      return null;
    }
  },

  recoverAPIMartResult: async (taskId) => {
    const state = get();
    const task = state.batchTasksById[taskId];
    if (!task) {
      state.pushToast("没有找到对应的 APIMart 任务", "warn", 2800);
      return null;
    }
    if (task.apiMode !== "apimart") {
      state.pushToast("这个任务不是通过 APIMart 生成的", "warn", 3200);
      return null;
    }
    const historyById = new Map(state.history.map((item) => [item.id, item]));
    if (task.status === "succeeded" && batchTaskHasResult(task, historyById)) {
      state.pushToast("这个 APIMart 结果已经同步到本地", "info", 2600);
      return task.historyItemId ? (historyById.get(task.historyItemId) ?? null) : null;
    }
    if (task.status === "queued" || task.status === "running") {
      state.pushToast("这个任务仍在排队或运行中，暂时不能重新同步", "warn", 3400);
      return null;
    }
    const apimartTaskId = await recoverableAPIMartTaskId(task);
    if (!apimartTaskId) {
      state.pushToast("这个 APIMart 任务没有保存 task_id，无法重新同步结果", "warn", 4200);
      return null;
    }
    const workspace = state.workspaces.find((entry) => entry.id === task.workspaceId);
    const profile = state.profiles.find((entry) => entry.id === task.apiProfileId)
      ?? state.profiles.find((entry) => entry.apiMode === "apimart" && entry.imageModelID === task.imageModelID)
      ?? state.profiles.find((entry) => entry.apiMode === "apimart")
      ?? null;
    const baseURL = cleanBaseURL(String(profile?.baseURL || state.baseURL || "").trim());
    if (!baseURL) {
      state.pushToast("缺少 APIMart baseURL，无法重新同步", "error", 3600);
      return null;
    }
    const apiKey = await apiKeyForProfileOrState(state, task.apiProfileId || profile?.id);
    if (!apiKey.trim()) {
      state.pushToast("缺少 APIMart API Key，无法查询任务结果", "error", 3600);
      return null;
    }
    try {
      state.pushToast(`正在重新同步 APIMart 结果：${apimartTaskId}`, "info", 2600);
      const recoveredTask = await recoverAPIMartTask(baseURL, apiKey, apimartTaskId);
      const firstImage = Array.isArray(recoveredTask.images) ? recoveredTask.images[0] : null;
      if (!firstImage) {
        throw new Error("APIMart 任务没有可同步的图片结果");
      }
      const imageB64 = await fetchAPIMartResultImage(firstImage);
      const imported = await ImportImageFromB64(imageB64, `apimart-recovered-${task.slotIndex + 1}.png`);
      const ref = await RegisterImportedImageAsset(imported.path).catch(() => null);
      const historyItem = ref
        ? withMediaAssetRef(recoveredAPIMartHistoryItem(task, recoveredTask, imported, imageB64), ref)
        : recoveredAPIMartHistoryItem(task, recoveredTask, imported, imageB64);
      const activeItem: HistoryItem = { ...historyItem, previewOnly: false };
      set((current) => {
        const nextHistory = trimHistory([
          historyItem,
          ...current.history.filter((item) => item.id !== historyItem.id),
        ]);
        const mergedBatch = mergeWorkspaceBatchResult(current, task.workspaceId, historyItem, nextHistory);
        let nextTasksById = updateTaskFromHistoryItem(
          current.batchTasksById,
          workspace?.batchTaskIds ?? [],
          task.workspaceId,
          historyItem,
        );
        const recoveredRecord = nextTasksById[task.id];
        if (recoveredRecord) {
          nextTasksById = {
            ...nextTasksById,
            [task.id]: {
              ...recoveredRecord,
              apimartTaskId,
              apimartTaskExpiresAt: recoveredTask.expiresAt,
              errorMessage: undefined,
              lastLogLine: "已重新同步 APIMart 结果",
            },
          };
        }
        const keepGridOpen = (workspace?.resultGridOpen ?? false) || ((workspace?.batchTaskIds?.length ?? 0) > 1);
        const previousCurrentImageId = current.activeWorkspaceId === task.workspaceId
          ? current.currentImage?.id ?? workspace?.currentImageId ?? null
          : workspace?.currentImageId ?? null;
        const workspacePatch: WorkspacePatch = {
          batchResultIds: mergedBatch.batchResultIds,
          currentImageId: keepGridOpen ? previousCurrentImageId : historyItem.id,
          resultGridOpen: keepGridOpen,
        };
        return {
          history: nextHistory,
          batchTasksById: nextTasksById,
          batchResults: current.activeWorkspaceId === task.workspaceId ? mergedBatch.batchResults : current.batchResults,
          workspaces: patchWorkspaceRuntime(current.workspaces, task.workspaceId, workspacePatch),
          ...(current.activeWorkspaceId === task.workspaceId
            ? {
                currentImage: keepGridOpen ? current.currentImage : activeItem,
                resultGridOpen: keepGridOpen,
                maskDataURL: null,
                annotations: [],
                tool: "pan",
              }
            : {}),
        } as Partial<StudioState>;
      });
      await persistHistoryItem(historyItem).catch(() => undefined);
      persistTrimmedHistory(useStudioStore.getState().history);
      clearAutoRetryTimer(task.id);
      syncBatchOutputAfterSuccess(batchProcessLinkFromTask(task), historyItem.savedPath);
      const autoPastedPanorama = await autoPastePanoramaRoundtripResult(historyItem, {
        workspaceId: task.workspaceId,
        selectAsCurrent: !(workspace?.resultGridOpen ?? false) && (workspace?.batchTaskIds?.length ?? 0) <= 1,
      }).catch((error: any) => {
        useStudioStore.getState().pushToast(`全景贴回失败: ${error?.message ?? error}`, "warn", 4200);
        return null;
      });
      get().pushToast(autoPastedPanorama ? "APIMart 结果已重新同步并贴回全景图" : "APIMart 结果已重新同步", "success", 3400);
      return historyItem;
    } catch (error: any) {
      state.pushToast(`APIMart 重新同步失败: ${error?.message ?? error}`, "error", 5200);
      return null;
    }
  },

  recoverAPIMartTaskResult: async (apimartTaskId, options) => {
    const state = get();
    const cleanTaskId = extractAPIMartTaskIdFromText(apimartTaskId);
    if (!cleanTaskId) {
      state.pushToast("没有找到有效的 APIMart task_id", "warn", 3000);
      return null;
    }
    const activeProfile = state.profiles.find((entry) => entry.id === state.activeProfileId && entry.apiMode === "apimart") ?? null;
    const profile = activeProfile
      ?? state.profiles.find((entry) => entry.apiMode === "apimart")
      ?? null;
    const baseURL = cleanBaseURL(String(profile?.baseURL || (state.apiMode === "apimart" ? state.baseURL : "") || "").trim());
    if (!baseURL) {
      state.pushToast("缺少 APIMart baseURL，无法重新同步", "error", 3600);
      return null;
    }
    let apiKey = profile ? await apiKeyForProfileOrState(state, profile.id) : "";
    if (!apiKey.trim() && state.apiMode === "apimart") apiKey = state.apiKey;
    if (!apiKey.trim()) {
      state.pushToast("缺少 APIMart API Key，无法查询任务结果", "error", 3600);
      return null;
    }
    const workspaceId = state.activeWorkspaceId || state.workspaces[0]?.id || genId();
    const now = Date.now();
    const task: BatchTaskRecord = {
      id: `apimart-direct:${cleanTaskId}`,
      workspaceId,
      slotIndex: 0,
      status: "succeeded",
      createdAt: now,
      updatedAt: now,
      mode: state.mode || "generate",
      apiMode: "apimart",
      apiProfileId: profile?.id,
      apiProfileName: profile?.name,
      prompt: "APIMart 重新同步结果",
      size: state.size || "auto",
      quality: state.quality || "auto",
      outputFormat: state.outputFormat || "png",
      requestPolicy: profile?.requestPolicy ?? state.requestPolicy,
      imagesNewAPICompat: profile?.imagesNewAPICompat ?? state.imagesNewAPICompat,
      textModelID: profile?.textModelID || state.textModelID,
      imageModelID: profile?.imageModelID || state.imageModelID,
      rawPath: options?.rawPath,
      apimartTaskId: cleanTaskId,
    };
    try {
      state.pushToast(`正在重新同步 APIMart 结果：${cleanTaskId}`, "info", 2600);
      const recoveredTask = await recoverAPIMartTask(baseURL, apiKey, cleanTaskId);
      const firstImage = Array.isArray(recoveredTask.images) ? recoveredTask.images[0] : null;
      if (!firstImage) {
        throw new Error("APIMart 任务没有可同步的图片结果");
      }
      const imageB64 = await fetchAPIMartResultImage(firstImage);
      const imported = await ImportImageFromB64(imageB64, `apimart-recovered-${cleanTaskId}.png`);
      const ref = await RegisterImportedImageAsset(imported.path).catch(() => null);
      const historyItem = ref
        ? withMediaAssetRef(recoveredAPIMartHistoryItem(task, recoveredTask, imported, imageB64), ref)
        : recoveredAPIMartHistoryItem(task, recoveredTask, imported, imageB64);
      const activeItem: HistoryItem = { ...historyItem, previewOnly: false };
      set((current) => {
        const workspace = current.workspaces.find((entry) => entry.id === workspaceId);
        const keepGridOpen = current.activeWorkspaceId === workspaceId
          ? current.resultGridOpen
          : (workspace?.resultGridOpen ?? false);
        const nextHistory = trimHistory([
          historyItem,
          ...current.history.filter((item) => item.id !== historyItem.id),
        ]);
        const previousCurrentImageId = current.activeWorkspaceId === workspaceId
          ? current.currentImage?.id ?? workspace?.currentImageId ?? null
          : workspace?.currentImageId ?? null;
        const workspacePatch: WorkspacePatch = {
          currentImageId: keepGridOpen ? previousCurrentImageId : historyItem.id,
          resultGridOpen: keepGridOpen,
        };
        return {
          history: nextHistory,
          workspaces: patchWorkspaceRuntime(current.workspaces, workspaceId, workspacePatch),
          ...(current.activeWorkspaceId === workspaceId
            ? {
                currentImage: keepGridOpen ? current.currentImage : activeItem,
                resultGridOpen: keepGridOpen,
                maskDataURL: null,
                annotations: [],
                tool: "pan",
              }
            : {}),
        } as Partial<StudioState>;
      });
      await persistHistoryItem(historyItem).catch(() => undefined);
      persistTrimmedHistory(useStudioStore.getState().history);
      get().pushToast("APIMart 结果已重新同步", "success", 3400);
      return historyItem;
    } catch (error: any) {
      state.pushToast(`APIMart 重新同步失败: ${error?.message ?? error}`, "error", 5200);
      return null;
    }
  },

  applyHistoryParams: (item) => imageActions.applyHistoryParams(item),
  regenerateFromHistory: async (item) => imageActions.regenerateFromHistory(item),
  reuseAsSource: async (item) => imageActions.reuseAsSource(item),
  repastePanoramaRoundtrip: async (item, options) => {
    const workspaceId = get().activeWorkspaceId;
    if (!workspaceId) {
      get().pushToast("当前没有可用工作区", "warn", 2600);
      return null;
    }
    try {
      const repasted = await autoPastePanoramaRoundtripResult(item, {
        workspaceId,
        selectAsCurrent: options?.selectAsCurrent ?? true,
        alignment: options?.alignment ?? null,
        pasteMask: options?.pasteMask ?? null,
      });
      if (!repasted) {
        get().pushToast("这张图没有可用的全景贴回信息", "warn", 3200);
        return null;
      }
      get().pushToast("已重新贴回全景图", "success", 3200);
      return repasted;
    } catch (error: any) {
      get().pushToast(`全景贴回失败: ${error?.message ?? error}`, "warn", 4200);
      return null;
    }
  },
  importExternalPanoramaPastebackImage: async (anchorItem, file) => {
    const workspaceId = get().activeWorkspaceId;
    if (!workspaceId) {
      get().pushToast("当前没有可用工作区", "warn", 2600);
      return null;
    }
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      get().pushToast(`不支持的图片类型: ${file.type || "(未知)"}，请用 PNG/JPG/WebP`, "warn", 3600);
      return null;
    }
    const roundtrip = resolvePanoramaRoundtripRef(anchorItem);
    if (!roundtrip) {
      get().pushToast("当前图片没有可贴回的 360 镜头信息", "warn", 3200);
      return null;
    }
    try {
      const imageB64 = await fileToBase64(file);
      const dimensions = getImageDimensionsFromBase64(imageB64);
      if (!dimensions) {
        get().pushToast("无法读取导入图片尺寸", "warn", 3200);
        return null;
      }
      const expectedAspect = Number(roundtrip.roundtripState.source_aspect || 0);
      const actualAspect = dimensions.w / Math.max(1, dimensions.h);
      const relativeDelta = expectedAspect > 0
        ? Math.abs(actualAspect - expectedAspect) / Math.max(1e-6, expectedAspect)
        : 0;
      if (expectedAspect > 0 && relativeDelta > 0.01) {
        get().pushToast(
          `导入图比例不匹配: ${dimensions.w}x${dimensions.h}，需要接近 ${expectedAspect.toFixed(3)}:1`,
          "warn",
          5200,
        );
        return null;
      }
      const imported = await ImportImageFromB64(imageB64, file.name);
      const ref = await RegisterImportedImageAsset(imported.path).catch(() => null);
      const item = ref
        ? withMediaAssetRef(externalPanoramaPastebackItem(imported, file, imageB64, anchorItem, roundtrip, dimensions), ref)
        : externalPanoramaPastebackItem(imported, file, imageB64, anchorItem, roundtrip, dimensions);
      set((state) => ({
        history: trimHistory([item, ...state.history.filter((entry) => entry.id !== item.id)]),
        currentImage: item,
        resultGridOpen: false,
        historyGalleryOpen: false,
        historyGallerySinglePreviewId: null,
        panoramaAlignTarget: item,
        errorMessage: null,
        errorRawPath: null,
        workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, {
          currentImageId: item.id,
          resultGridOpen: false,
          historyGalleryOpen: false,
        }),
      } as Partial<StudioState>));
      await persistHistoryItem(item).catch(() => undefined);
      persistTrimmedHistory(get().history);
      get().pushToast("已导入外部贴回图，进入手动对齐", "success", 3200);
      return item;
    } catch (error: any) {
      get().pushToast(`导入贴回图失败: ${error?.message ?? error}`, "error", 4200);
      return null;
    }
  },
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
        promptPrefix: preview.workspace.promptPrefix,
        prompt: preview.currentImage.prompt,
        optimizationGuidance: preview.workspace.optimizationGuidance,
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
  editAutoAspectUserLocked: false,
        profiles: [preview.profile],
        activeProfileId: preview.profile.id,
        sources: preview.sources,
        reversePromptImage: null,
        runningJobs: [],
        jobsTotal: 0,
        jobsCompleted: 0,
        jobsFailed: 0,
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
        historyGalleryOpen: false,
        materialManagerOpen: false,
        materialGroups: [],
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
        compareMode: "curtain",
        compareSplit: 0.5,
        toasts: [],
        recentDurations: preview.history.map((item) => item.elapsedSec ?? 0).filter((value) => value > 0),
        viewZoom: 1,
        canvasViewResetTick: 0,
        fullscreen: false,
        promptHistory: [],
        batchCount: 1,
        editSourceMode: preview.workspace.editSourceMode ?? "manual",
        batchProcess: normalizeBatchProcessConfig(preview.workspace.batchProcess),
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
        isReversingPrompt: false,
        upstreamModalOpen: false,
        upstreamReturnTarget: "app",
        starPromptOpen: false,
        starPromptSource: "auto",
      });
      return;
    }

    const initialHistoryPage = await loadHistoryPage({ limit: INITIAL_HISTORY_LOAD });
    let items = trimHistory(initialHistoryPage.items);
    const materialGroups = loadMaterialGroups();
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
    // ---- v0.1.6 profile 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偛顦甸弫宥夊礋椤掍焦顔囨繝寰锋澘鈧洟骞婂畝鍕劦妞ゆ巻鍋撻柛鐕佸灠椤曘儵宕熼姘辩杸濡炪倖鍨熼弬鍌炲磿閻㈢钃熸繛鎴欏灩缁犳盯姊婚崼鐔衡姇闁诲繐鐗忕槐鎾存媴閹绘帊澹曞┑鐘灱閸╂牠宕濋弽顓熷亗闁绘棃鏅茬换鍡樸亜閺嶃劎鐭婇悽顖氱埣閺屾盯寮▎鎯у壋缂?/ 闂傚倸鍊搁崐椋庣矆娓氣偓楠炴牠顢曚綅閸ヮ剦鏁冮柨鏇楀亾闁汇倗鍋撶换娑㈠幢濡闉嶉梺鎼炲€曠€氫即寮婚敓鐘查唶闁靛繆鍓濆В鍕⒑?-----------------------------------
    // 1) 濠电姷鏁告慨鐑藉极閹间礁纾婚柣鎰▕閻掕姤绻涢崱妯诲碍閻熸瑱绠撻幃妤呮晲鎼粹剝鐏嶉梺鍝勬媼娴滎亜顫忕紒妯诲闁告稑锕ら弳鍫ユ煢閸愵厺鍚紒杈ㄥ笧閳ь剨缍嗛崑鍛暦鐏炵虎娈介柣鎰皺缁犲鏌熼瑙勬珚闁诡喕绮欓幃鐣屽枈婢跺苯绨ユ繝鐢靛Х椤ｈ棄危閸涙潙鍨傞梻鍫熺〒閺嗭箓鏌ｉ姀銏╃劸闁稿被鍔戦弻鐔煎箥椤旂⒈鏆梺鎶芥敱閸ㄥ潡寮诲☉妯锋斀闁糕剝顨忔导鈧梺鐓庡级閻楃姴顫忓ú顏勫窛濠电姴娴烽崝鍫曟⒑閸涘﹣绶遍柛锝庡枛椤?gptcodex.profiles闂?
    // 2) 缂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵割槮缁炬儳缍婇弻鐔兼⒒鐎靛壊妲紓浣哄Ь椤濡甸崟顖氱疀闁告挷鑳堕弳鐘充繆濡も偓閹虫ê顫忛搹瑙勫厹闁告侗鍠栧☉褏绱撴担鍝勑ｉ柛銊ョ秺閹噣骞嗚閸氬顭跨捄渚剰濞寸媭鍨辨穱濠囧Χ韫囨稒顎嶉柣搴ｇ懗閸ヨ埖鏅滈梺缁橆焾濞呮洟宕ｈ箛娑欑叆婵犻潧妫涚粻鎶芥煟閿濆洦鏆柡宀€鍠栭、娆撴嚃閳哄唭銊╂倵鐟欏嫭绀€闁绘牕鍚嬫穱濠囧箹娴ｈ娅嗛梺瑙勫劤閹虫劙鐛姀銏㈢＝闁稿本鑹鹃埀顒勵棑濞嗐垽鏁撻悩鑼崶濠殿喗锕╅崢鍓х不妤ｅ啯鐓冪憸婊堝礈閻旂厧钃?gptcodex.{responses,images}.* + 闂?keyring 濠电姷鏁告慨鐑姐€傞鐐潟闁哄洢鍨圭壕濠氭煙鏉堝墽鐣辩痪鎹愵潐娣囧﹪濡堕崨顔兼缂備胶濮锋繛鈧柡宀€鍠栭獮鎴﹀箛闂堟稒顔勭紓鍌欒兌婵敻鎮ч悩鑽ゅ祦闁哄稁鐏旀惔顭戞晢闁逞屽墯娣囧﹪鎳栭埡鍐紲?0-2
    //    濠?profile,濠电姷鏁告慨鐑姐€傞鐐潟闁哄洢鍨圭壕濠氭煙鏉堝墽鐣辩痪鎹愵潐娣囧﹪濡堕崨顔兼缂佺偓鍎冲锟犲蓟閺囥垹閱囨繝闈涙祩濡€斥攽閻愬弶鍣藉┑顔炬暩閹广垹鈹戦崶鈺冪槇闂佺鏈喊宥呪枔瑜斿娲焻閻愯尪瀚板褜鍨堕幃浠嬵敍濡炶浜剧€规洖娲﹀▓楣冩⒑闂堟单鍫ュ疾閳哄懎鏋佺€广儱妫涚粻楣冩煙鐎电鈧垵顫濈捄铏癸紱闂佺懓澧界划顖炲磹閻戣姤鐓熼柟瀵稿剱閻掍粙鏌?localStorage 闂傚倸鍊搁崐鎼佸磹閹间礁纾归柣鎴ｅГ閸婂潡鏌ㄩ弴鐐蹭簽闁轰礁瀚换娑㈠幢濡纰嶇紓浣瑰姈椤ㄥ﹪寮婚悢鐓庣闁逛即娼у▓顓㈡⒑?
    let profiles = loadStoredProfiles();
    let activeProfileId = loadStoredActiveProfileId();
    if (profiles.length === 0 && ENABLE_LEGACY_PROFILE_MIGRATION) {
      // 婵犵數濮烽弫鍛婃叏閻戝鈧倿鎸婃竟鈺嬬秮瀹曘劑寮堕幋鐙呯幢闂備線鈧偛鑻晶鎾煛鐏炲墽銆掗柍褜鍓ㄧ紞鍡涘磻閸涱垯鐒婇柟娈垮枤绾捐偐绱撴担璇＄劷婵炴彃顕埀顒侇問閸犳牠鎮ユ總鍝ュ祦閻庯綆鍣弫鍥煟閹邦厼绲绘い銉﹀浮濮婂宕掑▎鎴犵崲闂侀€炲苯澧伴柛瀣洴閹崇喖顢涢悙鎻掑亶闂佸綊妫块悞锕傛偂閻斿吋鐓欓柧蹇曟嚀娴犙囨煟閿濆洦鏆柡宀€鍠栭、娆撳Ω閵夛箑娅ч梺娲诲幗閻燂妇鎹㈠☉銏犲耿婵☆垰鎼慨銏犫攽?
      let legacyApiMode: APIMode = "responses";
      try {
        const v = localStorage.getItem(storageKey("gptcodex.apiMode"));
        if (v === "images" || v === "responses") legacyApiMode = v;
      } catch {}
      const legacyResponses = loadModeConfig("responses");
      const legacyImages = loadModeConfig("images");
      // 婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柟闂寸绾剧粯绻涢幋娆忕仾闁稿孩顨呴湁闁挎繂娲ㄩ妴濠囨煛鐎ｎ偆澧甸柡宀嬬節瀹曞爼濡烽妷褌鎮ｉ梻?v0.1.5 闂傚倸鍊搁崐鎼佸磹閹间礁纾瑰瀣椤愪粙鏌ㄩ悢鍝勑㈤柣顓燁殜閻擃偊宕堕妸锔绢槬缂備浇缈伴崐鏇㈡箒闂佺粯锚濡﹪宕曞澶嬬厓?legacy-shared 闂傚倸鍊搁崐宄懊归崶顒夋晪鐟滃繘鍩€椤掍胶鈻撻柡鍛箘閸掓帒鈻庨幘宕囶唺濠碉紕鍋涢惃鐑藉磻閹捐绀冩い鏃傚帶閼板灝鈹戦悙鏉戠伇濡炲瓨鎮傚?闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偞鐗犻、鏇㈠煕濮橆厽銇濆┑鈩冩倐閸╃偠顦叉い锔炬暬閻涱噣宕堕鈧痪褔鎮归幁鎺戝濠殿噯闄勬穱濠囨倷椤忓嫧鍋撻弽顓炲瀭濠靛倻顭堢壕鍨攽閻樺疇澹樼紒鈧崒鐐村€堕柣鎰絻閳锋梻绱?gptcodex.baseURL 缂?
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
          name: "Responses (Legacy)",
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
          name: "Images (Legacy)",
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
        // active = 闂傚倸鍊搁崐宄懊归崶褏鏆﹂柛顭戝亝閸欏繘鏌熼鍡忓亾闁哄绉归弻銊モ攽閸♀晜笑缂備焦鍔栭〃濠囧蓟閿熺姴鐐婇柕澶堝劤娴犲ジ姊?apiMode 闂傚倸鍊搁崐宄懊归崶顒夋晪鐟滃秹婀侀梺缁樺灱濡嫰寮告笟鈧弻鐔兼⒒鐎靛壊妲紓浣哄Х婵炩偓闁哄瞼鍠栭幃娆擃敆閳ь剟宕濈捄琛℃斀妞ゆ棁妫勯埢鏇㈡煛瀹€瀣？濞寸媴濡囬幏鐘诲箵閹烘埈娼ラ梻鍌欒兌椤牊顨ラ崫銉х煋鐟滅増甯掗拑鐔哥箾閹存瑥鐏╅柛妤佸▕閺屾洘绻涢崹顔煎Б婵炲濮弲婊呮崲濞戞埃鍋撳☉娆樼劷闁活厼顑囩槐鎺旀嫚閹绘巻鍋撻崸妤€鏄?
        const matching = synth.find((p) => p.apiMode === legacyApiMode);
        activeProfileId = (matching ?? synth[0]).id;
        persistProfiles(profiles);
        persistActiveProfileId(activeProfileId);
        // 婵犵數濮烽弫鍛婃叏閻戣棄鏋侀柟闂寸绾惧鏌ｉ幇顒佹儓缂佺姳鍗抽弻鐔兼⒒鐎靛壊妲紓浣哄Х婵炩偓闁绘搩鍋婂畷鍫曞Ω閿旂虎妲伴梻浣告惈濡瑧鍒掗幘璇茶摕鐎广儱鐗滃銊╂⒑閸涘﹥灏甸柛鐘崇墪椤曪絾绻濆顑┭囨煕閳藉棗骞橀柣顓燁殕缁绘稒娼忛崜褏袣濠碘槅鍋勭€氭澘鐣烽姀銈呯伋闁哄倶鍎查弬鈧?keyring 濠?+ localStorage 闂?闂傚倸鍊搁崐鎼佸磹閹间礁纾瑰瀣椤愪粙鏌ㄩ悢鍝勑㈢紒鈧崼鐔虹闁糕剝蓱鐏忎即鏌涙繝鍛厫缂佺粯绻堝Λ鍐ㄢ槈閸楃偛澹堥梻浣侯焾鐞氼偊宕濋幋锕€钃熼柡鍥ュ灩闁卞洦绻濋棃娑欑ォ婵☆偁鍊濆鍝勭暦閸モ晛绗″┑鈽嗗亜閸熸挳鐛崘銊庢棃宕ㄩ鑺ョ彸闂佺鍋愮悰銉╁焵椤掑啫钄奸柛鈺佹嚇濮婄粯鎷呮笟顖滃姼闂佽崵鍣ユ禍顏勭暦閸洖惟鐟滃秹鐛崼鐔虹瘈婵炲牆鐏濋弸鐔搞亜椤撶偞鍠樼€规洏鍨奸ˇ褰掓煙椤旀枻鑰块柟顔规櫅闇夐悗锝庡亝閺夊憡淇婇悙顏勨偓鏍涙笟鈧敐鐐村緞婵炵偓鐎烘繝鐢靛Т濞诧箓鎮″☉銏″€堕柣鎰ゴ閸嬫捇鎮㈡總澶夌磾濠碉紕鍋戦崐鏍箰閹间礁围缂佸娉曢弳锔姐亜韫囨挻鍣哄┑顖涙尦閺屾盯骞橀弶鎴濐潊闂佸搫鎳愭繛鈧€殿喖顭烽崺鍕礃閵娧呯嵁闂備胶纭堕崜婵婃懌闂佺粯绻冪敮鈥愁潖濞差亝鍤岄柣妤€鐗忚ぐ褍鈹戦悩顐壕闂侀潻瀵岄崣鈧┑?
        try { await DeleteStoredAPIKey("responses"); } catch {}
        try { await DeleteStoredAPIKey("images"); } catch {}
        clearLegacyAPIKeys();
        clearLegacyModeLocalStorage();
      }
    }

    // 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偛顦甸弫鎾绘偐閼碱剦妲烽梻浣告惈濞层垽宕硅ぐ鎺撳仾妞ゆ洍鍋撻柡灞剧椤﹁櫕銇勯妸銉︻棦鐎?active profile 濠电姷鏁告慨鐑藉极閹间礁纾婚柣鎰惈閸ㄥ倿鏌涢锝嗙缂佺姳鍗抽弻娑樷槈濮楀棛鍙曞┑鐐茬墔缁瑩寮婚悢鍏尖拻閻庡灚鐡曠粣妤呮⒑鏉炴壆顦︽い鎴濇婵＄敻宕熼姘辩潉闂佹悶鍎洪悘婵嬪箻缂佹鍘遍柟鑹版彧缁蹭粙寮稿☉銏＄厸鐎光偓鐎ｎ剛鐦堥悗瑙勬礃閿曘垺淇婂宀婃Щ濡炪倧绲介悥鐓庮潖濞差亝鐒婚柣鎰蔼鐎氭澘顭胯閸ｏ綁寮婚妸鈺佸嵆妞ゅ繐鐗婇宥囩磽娴ｇ鈧湱鏁敓鐘叉瀬闁告劦鍠栫壕鍏兼叏濡鏁剧紒杈ㄧ叀濮婄粯鎷呴搹鐟扮闂佸憡姊瑰ú鐔煎箖濞差亜惟闁冲搫鍊告禒濂告⒑閸撴彃浜濇繛鍙夛耿閸╂盯骞嬮悩鐢碉紲闁诲函缍嗛崢鐣屾兜閸撲讲鍋撳☉娆戠畼缂佽鲸鎸婚幏鍛驳鐎ｎ亝顔勯梻浣虹帛椤ㄥ棝骞戦崶褏鏆︽繛宸簻閻掑灚銇勯幒宥夋濞存粍绮撻弻鐔煎传閸曨剦妫炴繛瀛樼矒缁犳牕顫忛搹鍦煓闁告牑鈧厖绱ｆ俊鐐€ら崢楣冨礂濡櫣鏆︽繛宸簼閸婄兘鏌涘┑鍡楊仼闁哥偑鍔岄—鍐Χ閸℃ê鏆楅梺绋款儑閸犳牞妫熷銈嗗姀閹冲洭寮ㄦ禒瀣闁规儼妫勭壕褰掓煛閸モ晛袥闁稿鎸搁～婵嬪Ψ閵夈儺娼庨梻浣虹《閺備線宕?闂?闂傚倸鍊搁崐鎼佸磹閻戣姤鍤勯柛顐ｆ磵閳ь剨绠撳畷濂稿閳ュ啿绨ラ梻浣稿閸嬩線宕曟潏鈺冪焼濠㈣埖鍔曠粻瑙勭箾閿濆骸澧┑鈥茬矙閺屾稓鈧絽鍚€闁垶鏌＄仦鍓ф创闁糕晛瀚板畷姗€顢旈崨顓熺彯闂?闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偛顦甸弫鎾绘偐閸愬弶鐤勫┑掳鍊х徊浠嬪疮椤栫偞鍋傞柍褜鍓熷娲箰鎼达絿鐣甸梺鐟板槻椤戝骞冮悙瀵割浄閻庯綆鍋嗛崢钘夆攽鎺抽崐鎰板磻閹剧粯鐓熸俊銈傚亾婵☆偅绻堥妴浣割潩椤撶喓绉堕梺闈涱煭缁犳垵顕ｉ崹顔规斀闁宠棄妫楅悘鐘绘煙绾板崬浜扮€殿喛娅曞蹇涘Ω瑜忛鏇㈡⒑閸撴彃浜濈紒顔艰嫰閻ｇ敻宕卞☉娆戝幐闁诲繒鍋涙晶钘壝虹€电硶鍋撳▓鍨珮闁告挻鐩獮蹇涙偐鐠囪尙顔岄梺鍦劋缁诲嫰鍩€椤掍礁鈻曟慨濠勭帛閹峰懐绮欓幐搴♀偓顖氣攽閻愭彃鎮戦柣鐔叉櫊瀵偊宕橀鍢夈劑鏌嶉崫鍕偓鐟扳枍閺嶎厽鈷戦柛娑橈工婵箓鏌涢悩宕囧⒌鐎规洘锕㈤崺鈧い鎺嗗亾妞ゎ亜鍟存俊鑸垫償閳ュ磭顔戦梻浣规偠閸斿矂鎮樺杈╃焿闁圭儤娲忔禍褰掓煙閻戞ɑ灏ㄩ柟椋庣帛缁绘稒娼忛崜褏袣濡炪値鍋勯ˇ鍗炩枎閵忋倖鍤戞い鎺戝€婚敍婊勭節閵忥絾纭鹃柨鏇畵瀹曟椽鏁愭径瀣幍濡炪倖鏌ㄩ崥瀣磻閵壯€鍋撶憴鍕鐎规洦鍓熼崺銉﹀緞婵?
    const localFHLConfig = await loadLocalFHLConfig();
    const localFHLBaseURL = cleanBaseURL(localFHLConfig?.baseURL || FHL_BASE_URL);
    const localFHLAPIMode: APIMode = localFHLConfig?.apiMode || "responses";
    const localFHLRequestPolicy: RequestPolicy = localFHLConfig?.requestPolicy || "openai";
    const localFHLTextModelID = (localFHLConfig?.textModelID || FHL_TEXT_MODEL_ID).trim();
    const localFHLImageModelID = (localFHLConfig?.imageModelID || FHL_IMAGE_MODEL_ID).trim();
    let profilesChangedForFHL = false;
    let fhlProfileId = profiles.find((profile) => (
      profile.id === FHL_PROFILE_ID
      || (
        cleanBaseURL(profile.baseURL) === FHL_BASE_URL
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
          apiMode: localFHLAPIMode,
          requestPolicy: localFHLRequestPolicy,
          baseURL: localFHLBaseURL,
          textModelID: localFHLTextModelID,
          imageModelID: localFHLImageModelID,
          imagesNewAPICompat: localFHLAPIMode === "images",
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

    const concurrencyDefaultMigrated = (() => {
      try { return localStorage.getItem(CONCURRENCY_DEFAULT_V4_MIGRATION_KEY) === "1"; } catch { return true; }
    })();
    if (!concurrencyDefaultMigrated) {
      let changed = false;
      profiles = profiles.map((profile) => {
        if (normalizeConcurrencyLimit(profile.concurrencyLimit) !== 0) return profile;
        changed = true;
        return { ...profile, concurrencyLimit: DEFAULT_CONCURRENCY_LIMIT };
      });
      if (changed) profilesChangedForFHL = true;
      try { localStorage.setItem(CONCURRENCY_DEFAULT_V4_MIGRATION_KEY, "1"); } catch {}
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
    // 闂傚倸鍊搁崐鎼佸磹閻戣姤鍊块柨鏇楀亾妞ゎ亜鍟村畷褰掝敋閸涱垰濮洪梻浣侯潒閸曞灚鐣剁紓浣插亾濠㈣泛澶囬崑鎾荤嵁閸喖濮庡銈忓瘜閸ㄨ泛顕ｆ导鏉懳ㄩ柨鏂垮⒔椤旀洟姊洪悷鎵憼闁荤喆鍎甸幃姗€顢旈崼鐔哄幈闂侀潧鐗嗛幏鎴﹀绩婵犳碍鐓忛柛銉戝喚浼傜紓浣哄У閻╊垶鐛鈧獮鍥ㄦ媴妞嬪海锛涢梻鍌氬€风粈渚€骞栭鈶芥稑鈻庤箛锝囧數濠殿喗銇涢崑鎾绘煕閳瑰灝鍔滅€垫澘瀚伴獮鍥敆娓氬洦顥ゅ┑鐘垫暩閸嬫稑螞濞戙垹纾婚柟鎯ь嚟閹煎湱绱撻崒姘偓鎼佸磹妞嬪孩顐芥慨妯虹壄閻戣棄纾奸柣鎰皺閻撴垿姊洪崨濠傚闁告柨閰ｅ鎶芥晜閻ｅ瞼顔曢梺绯曞墲钃遍悘蹇庡嵆閺岀喖顢涘鍐ф闂佽鍠栭崲鏌ュ煝鎼淬倗鐤€闁瑰灝鍟╃槐鎴︽⒒娴ｈ櫣甯涚紒瀣箻瀹曟洟鎮界粙璺ㄧ暫?闂傚倸鍊搁崐鎼佸磹閻戣姤鍤勯柛顐ｆ礀绾惧鏌曟繛鐐珔缁炬儳娼￠弻锛勪沪鐠囨彃濮庨梺钘夊暟閸犳牠寮婚妸鈺傚亜闁告繂瀚呴姀銈嗙厽?闂傚倸鍊搁崐鎼佸磹瀹勬噴褰掑炊椤掑﹦绋忔繝銏ｆ硾椤戝洭銆呴幓鎹楀綊鎮╁顔煎壈缂備讲鍋撳鑸靛姇缁犲綊寮堕崼婵嗏挃闁告帊鍗抽弻?backend,婵犵數濮撮惀澶愬级鎼存挸浜炬俊銈勭劍閸欏繘鏌ｉ幋锝嗩棄缁炬儳顭烽弻锝夊箛椤掍焦鍎撶紒鐐劤閻忔繈鍩為幋锕€纾兼慨姗嗗墻濡矂姊烘潪鎵槮闁挎洦浜璇测槈閵忕姈銊╂煥濠靛棙鍣规い顒€顑夊鍝勭暦閸モ晛绗″┑鈽嗗亜閸熸潙顕ｇ拠娴嬫婵☆垶鏀遍弬鈧梻浣虹《閸撴繈銆冭箛鏃傤浄濠靛倸鎲￠悡鐔兼煟濡じ鍚柛鏂跨Ф閹叉悂寮堕崹顔芥閻熸粓顣︾欢姘潖濞差亜绠归柣鎰ゴ閸嬫挸鈽夊杈╊槱婵炴潙鍚嬪娆戝鐟欏嫪绻嗛柕鍫濇噹閺嗙喓绱掗埀顒勫礋椤愮喐鏂€闂佺粯锚绾绢參銆傞弻銉︾厽闁规儳鐡ㄧ粈瀣煛瀹€鈧崰鎾诲焵椤掑倹鏆╂い顓炵墕閻☆參姊绘担鍛婂暈闁哄被鍔戦、鏍ㄥ緞閹邦剝鎽曢梺鎸庣箓閹叉﹢寮埀顒勫箯閸涘瓨鍋￠柡澶嬪閺侇亝绻?
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
      promptPrefix: "",
      prompt: "",
      optimizationGuidance: "",
      negativePrompt: "",
      mode: "generate",
      size: "1024x1024",
      quality: "medium",
      outputFormat,
      seed: 0,
      batchCount: 1,
      continuousGenerateTest: false,
      editSourceMode: "manual",
      editAutoAspectUserLocked: false,
      batchProcess: defaultBatchProcessConfig(),
      styleTag: "",
      sources: [],
      currentImageId: null,
      batchResultIds: [],
      batchTaskIds: [],
      selectedBatchTaskId: null,
      batchSinglePreviewOpen: false,
      resultGridOpen: false,
      historyGalleryOpen: false,
      historyGallerySinglePreviewId: null,
      historyGallerySort: "newest",
      runningJobIds: [],
      jobsTotal: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      progress: null,
      streamPreview: null,
      streamPreviews: {},
      lastLogLine: "",
      errorMessage: null,
      errorRawPath: null,
      lastPayload: null,
    };
    const restoredSession = loadWorkspaceSession(outputFormat);
    let restoredBatchTasksById = restoredSession?.batchTasksById ?? {};
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
        const workspace = restoredWorkspaces.find((entry) => entry.id === workspaceId);
        const visibleGroups = filterVisibleJobGroupsForWorkspace(workspace, groups);
        jobGroupsByWorkspace = replaceWorkspaceJobGroups(jobGroupsByWorkspace, workspaceId, [...visibleGroups]);
      }
      const hydrated = await hydrateHistoryFromBrowserGroups(items, jobGroupsByWorkspace);
      items = hydrated.history;
      const knownJobIds = new Set(
        Object.values(jobGroupsByWorkspace)
          .flatMap((groups) => groups)
          .flatMap((group) => group.slots.map((slot) => slot.jobId)),
      );
      for (const workspace of restoredWorkspaces) {
        for (const group of jobGroupsByWorkspace[workspace.id] ?? []) {
          restoredBatchTasksById = updateTasksFromJobGroup(
            restoredBatchTasksById,
            workspace.batchTaskIds ?? [],
            group,
          );
        }
        restoredBatchTasksById = markMissingJobTasksInterrupted(
          restoredBatchTasksById,
          workspace.batchTaskIds ?? [],
          knownJobIds,
        );
      }
      for (const workspace of restoredWorkspaces) {
        const browserPatch = browserRuntimePatchFromGroups(
          jobGroupsByWorkspace[workspace.id] ?? [],
          workspace.continuousGenerateTest === true,
        );
        const taskPatch = (workspace.batchTaskIds?.length ?? 0) > 0
          ? taskRuntimePatchForWorkspace(workspace.id, workspace.batchTaskIds ?? [], restoredBatchTasksById)
          : {};
        restoredWorkspaces = patchWorkspaceRuntime(
          restoredWorkspaces,
          workspace.id,
          { ...browserPatch, ...taskPatch },
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
    const browserRuntime = browserRuntimePatchFromGroups(
      jobGroupsByWorkspace[restoredActiveWorkspace.id] ?? [],
      restoredActiveWorkspace.continuousGenerateTest === true,
    );
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
      promptPrefix: restoredActiveWorkspace.promptPrefix ?? "",
      prompt: restoredActiveWorkspace.prompt,
      optimizationGuidance: restoredActiveWorkspace.optimizationGuidance,
      negativePrompt: restoredActiveWorkspace.negativePrompt,
      size: restoredActiveWorkspace.size,
      quality: restoredActiveWorkspace.quality,
      outputFormat: restoredActiveWorkspace.outputFormat ?? outputFormat,
      seed: restoredActiveWorkspace.seed,
      continuousGenerateTest: restoredActiveWorkspace.continuousGenerateTest === true,
      history: items,
      historyHasMore: !!initialHistoryPage.nextCursor && items.length < MAX_HISTORY_ITEMS,
      historyLoading: false,
      historyCursorBeforeDayStart: initialHistoryPage.nextCursor?.beforeDayStart ?? null,
      batchResults: restoredBatchResults,
      resultGridOpen: !!restoredActiveWorkspace.resultGridOpen,
      historyGalleryOpen: restoredActiveWorkspace.historyGalleryOpen === true,
      historyGallerySinglePreviewId: restoredActiveWorkspace.historyGallerySinglePreviewId ?? null,
      historyGallerySort: restoredActiveWorkspace.historyGallerySort ?? "newest",
      materialManagerOpen: false,
      materialGroups,
      currentImage: restoredCurrentImage,
      compareB: null,
      compareMode: "curtain",
      annotations: [],
      strokes: [],
      maskDataURL: null,
      runningJobMeta: isBackgroundTaskProxyMode() ? buildRunningJobMetaFromBrowserGroups(jobGroupsByWorkspace) : {},
      jobGroupsByWorkspace,
      batchTasksById: restoredBatchTasksById,
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
      jobsFailed: isBackgroundTaskProxyMode()
        ? browserRuntime.jobsFailed ?? 0
        : restoredActiveWorkspace.jobsFailed ?? 0,
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
      editSourceMode: restoredActiveWorkspace.editSourceMode ?? "manual",
      batchProcess: normalizeBatchProcessConfig(restoredActiveWorkspace.batchProcess),
      styleTag: restoredActiveWorkspace.styleTag ?? "",
      profiles,
      activeProfileId,
      workspaces: restoredWorkspaces,
      activeWorkspaceId: restoredActiveWorkspace.id,
      // Android 闂傚倸鍊搁崐宄懊归崶褏鏆﹂柛顭戝亝閸欏繒鈧箍鍎遍ˇ顖滃閸忓吋鍙忔慨妤€妫楁晶浼存煏閸偄鏋熷ǎ鍥э躬閹瑩顢旈崟銊ヤ壕闁圭増婢橀悿鐐節闂堟稓澧曢柛銊︾箖閵囧嫰寮介顫捕婵?hero 闂傚倸鍊峰ù鍥敋瑜忛埀顒佺▓閺呯娀銆佸▎鎾冲唨妞ゆ挾鍋熼悰銉モ攽鎺抽崐鎰板磻閹剧粯鍋傞柕鍫濐槹閻撴稓鈧箍鍎辨绋款嚕妤ｅ啯鐓涘ù锝呭閸庢梹鎱ㄦ繝鍐┿仢妞ゃ垺顨婇崺鈧い鎺戝€婚惌鎾绘煟閵忋埄鐒鹃柣銈囧亾閵囧嫰骞掗幋婵愪痪闂佺锕ら悥濂稿蓟閿濆绠涙い鏍ㄧ〒閵嗘劖绻涚€涙鐭婄紓宥咃躬瀵鏁愭径瀣簻闂佸憡绺块崕鎶芥偪閸曨垱鈷戦柛婵嗗閻掕法绱撳鍕獢闁轰焦鍔欓幃娆愮瑹椤栨稒娅岄梻渚€鈧偛鑻晶顖毲庨崶褝鏀荤紒杞扮矙瀹曘劍绻濋崟顐㈢濠碉紕鍋戦崐鏍偋濡も偓閻ｆ繈骞栨担鍝ョ厬闂佸憡娲﹂崢鎼佸磻閹捐埖鍠嗛柛鏇ㄥ墰椤︺劎绱撴担绛嬪殭闁绘锕ョ粚杈ㄧ節閸パ咁啇婵炶揪缍€閸婁粙濡搁埡鍌滃帾婵犮垼顕栭崹顖滅矆娴ｅ湱顩烽煫鍥ㄧ⊕閳锋垿鎮归崶銊ョ祷妞ゆ帇鍨洪妵鍕籍閳ь剟鎮ч悩鑼殾闁哄顑欏鈺呮椤掍胶銈撮柛瀣尰閹峰懘宕烽鐘垫闂備焦鎮堕崕鎾春閺嶎厼鐤鹃柍鍝勬噺閳锋垿鏌涘┑鍡楊仾鐎瑰憡绻傞埞鎴︻敋閳ь剟藟閹惧鐝堕柡鍥ュ灪閸婇攱銇勯幋婵嗙稏缂併劌顭峰娲传閸曨剙绐涢梺绋款儑閸嬨倛妫㈤梺缁樕戦崜姘枔娴犲鐓熼柟鏉垮悁缁ㄥ鏌ｈ箛锝勭盎閼挎劙鏌涢妷鎴濈Т娴兼劙鏌х紒妯煎⒌闁哄苯绉烽¨渚€鏌涢幘璺烘灈妤犵偛妫楅悾婵嬪礋椤愩倧绱叉繝娈垮枟椤牓宕戦幇鏉跨闁绘垼濮ら埛鎴犵磽娴ｇ櫢渚涙繛鍫熸閺岋絽螖閳ь剛鎹㈠鈧俊鎾川椤曞懏效闁圭厧鐡ㄩ敋濞存粎鍋撻〃銉╂倷閼碱兛铏庨梺鍛婃⒐瀹€鎼佸箖濡も偓椤繈鎮℃惔銏壕缂傚倷绶￠崰姘卞垝椤栨粎鐭夐柟鐑樻煛閸嬫捇鏁愭惔鈥茬敖闂佸憡眉缁瑥顫忓ú顏勭閹艰揪绲块悾闈涒攽閳藉棗浜濋柣鈺婂灦閻涱喗绻濋崶褏鍊為梺闈涱煭缁茶偐鑺辨繝姘拺闁告劕寮堕幆鍫ユ倵濮樺崬鍘寸€规洟娼ч埢搴ㄥ箻鐎电甯楅梺鑽ゅТ濞诧箓鎮￠敓鐘茬煑闁告洦鍨遍悡鏇㈡煏婵犲繒鐣遍柛鏂诲€濋弻锝夋晲閸パ冨箣閻庤娲栭悥濂稿春閻愮儤鍊锋い鎺嶇劍閻濐偊姊婚崒姘偓宄懊归崶顒夋晪鐟滃秹婀侀梺缁樺灱濡嫰寮告笟鈧弻鐔兼⒒鐎垫瓕绐楅梺杞扮鐎氫即寮婚敓鐘茬倞闁靛鍎虫禒濂告⒑?
      settingsOpen: shouldAutoOpenSettings,
      upstreamModalOpen: false,
      upstreamReturnTarget: shouldAutoOpenSettings ? "settings" : "app",
    });
    if (isBackgroundTaskProxyMode()) {
      syncBrowserJobSubscriptions(jobGroupsByWorkspace);
    }
    if (
      restoredActiveWorkspace.mode === "edit"
      && (restoredActiveWorkspace.editSourceMode === "manual" || restoredActiveWorkspace.editSourceMode === "batch")
      && normalizeBatchProcessConfig(restoredActiveWorkspace.batchProcess).autoAspectResolution
    ) {
      void syncSharedEditAutoAspect({ getState: get, setState: set });
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

  setCompareB: (item, mode) => mediaActions.setCompareB(item, mode),
  setCompareSplit: (v) => mediaActions.setCompareSplit(v),
  openCompareWithPrimarySource: async (mode) => mediaActions.openCompareWithPrimarySource(mode),
  openSourcePreview: (item) => mediaActions.openSourcePreview(item),
  closeSourcePreview: () => mediaActions.closeSourcePreview(),
  openResultGrid: () => mediaActions.openResultGrid(),
  closeResultGrid: () => mediaActions.closeResultGrid(),
  selectBatchGridItem: (item) => mediaActions.selectBatchGridItem(item),
  selectBatchResult: async (item) => mediaActions.selectBatchResult(item),
  openHistoryGallery: async () => mediaActions.openHistoryGallery(),
  closeHistoryGallery: () => mediaActions.closeHistoryGallery(),
  closeHistoryGalleryToEmpty: () => mediaActions.closeHistoryGalleryToEmpty(),
  setHistoryGallerySort: (value) => mediaActions.setHistoryGallerySort(value),
  selectHistoryGalleryGridItem: (item) => mediaActions.selectHistoryGalleryGridItem(item),
  selectHistoryGalleryResult: async (item) => mediaActions.selectHistoryGalleryResult(item),
  openMaterialManager: () => set({ materialManagerOpen: true }),
  closeMaterialManager: () => set({ materialManagerOpen: false }),
  createMaterialGroup: (kind: MaterialGroupKind, name: string, items: MaterialRef[] = [], description = "") => {
    const resolvedName = uniqueMaterialGroupName(get().materialGroups, kind, name)
      || (kind === "referenceSet" ? "Reference Set" : "Folder");
    const nextGroup = createMaterialGroupInput(kind, resolvedName, items, Date.now(), description);
    set((state) => {
      const next = [...state.materialGroups, nextGroup];
      persistMaterialGroups(next);
      return { materialGroups: next };
    });
    return nextGroup.id;
  },
  renameMaterialGroup: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => {
      const next = state.materialGroups.map((group) => (
        group.id === id ? { ...group, name: trimmed, updatedAt: Date.now() } : group
      ));
      persistMaterialGroups(next);
      return { materialGroups: next };
    });
  },
  deleteMaterialGroup: (id) => {
    set((state) => {
      const next = state.materialGroups.filter((group) => group.id !== id);
      persistMaterialGroups(next);
      return { materialGroups: next };
    });
  },
  moveHistoryItemsToMaterialGroup: (groupId, historyIds) => {
    const refs = historyIds
      .filter((historyId) => get().history.some((item) => item.id === historyId))
      .map((historyId) => ({ kind: "history", historyId }) satisfies MaterialRef);
    if (refs.length === 0) return;
    set((state) => {
      const next = state.materialGroups.map((group) => (
        group.id === groupId
          ? { ...group, items: uniqueMaterialRefs([...group.items, ...refs]), updatedAt: Date.now() }
          : group
      ));
      persistMaterialGroups(next);
      return { materialGroups: next };
    });
  },
  removeMaterialItem: (groupId, itemRef) => {
    const targetKey = materialRefKey(itemRef);
    set((state) => {
      const next = state.materialGroups.map((group) => (
        group.id === groupId
          ? { ...group, items: group.items.filter((item) => materialRefKey(item) !== targetKey), updatedAt: Date.now() }
          : group
      ));
      persistMaterialGroups(next);
      return { materialGroups: next };
    });
  },
  createReferenceSetFromCurrentSources: (name) => {
    const refs = refsFromSources(get().sources);
    if (refs.length === 0) {
      get().pushToast("Current sources are empty; nothing to save as a reference set", "warn", 2400);
      return null;
    }
    const groupId = get().createMaterialGroup("referenceSet", name || "Reference Set", refs);
    get().pushToast(`Created a reference set with ${refs.length} items`, "success", 2200);
    return groupId;
  },
  applyMaterialReferenceSet: async (groupId, mode) => {
    const group = get().materialGroups.find((item) => item.id === groupId && item.kind === "referenceSet");
    if (!group) return;
    const historyById = new Map(get().history.map((item) => [item.id, item]));
    const sources: SourceImage[] = [];
    for (const ref of group.items) {
      if (ref.kind === "source") {
        sources.push(ref.source);
        continue;
      }
      const item = historyById.get(ref.historyId);
      if (!item) continue;
      const source = await sourceFromHistoryForMaterial(item);
      if (source) sources.push(source);
    }
    if (sources.length === 0) {
      get().pushToast("Reference set does not contain any usable source images", "warn", 2400);
      return;
    }
    const nextSources = mergeSources(get().sources, sources, mode);
    set((state) => ({
      sources: nextSources,
      mode: "edit",
      materialManagerOpen: false,
      workspaces: patchWorkspaceRuntime(state.workspaces, state.activeWorkspaceId, {
        sources: nextSources,
        mode: "edit",
      }),
    }));
    get().pushToast(mode === "replace" ? `Replaced sources with ${nextSources.length} reference images` : `Added ${sources.length} reference images`, "success", 2200);
  },
  syncMaterialGroupToOutput: async (groupId) => {
    const group = get().materialGroups.find((item) => item.id === groupId);
    if (!group) {
      get().pushToast("Material group was not found for output sync", "warn", 2600);
      return null;
    }
    const historyById = new Map(get().history.map((item) => [item.id, item]));
    const items = materialSyncItemsForGroup(group, historyById);
    try {
      const result = await SyncMaterialGroupToOutput(group.kind, group.name, items);
      if (result.synced > 0 && result.missing > 0) {
        get().pushToast(`Synced ${result.synced} items to output; ${result.missing} were missing`, "warn", 3600);
      } else if (result.synced > 0) {
        get().pushToast(`已同步 ${result.synced} 项到 output`, "success", 2600);
      } else if (result.missing > 0) {
        get().pushToast(`Skipped ${result.missing} missing items during output sync`, "warn", 3600);
      } else {
        get().pushToast("Material group synced to output", "success", 2200);
      }
      return result;
    } catch (error: any) {
      get().pushToast(`同步到 output 失败：${error?.message ?? error}`, "error", 4200);
      return null;
    }
  },
  syncAllMaterialGroupsToOutput: async () => {
    const groups = get().materialGroups.filter((group) => group.kind === "folder" || group.kind === "referenceSet");
    if (groups.length === 0) {
      get().pushToast("No folders or reference sets are available for output sync", "warn", 2600);
      return;
    }
    const historyById = new Map(get().history.map((item) => [item.id, item]));
    let synced = 0;
    let missing = 0;
    let failed = 0;
    for (const group of groups) {
      try {
        const result = await SyncMaterialGroupToOutput(group.kind, group.name, materialSyncItemsForGroup(group, historyById));
        synced += result.synced;
        missing += result.missing;
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) {
      get().pushToast(`Synced ${synced} items; ${missing} missing; ${failed} groups failed`, "warn", 4600);
    } else if (missing > 0) {
      get().pushToast(`Synced ${synced} items to output; ${missing} were missing`, "warn", 4200);
    } else {
      get().pushToast(`Synced ${synced} items to output`, "success", 3200);
    }
  },
  openMaterialSyncDir: async (path) => {
    try {
      await OpenMaterialSyncDir(path ?? "");
    } catch (error: any) {
      get().pushToast(`打开同步目录失败：${error?.message ?? error}`, "error", 3600);
    }
  },
  pushToast: (text, kind = "info", ttl = 3500, action) => mediaActions.pushToast(text, kind, ttl, action),
  dismissToast: (id) => mediaActions.dismissToast(id),
  resultDetail: null,
  openResultDetail: async (item) => mediaActions.openResultDetail(item),
  closeResultDetail: () => mediaActions.closeResultDetail(),
  openPanoramaViewer: async (item) => mediaActions.openPanoramaViewer(item),
  closePanoramaViewer: () => mediaActions.closePanoramaViewer(),
  openPanoramaPastebackAligner: (item) => set({ panoramaAlignTarget: item }),
  closePanoramaPastebackAligner: () => set({ panoramaAlignTarget: null }),
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
    if (!currentProviderHasRequiredKey(s)) {
      s.pushToast("请先填写 API Key", "warn");
      return;
    }
    if (!s.baseURL.trim()) {
      s.pushToast("请先填写 Base URL，再测试 API 连接", "warn", 5000);
      return;
    }
    let cleanedAPIKey = "";
    if (providerRequiresDirectAPIKey(s.apiMode)) {
      try {
      cleanedAPIKey = validateAPIKeyForHeader(s.apiKey);
    } catch (error: any) {
      s.pushToast(error?.message ?? "API Key 格式无效", "error", 6000);
      return;
    }
    if (cleanedAPIKey !== s.apiKey) {
      const activeId = s.activeProfileId;
      set({ apiKey: cleanedAPIKey });
        if (activeId) {
          try { await SetStoredAPIKey(keyringUserFor(activeId), cleanedAPIKey); } catch {}
        }
      }
    }
    const cleanedBaseURL = cleanBaseURL(s.baseURL);
    if (s.isTestingKey) return;
    set({ isTestingKey: true });
    s.pushToast("正在测试 API 连接，请稍候...", "info", 3200);
    try {
      await probeCurrentUpstream(cleanedBaseURL, cleanedAPIKey, s.proxyMode, s.proxyURL, s.apiMode);
      set({ isTestingKey: false });
      {
        syncCLIConfigQuietly(cliConfigFromState(get(), {
          apiKey: cleanedAPIKey,
          baseURL: cleanedBaseURL,
        }));
      }
      s.pushToast(s.apiMode === "apimart" ? "APIMart 连接测试成功" : "连接测试成功，已确认上游模型可用", "success");
    } catch (e: any) {
      set({ isTestingKey: false });
      s.pushToast(`测试连接失败：${e?.message ?? e}`, "error", 6000);
    }
  },
  optimizePrompt: async (options: { useGuidance?: boolean } = {}) => {
    const s = get();
    if (s.isOptimizingPrompt || s.isReversingPrompt) return;
    const optimizeProfile = await resolvePromptTextProfile(s);
    if (!optimizeProfile.apiKey) {
      s.pushToast("请先配置用于 Prompt 优化的 API Key", "warn");
      return;
    }
    if (!optimizeProfile.baseURL) {
      s.pushToast("Prompt optimization requires a Responses API profile", "warn", 5000);
      return;
    }
    if (!s.prompt.trim()) {
      s.pushToast("请先输入 prompt", "warn");
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
        apiKey: optimizeProfile.apiKey,
        prompt: s.prompt,
        optimizationGuidance: options.useGuidance === false ? "" : s.optimizationGuidance,
        mode: s.mode,
        baseURL: optimizeProfile.baseURL,
        textModelID: optimizeProfile.textModelID,
        proxyMode: s.proxyMode,
        proxyURL: s.proxyURL,
        imagePaths: sourcePaths,
        imagePath: "",
      } satisfies PromptOptimizeRequest);
      const trimmed = optimized.trim();
      if (!trimmed) {
        throw new Error("Prompt optimization returned empty text");
      }
      set({ prompt: trimmed });
      s.pushToast("Prompt optimization imported into the editor", "success");
    } catch (e: any) {
      const msg = `Prompt 优化失败：${e?.message ?? e}`;
      set({ errorMessage: msg, errorRawPath: null });
      s.pushToast(msg, "error", 6000);
    } finally {
      set({ isOptimizingPrompt: false });
    }
  },

  reversePromptFromImage: async () => {
    const s = get();
    if (s.isOptimizingPrompt || s.isReversingPrompt) return;
    const reverseProfile = await resolvePromptTextProfile(s);
    if (!reverseProfile.apiKey) {
      s.pushToast("请先配置用于反推提示词的 API Key", "warn");
      return;
    }
    if (!reverseProfile.baseURL) {
      s.pushToast("Reverse prompt requires a Responses API profile", "warn", 5000);
      return;
    }

    const sourcePaths: string[] = [];
    const sourceImages: PromptReverseRequest["sourceImages"] = [];
    let current = s.currentImage;
    if (current?.previewOnly) {
      const materialized = await materializeHistoryItem(current).catch(() => null);
      if (materialized) {
        if (useStudioStore.getState().currentImage?.id === current.id) {
          set({ currentImage: materialized });
        }
        current = materialized;
      }
    }
    if (s.reversePromptImage?.path) {
      sourcePaths.push(s.reversePromptImage.path);
    } else if (current?.savedPath) {
      sourcePaths.push(current.savedPath);
    } else if (s.sources[0]?.path) {
      sourcePaths.push(s.sources[0].path);
    }
    if (sourcePaths.length === 0) {
      if (s.reversePromptImage?.imageB64 || s.reversePromptImage?.imageBlob) {
        sourceImages.push({
          path: s.reversePromptImage.path,
          name: s.reversePromptImage.name,
          imageB64: s.reversePromptImage.imageB64 || null,
          imageBlob: s.reversePromptImage.imageBlob || null,
        });
      } else if (current?.imageB64 || current?.imageBlob) {
        sourceImages.push({
          path: current.savedPath || "",
          name: "current-image.png",
          imageB64: current.imageB64 || null,
          imageBlob: current.imageBlob || null,
        });
      } else if (s.sources[0]?.imageB64 || s.sources[0]?.imageBlob) {
        const first = s.sources[0];
        sourceImages.push({
          path: first.path,
          name: first.name,
          imageB64: first.imageB64 || null,
          imageBlob: first.imageBlob || null,
        });
      }
    }
    if (sourcePaths.length === 0 && sourceImages.length === 0) {
      s.pushToast("Select an image before applying history params", "warn", 3600);
      return;
    }

    set({ isReversingPrompt: true, errorMessage: null, errorRawPath: null });
    try {
      const reversed = await wailsReversePrompt({
        apiKey: reverseProfile.apiKey,
        baseURL: reverseProfile.baseURL,
        textModelID: reverseProfile.textModelID,
        proxyMode: s.proxyMode,
        proxyURL: s.proxyURL,
        imagePaths: sourcePaths,
        imagePath: "",
        sourceImages,
      } satisfies PromptReverseRequest);
      const trimmed = reversed.trim();
      if (!trimmed) {
        throw new Error("Reverse prompt returned empty text");
      }
      set({ prompt: trimmed });
      s.pushToast("Reverse prompt imported into the editor", "success");
    } catch (e: any) {
      const msg = `反推提示词失败：${e?.message ?? e}`;
      set({ errorMessage: msg, errorRawPath: typeof e?.rawPath === "string" && e.rawPath ? e.rawPath : null });
      s.pushToast(msg, "error", 6000);
    } finally {
      set({ isReversingPrompt: false });
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
    // after the failure 闂?different seed, different prompt 闂?take effect.)
    await get().submit();
  },

  retryFailedJob: async (groupId, jobId) => {
    const s = get();
    const groups = s.jobGroupsByWorkspace[s.activeWorkspaceId] ?? [];
    const group = groups.find((entry) => entry.groupId === groupId);
    const slot = group?.slots.find((entry) => entry.jobId === jobId);
    if (!group || !slot) {
      get().pushToast("No matching job group was found", "error", 3600);
      return;
    }
    if (slot.status !== "failed" && slot.status !== "interrupted") {
      get().pushToast("This slot is already queued or running", "warn", 3000);
      return;
    }
    const retryContext = retrySubmitContextFromState(s, group.mode);
    if (!currentProviderHasRequiredKey(s)) {
      set({ errorMessage: "请填写 API Key", errorRawPath: null });
      return;
    }
    let cleanedAPIKey = "";
    if (providerRequiresDirectAPIKey(s.apiMode)) {
      try {
      cleanedAPIKey = validateAPIKeyForHeader(s.apiKey);
    } catch (error: any) {
      set({ errorMessage: error?.message ?? "API Key 格式不正确", errorRawPath: null });
      return;
    }
    }
    const cleanedBaseURL = cleanBaseURL(retryContext.baseURL);
    if (!cleanedBaseURL) {
      set({ errorMessage: "Base URL is required for this retry task", errorRawPath: null });
      return;
    }
    const workspaceId = group.workspaceId;
    const workspace = s.workspaces.find((entry) => entry.id === workspaceId);
    const retryAutoAspectResolution = retryAutoAspectResolutionForContext(group, workspace);
    const shouldRebuildRetryAutoAspectSize = !!retryAutoAspectResolution && !group.batchSourcePath;
    const retryAutoAspectSize = shouldRebuildRetryAutoAspectSize
      ? await buildRetryAutoAspectSizeForContext(group, workspace, retryAutoAspectResolution, {
        apiMode: retryContext.apiMode,
        requestPolicy: retryContext.requestPolicy,
        imageModelID: retryContext.imageModelID,
      })
      : null;
    if (shouldRebuildRetryAutoAspectSize && !retryAutoAspectSize) {
      const message = "Retry auto-aspect could not read the saved source image ratio";
      set({ errorMessage: message, errorRawPath: null });
      get().pushToast("Retry auto-aspect could not rebuild the saved size", "error", 4200);
      return;
    }
    const retrySize = normalizeSizeSelection(retryAutoAspectSize ?? group.size, {
      apiMode: retryContext.apiMode,
      requestPolicy: retryContext.requestPolicy,
      imageModelID: retryContext.imageModelID,
      mode: group.mode,
    });
    const retryBatchIndex = continuousSlotIndex(group, slot);
    if (!Number.isFinite(retryBatchIndex) || retryBatchIndex < 0) {
      get().pushToast("This slot cannot be retried because its index is invalid", "error", 3600);
      return;
    }
    const existingRunningForSlot = groups.some((entry) => {
      if (entry.continuousGenerateTest !== true || entry.batchCount !== 1) return false;
      return entry.slots.some((entrySlot) => (
        continuousSlotIndex(entry, entrySlot) === retryBatchIndex
        && (entrySlot.status === "queued" || entrySlot.status === "running")
      ));
    });
    if (existingRunningForSlot) {
      get().pushToast("This slot is already queued or running in continuous mode", "warn", 3000);
      return;
    }
    const seedBase = Number.isFinite(Number(group.seed)) && Number(group.seed) > 0
      ? Math.max(0, Number(group.seed) + Number(slot.batchIndex || 0))
      : 0;
    const optimisticPatch: WorkspacePatch = {
      errorMessage: null,
      errorRawPath: null,
      progress: null,
      streamPreview: null,
      streamPreviews: {},
      lastLogLine: "",
      jobsTotal: Math.max(workspaceRuntimeFromState(s, workspaceId).jobsTotal, retryBatchIndex + 1),
      resultGridOpen: true,
      historyGalleryOpen: false,
    };
    set((state) => ({
      workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, optimisticPatch),
      ...(state.activeWorkspaceId === workspaceId ? { ...activeRuntimePatch(optimisticPatch), resultGridOpen: true, historyGalleryOpen: false } : {}),
    } as Partial<StudioState>));
    try {
      if (!shouldUseBackgroundTaskProxyForSubmit(retryContext.apiMode)) {
        const sourceIdentity = sourceIdentityForBrowserGroupSlot(group, slot);
        const sourceImages = group.mode === "edit" ? (sourceIdentity.sourceImages ?? []) : [];
        const payload: RuntimeGenerateOptions = {
          apiKey: cleanedAPIKey,
          mode: group.mode,
          requestedJobId: "",
          prompt: group.prompt,
          size: retrySize,
          quality: group.quality,
          outputFormat: group.outputFormat,
          imagePaths: group.sourceImagePaths ?? [],
          imagePath: "",
          maskB64: "",
          seed: seedBase,
          negativePrompt: group.negativePrompt || "",
          baseURL: cleanedBaseURL,
          textModelID: retryContext.textModelID,
          imageModelID: retryContext.imageModelID,
          proxyMode: s.proxyMode,
          proxyURL: s.proxyURL,
          requestPolicy: retryContext.requestPolicy,
          apiMode: retryContext.apiMode,
          imagesNewAPICompat: retryContext.imagesNewAPICompat,
          noPromptRevision: true,
          concurrencyLimit: retryContext.concurrencyLimit,
          partialImages: 1,
          sourceImages: group.mode === "edit" ? sourceImages : undefined,
        };
        void launchOneJob(group.mode, payload, {
          workspaceId,
          apiMode: retryContext.apiMode,
          ...retryContext.apiProfileSnapshot,
          batchIndex: retryBatchIndex,
          size: retrySize,
          quality: group.quality,
          outputFormat: group.outputFormat,
          sources: sourceImages,
          currentImage: null,
          styleTag: group.styleTag || "",
          continuousGenerateTest: true,
        });
        get().pushToast("Queued task was submitted through the API backend", "success", 2600);
        return;
      }
      const submitJobGroup = isAndroidTaskProxyMode() ? submitAndroidJobGroup : submitBrowserJobGroup;
      const response = await submitJobGroup({
        workspaceId,
        mode: group.mode,
        prompt: group.prompt,
        size: retrySize,
        quality: group.quality,
        outputFormat: group.outputFormat,
        batchCount: 1,
        seed: seedBase,
        negativePrompt: group.negativePrompt || "",
        styleTag: group.styleTag || "",
        sourceImagePaths: group.sourceImagePaths ?? [],
        batchSourcePath: group.batchSourcePath || "",
        batchSourceSlotIndex: group.batchSourceSlotIndex,
        maskB64: "",
        apiKey: cleanedAPIKey,
        baseURL: cleanedBaseURL,
        apiMode: retryContext.apiMode,
        ...retryContext.apiProfileSnapshot,
        requestPolicy: retryContext.requestPolicy,
        imagesNewAPICompat: retryContext.imagesNewAPICompat,
        textModelID: retryContext.textModelID,
        imageModelID: retryContext.imageModelID,
        continuousGenerateTest: true,
        continuousBatchIndex: retryBatchIndex,
      });
      const nextJobGroupsByWorkspace = mergeWorkspaceJobGroup(get().jobGroupsByWorkspace, response.group);
      const runtimePatch = browserRuntimePatchFromGroups(nextJobGroupsByWorkspace[workspaceId] ?? [], true);
      const runningJobMeta = buildRunningJobMetaFromBrowserGroups(nextJobGroupsByWorkspace);
      const gridPatch = { ...runtimePatch, resultGridOpen: true, historyGalleryOpen: false };
      set((state) => ({
        jobGroupsByWorkspace: nextJobGroupsByWorkspace,
        runningJobMeta,
        workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, gridPatch),
        ...(state.activeWorkspaceId === workspaceId ? { ...activeRuntimePatch(gridPatch), resultGridOpen: true, historyGalleryOpen: false } : {}),
      } as Partial<StudioState>));
      syncBrowserJobSubscriptions(nextJobGroupsByWorkspace);
      scheduleAutoRetriesForBrowserGroup(response.group);
      get().pushToast("Background task query completed", "success", 2600);
    } catch (error: any) {
      const message = `重新生成提交失败:${error?.message ?? error}`;
      const failedPatch: WorkspacePatch = {
        errorMessage: message,
        lastLogLine: message,
        errorRawPath: null,
        progress: null,
        streamPreview: null,
        streamPreviews: {},
        historyGalleryOpen: false,
      };
      set((state) => ({
        workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, failedPatch),
        ...(state.activeWorkspaceId === workspaceId ? activeRuntimePatch(failedPatch) : {}),
      } as Partial<StudioState>));
    }
  },

  retryBatchTask: async (taskId, options) => {
    const s = get();
    const task = s.batchTasksById[taskId];
    if (!task) {
      get().pushToast("Failed to resolve the queued task after refresh", "error", 3600);
      return;
    }
    const automaticRetry = options?.automatic === true;
    const useTaskProfile = options?.useTaskProfile === true;
    if (!automaticRetry) clearAutoRetryTimer(task.id);
    if (task.status === "queued" || task.status === "running") {
      get().pushToast("This queued task is no longer eligible to start", "warn", 3000);
      return;
    }
    const retryContext = useTaskProfile ? retryContextFromOriginalTask(s, task) : retrySubmitContextFromState(s, task.mode);
    if (useTaskProfile && task.apiProfileId && !retryContext.activeProfile) {
      get().pushToast("Missing API profile for the queued task", "warn", 4200);
      return;
    }
    const retryAPIKey = useTaskProfile ? await apiKeyForProfileOrState(s, task.apiProfileId) : s.apiKey;
    if (providerRequiresDirectAPIKey(retryContext.apiMode) && !retryAPIKey.trim()) {
      set({ errorMessage: "请填写 API Key", errorRawPath: null });
      get().pushToast("请先配置 API Key 后再重新生成", "error", 4200);
      return;
    }
    let cleanedAPIKey = "";
    if (providerRequiresDirectAPIKey(retryContext.apiMode)) {
      try {
        cleanedAPIKey = validateAPIKeyForHeader(retryAPIKey);
      } catch (error: any) {
        const message = error?.message ?? "API Key 格式不正确";
        set({ errorMessage: message, errorRawPath: null });
        get().pushToast(message, "error", 4200);
        return;
      }
    }
    const cleanedBaseURL = cleanBaseURL(retryContext.baseURL);
    if (!cleanedBaseURL) {
      set({ errorMessage: "Base URL is required for this retry task", errorRawPath: null });
      get().pushToast("Missing API key for this retry task", "error", 4200);
      return;
    }
    const independentRetry = options?.independent === true;
    const batchSharedTask = !independentRetry && !!task.batchOutputMode;
    if (batchSharedTask && retryContext.concurrencyLimit <= 0) {
      get().pushToast("Batch-shared retry is blocked because the effective concurrency limit is 0", "warn", 3600);
      return;
    }
    if (batchSharedTask && !batchProcessLinkFromTask(task)) {
      get().pushToast("Batch-shared retry is blocked because the original batch context is missing", "error", 3600);
      return;
    }
    const workspaceId = task.workspaceId;
    const workspace = s.workspaces.find((entry) => entry.id === workspaceId);
    const taskIds = workspace?.batchTaskIds ?? [];
    const existingRunningForSlotTasks = sortedBatchTasksForWorkspace(workspaceId, taskIds, s.batchTasksById)
      .filter((entry) => (
        entry.slotIndex === task.slotIndex
        && entry.id !== task.id
        && (entry.status === "queued" || entry.status === "running")
      ))
      .sort((a, b) => (
        (a.status === "running" ? 0 : 1) - (b.status === "running" ? 0 : 1)
        || (a.jobId ? 0 : 1) - (b.jobId ? 0 : 1)
        || b.updatedAt - a.updatedAt
        || b.createdAt - a.createdAt
      ));
    if (existingRunningForSlotTasks.length > 0) {
      const activeRetry = existingRunningForSlotTasks[0];
      const now = Date.now();
      const current = get();
      const currentWorkspace = current.workspaces.find((entry) => entry.id === workspaceId);
      const currentTaskIds = currentWorkspace?.batchTaskIds ?? taskIds;
      const mergedTasksById: Record<string, BatchTaskRecord> = { ...current.batchTasksById };
      for (const staleRetry of existingRunningForSlotTasks) {
        const latestStale = mergedTasksById[staleRetry.id] ?? staleRetry;
        clearAutoRetryTimer(latestStale.id);
        mergedTasksById[latestStale.id] = {
          ...latestStale,
          status: "cancelled",
          updatedAt: now,
          queuedReason: undefined,
          queuePriority: undefined,
          groupId: undefined,
          jobId: undefined,
          errorMessage: latestStale.errorMessage || "已有新的重试任务接管此位置",
        };
      }
      const latestTask = mergedTasksById[task.id] ?? task;
      mergedTasksById[task.id] = {
        ...latestTask,
        apiMode: activeRetry.apiMode,
        apiProfileId: activeRetry.apiProfileId,
        apiProfileName: activeRetry.apiProfileName,
        size: activeRetry.size,
        autoAspectResolution: activeRetry.autoAspectResolution,
        quality: activeRetry.quality,
        outputFormat: activeRetry.outputFormat,
        requestPolicy: activeRetry.requestPolicy,
        imagesNewAPICompat: activeRetry.imagesNewAPICompat,
        textModelID: activeRetry.textModelID,
        imageModelID: activeRetry.imageModelID,
        status: activeRetry.status,
        updatedAt: now,
        queuedReason: activeRetry.queuedReason,
        queuePriority: activeRetry.queuePriority,
        groupId: activeRetry.groupId,
        jobId: activeRetry.jobId,
        historyItemId: undefined,
        savedPath: undefined,
        rawPath: undefined,
        errorMessage: undefined,
        lastLogLine: activeRetry.lastLogLine,
        elapsedSec: undefined,
      };
      const retryPatch: WorkspacePatch = {
        ...taskRuntimePatchForWorkspace(workspaceId, currentTaskIds, mergedTasksById),
        resultGridOpen: true,
        historyGalleryOpen: false,
      };
      set((state) => ({
        batchTasksById: mergedTasksById,
        workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, retryPatch),
        ...(state.activeWorkspaceId === workspaceId ? { ...activeRuntimePatch(retryPatch), resultGridOpen: true, historyGalleryOpen: false } : {}),
      } as Partial<StudioState>));
      get().pushToast(
        activeRetry.status === "running"
          ? "\u8fd9\u4e2a\u4f4d\u7f6e\u5df2\u7ecf\u5728\u91cd\u65b0\u751f\u6210\uff0c\u5df2\u540c\u6b65\u4e3a\u6b63\u5728\u751f\u6210"
          : "\u8fd9\u4e2a\u4f4d\u7f6e\u5df2\u7ecf\u5728\u961f\u5217\u91cc\uff0c\u5df2\u540c\u6b65\u4e3a\u6392\u961f\u4e2d",
        "info",
        2600,
      );
      if (activeRetry.status === "queued") void pumpContinuousQueue(workspaceId, activeRetry.apiMode);
      return;
    }
    const retryQueueLimit = batchSharedTask
      ? retryContext.concurrencyLimit
      : continuousQueueLimitForState(s, retryContext.apiMode, retryContext.apiProfileSnapshot.apiProfileId);
    const retryAutoAspectResolution = retryAutoAspectResolutionForContext(task, workspace);
    const shouldRebuildRetryAutoAspectSize = !!retryAutoAspectResolution && !task.batchSourcePath;
    const retryAutoAspectSize = shouldRebuildRetryAutoAspectSize
      ? await buildRetryAutoAspectSizeForContext(task, workspace, retryAutoAspectResolution, {
        apiMode: retryContext.apiMode,
        requestPolicy: retryContext.requestPolicy,
        imageModelID: retryContext.imageModelID,
      })
      : null;
    if (shouldRebuildRetryAutoAspectSize && !retryAutoAspectSize) {
      const message = "Retry auto-aspect could not read the saved source image ratio";
      set({ errorMessage: message, errorRawPath: null });
      get().pushToast("Retry auto-aspect could not rebuild the saved size", "error", 4200);
      return;
    }
    const retrySize = normalizeSizeSelection(retryAutoAspectSize ?? task.size, {
      apiMode: retryContext.apiMode,
      requestPolicy: retryContext.requestPolicy,
      imageModelID: retryContext.imageModelID,
      mode: task.mode,
    });
    const queuedTask: BatchTaskRecord = {
      ...task,
      apiMode: retryContext.apiMode,
      ...retryContext.apiProfileSnapshot,
      size: retrySize,
      autoAspectResolution: retryAutoAspectResolution,
      requestPolicy: retryContext.requestPolicy,
      imagesNewAPICompat: retryContext.imagesNewAPICompat,
      textModelID: retryContext.textModelID,
      imageModelID: retryContext.imageModelID,
      status: "queued",
      updatedAt: Date.now(),
      queuedReason: batchSharedTask ? "batch_shared_concurrency" : retryQueueLimit > 0 ? "local_concurrency" : undefined,
      queuePriority: undefined,
      groupId: undefined,
      jobId: undefined,
      historyItemId: undefined,
      savedPath: undefined,
      rawPath: undefined,
      errorMessage: undefined,
      lastLogLine: undefined,
      elapsedSec: undefined,
      autoRetryScheduledAt: undefined,
      autoRetryReason: undefined,
    };
    const queuedTasksById = { ...s.batchTasksById, [task.id]: queuedTask };
    const optimisticPatch: WorkspacePatch = {
      ...taskRuntimePatchForWorkspace(workspaceId, taskIds, queuedTasksById),
      errorMessage: null,
      errorRawPath: null,
      progress: null,
      streamPreview: null,
      streamPreviews: {},
      lastLogLine: "",
      resultGridOpen: true,
      historyGalleryOpen: false,
    };
    set((state) => ({
      batchTasksById: queuedTasksById,
      workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, optimisticPatch),
      ...(state.activeWorkspaceId === workspaceId ? { ...activeRuntimePatch(optimisticPatch), resultGridOpen: true, historyGalleryOpen: false } : {}),
    } as Partial<StudioState>));
    if (batchSharedTask) {
      void pumpContinuousQueue(workspaceId, queuedTask.apiMode);
      get().pushToast("Queued task already uses batch-shared concurrency; waiting for the queue pump", "info", 2200);
      return;
    }
    const limit = continuousQueueLimitForState(get(), queuedTask.apiMode, queuedTask.apiProfileId);
    if (limit > 0) {
      void pumpContinuousQueue(workspaceId, queuedTask.apiMode);
      get().pushToast("Queued task submitted to continue in the background", "info", 2200);
      return;
    }
    try {
      if (!shouldUseBackgroundTaskProxyForSubmit(queuedTask.apiMode)) {
        const sourceImages = sourceImagesForTask(queuedTask);
        const payload: RuntimeGenerateOptions = {
          apiKey: cleanedAPIKey,
          mode: queuedTask.mode,
          requestedJobId: "",
          prompt: queuedTask.prompt,
          size: queuedTask.size,
          quality: queuedTask.quality,
          outputFormat: queuedTask.outputFormat,
          imagePaths: queuedTask.sourceImagePaths ?? [],
          imagePath: "",
          maskB64: queuedTask.maskB64 || "",
          seed: Number.isFinite(Number(queuedTask.seed)) ? Number(queuedTask.seed) : 0,
          negativePrompt: queuedTask.negativePrompt || "",
          baseURL: cleanedBaseURL,
          textModelID: queuedTask.textModelID || retryContext.textModelID,
          imageModelID: queuedTask.imageModelID || retryContext.imageModelID,
          proxyMode: s.proxyMode,
          proxyURL: s.proxyURL,
          requestPolicy: queuedTask.requestPolicy ?? retryContext.requestPolicy,
          apiMode: queuedTask.apiMode,
          imagesNewAPICompat: queuedTask.apiMode === "images" && queuedTask.imagesNewAPICompat === true,
          noPromptRevision: true,
          concurrencyLimit: retryContext.concurrencyLimit,
          partialImages: 1,
          sourceImages: queuedTask.mode === "edit" ? sourceImages : undefined,
        };
        void launchOneJob(queuedTask.mode, payload, {
          workspaceId,
          apiMode: queuedTask.apiMode,
          apiProfileId: queuedTask.apiProfileId,
          apiProfileName: queuedTask.apiProfileName,
          batchIndex: queuedTask.slotIndex,
          size: queuedTask.size,
          quality: queuedTask.quality,
          outputFormat: queuedTask.outputFormat,
          sources: sourceImages,
          currentImage: null,
          styleTag: queuedTask.styleTag || "",
          continuousGenerateTest: true,
          batchProcessLink: batchProcessLinkFromTask(queuedTask),
        });
        get().pushToast("Queued task was submitted through the API backend", "success", 2600);
        return;
      }
      const submitJobGroup = isAndroidTaskProxyMode() ? submitAndroidJobGroup : submitBrowserJobGroup;
      const response = await submitJobGroup({
        workspaceId,
        mode: queuedTask.mode,
        prompt: queuedTask.prompt,
        size: queuedTask.size,
        quality: queuedTask.quality,
        outputFormat: queuedTask.outputFormat,
        batchCount: 1,
        seed: Number.isFinite(Number(queuedTask.seed)) ? Number(queuedTask.seed) : 0,
        negativePrompt: queuedTask.negativePrompt || "",
        styleTag: queuedTask.styleTag || "",
        sourceImagePaths: queuedTask.sourceImagePaths ?? [],
        batchSourcePath: queuedTask.batchSourcePath || "",
        batchSourceSlotIndex: queuedTask.batchSourceSlotIndex,
        maskB64: queuedTask.maskB64 || "",
        apiKey: cleanedAPIKey,
        baseURL: cleanedBaseURL,
        apiMode: queuedTask.apiMode,
        apiProfileId: queuedTask.apiProfileId,
        apiProfileName: queuedTask.apiProfileName,
        requestPolicy: queuedTask.requestPolicy ?? retryContext.requestPolicy,
        imagesNewAPICompat: queuedTask.apiMode === "images"
          ? queuedTask.imagesNewAPICompat === true
          : false,
        textModelID: queuedTask.textModelID || retryContext.textModelID,
        imageModelID: queuedTask.imageModelID || retryContext.imageModelID,
        continuousGenerateTest: true,
        continuousBatchIndex: queuedTask.slotIndex,
      });
      const nextJobGroupsByWorkspace = mergeWorkspaceJobGroup(get().jobGroupsByWorkspace, response.group);
      const nextWorkspace = get().workspaces.find((entry) => entry.id === workspaceId);
      const batchTasksById = updateTasksFromJobGroup(
        get().batchTasksById,
        nextWorkspace?.batchTaskIds ?? [],
        response.group,
      );
      const browserPatch = browserRuntimePatchFromGroups(nextJobGroupsByWorkspace[workspaceId] ?? [], true);
      const taskPatch = taskRuntimePatchForWorkspace(workspaceId, nextWorkspace?.batchTaskIds ?? [], batchTasksById);
      const runtimePatch = { ...browserPatch, ...taskPatch, resultGridOpen: true, historyGalleryOpen: false };
      const runningJobMeta = buildRunningJobMetaFromBrowserGroups(nextJobGroupsByWorkspace);
      set((state) => ({
        jobGroupsByWorkspace: nextJobGroupsByWorkspace,
        batchTasksById,
        runningJobMeta,
        workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, runtimePatch),
        ...(state.activeWorkspaceId === workspaceId ? { ...activeRuntimePatch(runtimePatch), resultGridOpen: true, historyGalleryOpen: false } : {}),
      } as Partial<StudioState>));
      syncBrowserJobSubscriptions(nextJobGroupsByWorkspace);
      scheduleAutoRetriesForBrowserGroup(response.group);
      get().pushToast("Background queue submission completed", "success", 2600);
    } catch (error: any) {
      const message = `重新生成提交失败:${error?.message ?? error}`;
      const failedTasksById = {
        ...get().batchTasksById,
        [task.id]: {
          ...queuedTask,
          status: "failed" as const,
          updatedAt: Date.now(),
          errorMessage: message,
          lastLogLine: message,
        },
      };
      const failedPatch: WorkspacePatch = {
        ...taskRuntimePatchForWorkspace(workspaceId, taskIds, failedTasksById),
        errorMessage: message,
        errorRawPath: null,
        progress: null,
        streamPreview: null,
        streamPreviews: {},
        resultGridOpen: true,
        historyGalleryOpen: false,
      };
      set((state) => ({
        batchTasksById: failedTasksById,
        workspaces: patchWorkspaceRuntime(state.workspaces, workspaceId, failedPatch),
        ...(state.activeWorkspaceId === workspaceId ? { ...activeRuntimePatch(failedPatch), resultGridOpen: true, historyGalleryOpen: false } : {}),
      } as Partial<StudioState>));
      get().pushToast(message, "error", 4600);
      scheduleAutoRetryForTask(failedTasksById[task.id], message);
    }
  },

  retryFailedBatchTasks: async () => {
    const s = get();
    const workspaceId = s.activeWorkspaceId;
    const workspace = s.workspaces.find((entry) => entry.id === workspaceId);
    const retryHistoryById = new Map([...s.batchResults, ...s.history].map((item) => [item.id, item]));
    const failedTasks = sortedBatchTasksForCurrentView(workspaceId, workspace?.batchTaskIds ?? [], s.batchTasksById)
      .filter((task) => isRetryableBatchTask(task, retryHistoryById));
    if (failedTasks.length === 0) {
      s.pushToast("当前批次没有可重试的生成失败/终图缺失任务", "info", 2200);
      return;
    }
    s.pushToast(`正在重试当前批次 ${failedTasks.length} 个生成失败/终图缺失任务`, "info", 2600);
    for (const task of failedTasks) {
      const currentTask = get().batchTasksById[task.id];
      if (!currentTask || !isRetryableBatchTask(currentTask, retryHistoryById)) continue;
      await get().retryBatchTask(task.id);
    }
  },

  importImageFile: async (file, options) => (
    imageActions.importImageFile as (input: File, opts?: { forcePanorama?: boolean }) => Promise<void>
  )(file, options),
}));

// Fire one job (concurrent member of a batch). Registers its own EventsOn
// callbacks; updates store.runningJobs / jobsCompleted as the run progresses.
// `snapshot` is the store state at submit time 闂?captures size/quality/sources
// so per-job result writes still see the originating context.
async function launchOneJob(
  mode: string,
  payload: RuntimeGenerateOptions,
  snapshot: {
    workspaceId: string;
    apiMode: APIModeValue;
    apiProfileId?: string;
    apiProfileName?: string;
    batchIndex: number;
    size: SizeValue;
    quality: QualityValue;
    outputFormat: OutputFormatValue;
    sources: SourceImage[];
    currentImage: HistoryItem | null;
    styleTag: string;
    continuousGenerateTest?: boolean;
    batchProcessLink?: {
      sourcePath: string;
      outputDir: string;
      outputNamePrefix: string;
    };
  },
  hooks?: {
    onSettled?: (status: "success" | "error" | "cancelled") => void;
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
      const workspace = state.workspaces.find((entry) => entry.id === snapshot.workspaceId);
      const nextTasksById = updateTaskForSlot(
        state.batchTasksById,
        workspace?.batchTaskIds ?? [],
        snapshot.workspaceId,
        snapshot.batchIndex,
        {
          status: "running",
          apiMode: snapshot.apiMode,
          apiProfileId: snapshot.apiProfileId,
          apiProfileName: snapshot.apiProfileName,
          size: snapshot.size,
          quality: snapshot.quality,
          outputFormat: snapshot.outputFormat,
          jobId,
          queuedReason: undefined,
          queuePriority: undefined,
          errorMessage: undefined,
        },
      );
      const patch: WorkspacePatch = {
        ...taskRuntimePatchForWorkspace(snapshot.workspaceId, workspace?.batchTaskIds ?? [], nextTasksById),
        runningJobs,
      };
      return {
        batchTasksById: nextTasksById,
        runningJobMeta: {
          ...state.runningJobMeta,
          [jobId]: { workspaceId: snapshot.workspaceId, apiMode: snapshot.apiMode, apiProfileId: snapshot.apiProfileId },
        },
        workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, patch),
        ...(state.activeWorkspaceId === snapshot.workspaceId ? activeRuntimePatch(patch) : {}),
      } as Partial<StudioState>;
    });

    const removeFromRunning = (failed = false) => {
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
          jobsFailed: failed ? runtime.jobsFailed + 1 : runtime.jobsFailed,
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
          const parentId = mode === "edit"
            ? (snapshot.batchProcessLink?.sourcePath || snapshot.sources[0]?.path || snapshot.currentImage?.savedPath)
            : undefined;
          const sourceImages = sourceImagesForHistory(mode, snapshot.sources);
          const panoramaRoundtrip = findPanoramaRoundtripRef(sourceImages) ?? undefined;
          const panoramaProject = panoramaProjectFromEditSources(sourceImages, panoramaRoundtrip);
          const itemID = cryptoIDFallback();
          const fallbackB64 = typeof r.imageB64 === "string" ? r.imageB64 : "";
          const fallbackDims = fallbackB64 ? getImageDimensionsFromBase64(fallbackB64) : null;
          const previewItem: HistoryItem = {
            id: itemID,
            imageId: r.imageId || undefined,
            previewUrl: r.previewUrl || undefined,
            thumbPath: r.thumbPath || undefined,
            width: typeof r.width === "number" ? r.width : fallbackDims?.w,
            height: typeof r.height === "number" ? r.height : fallbackDims?.h,
            previewWidth: typeof r.previewWidth === "number" ? r.previewWidth : undefined,
            previewHeight: typeof r.previewHeight === "number" ? r.previewHeight : undefined,
            imageB64: fallbackB64 || undefined,
            imageBlob: null,
            previewBlob: null,
            previewOnly: true,
            prompt: r.prompt,
            revisedPrompt: r.revisedPrompt,
            mode: r.mode as Mode,
            apiMode: snapshot.apiMode,
            apiProfileId: snapshot.apiProfileId,
            apiProfileName: snapshot.apiProfileName,
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
            panoramaRoundtrip,
            panoramaProject,
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
          const currentItem = totalNow > 1 || snapshot.continuousGenerateTest ? historyItem : activeItem;
          const trimmed = trimHistory([historyItem, ...store.getState().history]);
          store.setState((state) => {
            const workspace = state.workspaces.find((w) => w.id === snapshot.workspaceId);
            const gridWasOpen = state.activeWorkspaceId === snapshot.workspaceId
              ? state.resultGridOpen
              : workspace?.resultGridOpen ?? false;
            const mergedBatch = mergeWorkspaceBatchResult(state, snapshot.workspaceId, historyItem, trimmed);
            const nextGridOpen = snapshot.continuousGenerateTest ? true : gridWasOpen;
            const batchResults = state.activeWorkspaceId === snapshot.workspaceId
              ? mergedBatch.batchResults
              : state.batchResults;
            let batchTasksById = updateTaskFromHistoryItem(
              state.batchTasksById,
              workspace?.batchTaskIds ?? [],
              snapshot.workspaceId,
              historyItem,
            );
            const completedRecord = Object.values(batchTasksById).find((task) => (
              task.workspaceId === snapshot.workspaceId
              && (task.jobId === jobId || task.historyItemId === historyItem.id || task.slotIndex === snapshot.batchIndex)
            ));
            if (completedRecord && snapshot.apiMode === "apimart" && typeof r.apimartTaskId === "string" && r.apimartTaskId.trim()) {
              batchTasksById = {
                ...batchTasksById,
                [completedRecord.id]: {
                  ...completedRecord,
                  apimartTaskId: r.apimartTaskId.trim(),
                },
              };
            }
            return {
              history: trimmed,
              recentDurations: rd,
              batchTasksById,
              workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, {
                currentImageId: historyItem.id,
                historyGallerySinglePreviewId: null,
                batchResultIds: mergedBatch.batchResultIds,
                resultGridOpen: nextGridOpen,
              }),
              ...(state.activeWorkspaceId === snapshot.workspaceId
                ? {
                    currentImage: snapshot.continuousGenerateTest
                      ? currentItem
                      : (nextGridOpen || totalNow <= 1 ? currentItem : state.currentImage),
                    batchResults,
                    historyGallerySinglePreviewId: null,
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
          const autoPastedPanorama = await autoPastePanoramaRoundtripResult(historyItem, {
            workspaceId: snapshot.workspaceId,
            selectAsCurrent: !snapshot.continuousGenerateTest && totalNow <= 1,
          }).catch((error: any) => {
            store.getState().pushToast(`全景贴回失败: ${error?.message ?? error}`, "warn", 4200);
            return null;
          });
          const completedTask = Object.values(store.getState().batchTasksById).find((task) => (
            task.workspaceId === snapshot.workspaceId
            && (task.jobId === jobId || task.historyItemId === historyItem.id || task.slotIndex === snapshot.batchIndex)
          ));
          if (completedTask) clearAutoRetryTimer(completedTask.id);
          hooks?.onSettled?.("success");
          syncBatchOutputAfterSuccess(snapshot.batchProcessLink, historyItem.savedPath);
          if (autoPastedPanorama) {
            store.getState().pushToast("已自动贴回全景图", "success", 3200);
          }
          // 婵犵數濮烽弫鍛婃叏閻戝鈧倹绂掔€ｎ亞顦┑鐘绘涧椤戝啴鍩€椤掆偓閸熸潙鐣烽妸褉鍋撳☉娅亪宕滆ぐ鎺撯拺缂佸瀵у﹢浼存煕閹存繄绉洪柟顔惧仱閹稿﹥绔熷┑鍡欑Ш闁诡喒鍓濋幆鏃堟晲閸℃ê鏋涢梻鍌欒兌缁垳鏁悙闈涘灊妞ゆ牜鍋涚粻鐐烘煏婵炲灝鍓婚柣鏃傤焾缁剁偟绱掔€ｎ偄顕滈柛搴㈡崌濮婄粯鎷呴崨濠傛殘闂佽崵鍠嗛崹钘夌暦?闂傚倸鍊搁崐鎼佸磹閻戣姤鍤勯柛顐ｆ礀绾惧鏌曟繛鐐珔缁炬儳娼￠弻锛勪沪鐠囨彃濮庨梺钘夊暟閸犳牠寮婚妸鈺傚亜闁告繂瀚呴姀銈嗙厽?闂傚倸鍊搁崐鎼佸磹閻戣姤鍤勯柛鎾茬閸ㄦ繃銇勯弽顐粶缂佲偓婢跺绻嗛柕鍫濇噺閸ｅ湱绱掗悩闈涒枅闁哄瞼鍠栭獮鎴﹀箛闂堟稒顔勯梻浣告啞娣囨椽锝炴径鎰﹂柛鏇ㄥ灠閸楄櫕淇婇妶鍌氫壕婵炲瓨绮嶉崕瀹犵亙闂佺粯锕㈠褎绂掑鍛＜缂備焦锚閻忋儲銇勯弴妯哄姦鐎规洜鍠栭、妤呭磼濠婂懏顫岄梻鍌欒兌椤牏鎮锕€纾归柡宥庡幗閸婂灚銇勯幇鍫曟闁?+ 闂傚倸鍊搁崐鎼佸磹閻戣姤鍤勯柛顐ｆ礀绾惧潡鏌ｉ姀銏╃劸闁汇倗鍋撶换婵嬫濞戞碍鍣ユ繝銏ｅ煐閸旀洜绮诲☉銏＄厸濠㈣泛瀛╃涵鑸点亜閺傝儻瀚版い顏勫暣婵″爼宕ㄩ婊庡敹婵犵妲呴崑鍛存偡瑜旈崺鈧い鎺嶈兌椤ｈ尙鈧厜鍋撻柟闂寸閽冪喖鏌曟繛鐐珔缂侇偄绉归弻娑㈠Ψ椤旀儳甯ュ┑鈽嗗亜鐎氭澘顫忓ú顏勫窛濠电姴鍟惌顕€姊洪崨濠庢畷濠电偛锕ら锝嗙節濮橆厼浜滈梺缁樻尭濞寸兘鎮炬ィ鍐┾拺缂備焦锕╁▓鏃堟煟濡や胶鐭婇摶鐐烘煕閺囥劌鐏￠柍?
          if (willNotify) {
            tryNotify("FHL Studio", r.prompt ?? "", () => {
              store.getState().openResultDetail(historyItem);
            });
          }
          store.getState().pushToast(
            totalNow > 1
              ? `已完成 (${completedNow}/${totalNow})，耗时 ${elapsedSec.toFixed(0)}s`
              : `${historyItem.mode === "edit" ? "编辑完成" : "生成完成"}，耗时 ${elapsedSec.toFixed(0)}s`,
            "success",
            6000,
            { label: "Open", onClick: () => store.getState().openResultDetail(historyItem) },
          );
          // 濠电姷鏁告慨鐑姐€傞挊澹╋綁宕ㄩ弶鎴狅紱闂佽宕樺▔娑氭閵堝憘鏃堟晲閸涱厽娈查梺绋款儏椤戝棙绌辨繝鍥ч柛娑卞枛椤庢盯姊烘潪鎵槮闁哥噥鍋婇崺鐐哄箣閿曗偓绾惧吋绻濇繝鍌涙崳闁告柨鎽滅槐鎾存媴閸濆嫷鈧挾绱撳鍕獢鐎殿喖顭烽幃銏ゅ礂閼测晛濮洪梻浣瑰濞插秹宕戦幘鎰佺唵鐟滄粓宕板Δ鍛﹂柛鏇ㄥ灱閺佸啴鏌曢崼婵囧櫝闁哄鎳樺娲传閸曨厾鍔圭紓鍌氱С閻掞箓骞堥妸鈺佺劦妞ゆ帒瀚悡蹇涚叓閸ャ劍绀€閺嶏繝姊虹拠鍙夊攭妞ゆ泦鍥х厴?闂?闂傚倸鍊峰ù鍥敋瑜嶉湁闁绘垼妫勭壕濠氭煥濠靛棭妲哥痪鎯х秺閺屸€愁吋鎼粹€崇缂佺偓鍎冲锟犲蓟閵堝悿鍦偓锝庡亝閻濇洟鎮?2s 闂?GitHub Star 闂傚倸鍊峰ù鍥敋瑜忛埀顒佺▓閺呯娀銆佸▎鎾冲唨妞ゆ挾鍋熼悰銉モ攽鎺抽崐鎰板磻閹剧粯鍋傞柕鍫濐槹閻撴稓鈧箍鍎辨绋款嚕妤ｅ啯鐓涘ù锝呭閸庢梹鎱ㄦ繝鍐┿仢妞ゃ垺顨婇崺鈧い鎺戝€婚惌鎾剁棯閹屽剳缂佺姾濮ょ换婵嬫偨闂堟稑澹嬬紓浣藉蔼濡嫮鍙呴梺闈浥堥弬鍌炲焵椤掆偓閸熶即鍩€椤掑喚娼愰柛娆樻苟Storage 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偞鐗犻、鏇㈠Χ閸モ晝鍘犻梻浣告惈椤︿即宕靛顑炴椽顢旈崟骞洦鐓曢柕澶涚到婵″ジ骞栭弶鎴含婵﹥妞藉畷顐﹀礋椤愶絾鐤侀梻浣侯焾椤戝棝骞愰崜褎顫曢柟鐑樻煛閸嬫捇鏁愭惔婵囧枤濠碘槅鍨崑鎾绘⒒娴ｈ櫣銆婇柡鍌欑窔瀹曟垿骞橀幇浣瑰瘜闂侀潧鐗嗗Λ妤冪箔閹烘鍊垫慨妯煎帶婢т即鏌?
          // 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偛顦甸弫鎾绘偐閼碱剦妲烽梻浣告惈缁嬩線宕㈡禒瀣；闁跨喓濮甸悡蹇擃熆鐠虹儤顥炴繛鍛嚇閺岋綁顢橀悤浣圭杹闂佸搫鏈惄顖炲春閸曨垰绀冩い蹇撴噹濞呭繘姊绘担铏瑰笡閻㈩垱甯￠弫鍐敂閸繆鎽曞┑鐐村灦椤倿寮崼婵堫槰闂侀潧顭堥崐妤呭箲閺囥垺鈷掑ù锝呮啞閹牓鏌熼崘鑼闁诡喚鍏樻俊鐑藉煛娴ｅ搫寮ㄥ┑鐘灱閸╂牠宕濋弴鐘靛暗鐎广儱顦伴悡鏇㈡倶閻愭彃鈷旀い锝嗙叀閺岋絾鎯旈妶鍡╀哗缂備浇椴搁幐濠氬箯閸涱垱瀚氶柍鈺佸暟閺嗐儲淇婇悙顏勨偓褏鈧潧鐭傚畷褰掑醇閺囨ǚ鍋?闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偞鐗犻、鏇㈡晝閳ь剟鎮块鈧弻锝呂旈埀顒勬偋婵犲洤鐭楅煫鍥ㄦ嫻閺冨牊鏅查柛娑卞幗閻忔捇姊烘潪鎵槮闁挎洦浜濠氭偄閸涘﹦绉舵俊銈忕到閸燁垶顢撳澶嬧拺缂佸顑欓崕宥夋煕閺冣偓閸ㄥ灝顕ｆ繝姘嵆闁绘棁娅ｉ惁鍫ユ椤愩垺澶勬繛鍙夌矒瀵娊鎮╃紒妯锋嫼缂傚倷鐒﹁摫閻忓繒澧楃换娑㈡嚑椤掆偓閺嬫稓鈧?star 闂傚倸鍊搁崐椋庣矆娓氣偓楠炴牠顢曚綅閸ヮ剦鏁冮柨鏇楀亾闁汇倗鍋撶换婵囩節閸屾侗妫￠梺鐟板暱閺堫剛鎹㈠┑鍫濇瀳婵☆垰鍢叉禍楣冩煕閹邦垰鐨哄Δ鐘叉喘濮婅櫣鎷犻垾铏亪闂佺锕ラ幃鍌炲箖閹呮殝闁归攱姊瑰Λ鍐ㄧ暦閵娾晩鏁囬柣娆屽亾闁哥偞鎸冲缁樻媴缁嬫寧鍊繛瀛樼矆缁瑥鐣烽弴銏″殥闁靛牆妫?闂傚倸鍊搁崐鎼佸磹妞嬪孩顐芥慨姗嗗墻閻掔晫鎲稿鍫罕婵犲痉鏉库偓鏇㈠箠鎼达絽顥氶柛锔诲幘绾惧ジ鎮楅敐搴濈敖婵ǜ鍔戦弻锛勨偓锝庝邯閸欏嫰鏌＄仦鐐缂佺姵绋掔换婵嬪磼濮橈絾瀚熸繝鐢靛仜閻°劑宕垫惔銊ョ９婵犻潧顑呴拑鐔兼煥濠靛棭妲告俊顐ｏ耿閺岀喓绮欓崸妤娾偓妤呮煛閸℃澧㈢紒杈ㄥ笒铻栧ù锝呮憸娴犲摜绱撴担铏瑰笡闁烩晩鍨堕悰顔锯偓锝庡枟閸婄兘鏌℃径瀣仼闁挎稑顦扮换婵堝枈濡搫鈷夐梺闈涙处缁挸鐣峰┑鍥ㄥ劅闁靛绠戝▓鐔兼⒒娓氬洤澧紒澶屾暬瀵煡顢楅崟顒傚幈闂佸搫娲㈤崝灞炬櫠椤斿浜滈幖娣灮濞插瓨鎱ㄦ繝鍐┿仢鐎规洘锕㈠畷锝嗗緞鐎ｎ亜澹嶉梻鍌欑閹芥粓宕抽妷鈺佸瀭閻犺桨璀﹂崵鏇㈡倵閸︻厼啸闁汇倐鍋撴繝鐢靛仦閸ㄥ爼鎮疯瀹曘垽鎮介崨濞炬嫼闂佸憡绻傜€氬嘲危瑜版帗鐓曢柕濞炬櫆濞懷囧础閸楃偐鏀介柣妯虹－椤ｆ煡鏌ｉ幘瀛樼濞ｅ洤锕、娑樷攽閸℃鍎繝鐢靛仜瀵爼骞愰幎钘夎摕?
          // 闂傚倸鍊搁崐鎼佸磹妞嬪海鐭嗗〒姘ｅ亾妤犵偛顦甸弫宥夊礋椤掍焦顔囨繝寰锋澘鈧劙宕戦幘娣簻妞ゆ挾鍋熸禒銏ゆ懚閿濆應鏀?闂傚倸鍊搁崐鎼佸磹閻戣姤鍤勯柛鎾茬閸ㄦ繃銇勯弽銊х煁闁哄棙绮撻弻锝夊棘鐠恒劍顔堥梺鍝勵儐閻楁鎹㈠☉銏犵婵炲棗绻掓禒鑲╃磽娴ｅ搫校闁绘顨嗙粚杈ㄧ節閸ヮ灛褔鏌涘☉鍗炴灈婵炲拑绲跨槐鎾存媴閹绘帊澹曢梻浣告啞閸旓附绂嶉弽顓炵；闁规崘宕靛畵渚€鏌涢…鎴濇灈濠殿喖閰ｅ铏圭磼濮楀棙鐣风紓渚囧枛閻倿鍨鹃敃鍌氱倞妞ゆ巻鍋撶紒鈧崼婢濆綊鏁愰崼鐕佷哗闂佹寧绋掔划鎾愁潖濞差亝鐒婚柣鎰蔼鐎氭澘顭胯閹告娊寮婚悢鍏兼優妞ゆ劑鍊楅悿鍕旈悩闈涗粶缂佸缍婇妴浣糕枎閹惧磭鐣鹃悷婊冪Ф缁厼鐣濋崟顑芥嫽闂佺鏈悷銊╁礂瀹€鍕厵闁惧浚鍋呭畷宀勬煙椤旂煫顏堬綖濠靛牊宕夐柧蹇氼嚃閸炲墎绱撻崒姘偓鐑芥倿閿曞倵鈧箓宕堕浣镐户闂佸壊鍋呭ú姗€鎮￠弴鐔翠簻闁归偊鍠栧瓭闂佸憡姊圭喊宥咁焽?
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
          } catch { /* localStorage 濠电姷鏁告慨鐑藉极閹间礁纾婚柣鎰惈閸ㄥ倿鏌涢锝嗙缂佺姳鍗抽弻娑樷攽閸曨偄濮㈤梺娲诲幗閹搁箖鎯€椤忓牆绠氱憸婊堝磿瀹ュ悿鐟邦煥閸愵亞楔闂佸搫鐭夌槐鏇熺閿旂偓瀚氶柟缁樺笒椤岸姊?闂?闂傚倸鍊搁崐鎼佸磹閹间礁纾归柟闂寸绾惧綊鏌熼梻瀵稿妽闁稿顑呴埞鎴︽偐閸欏顦╅梺绋款儜缁绘繈寮诲澶婁紶闁告洦鍋呭▓顓㈡⒑閹肩偛濡界紒璇插暣婵＄敻宕熼姘敤闂侀潧臎閸涱垰甯掗梺璇叉唉椤煤閺嶎厔鍥偨缁嬭法鐣哄┑掳鍊曢幊搴ㄥ箲閼哥偣浜滈柟鎹愭硾閳ь剦鍋婃俊鐤槾缁?*/ }
        } catch (err: any) {
          const patch: WorkspacePatch = {
            errorMessage: `保存生成结果失败：${err?.message ?? err}`,
            errorRawPath: null,
          };
          store.setState((state) => ({
            workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, patch),
            ...(state.activeWorkspaceId === snapshot.workspaceId ? activeRuntimePatch(patch) : {}),
          } as Partial<StudioState>));
          removeFromRunning();
          hooks?.onSettled?.("error");
        }
      })();
    });
    offError = EventsOn(`error:${jobId}`, (e: { message: string; rawPath?: string; apimartTaskId?: string }) => {
      cleanup();
      store.setState((state) => {
        const runtime = workspaceRuntimeFromState(state, snapshot.workspaceId);
        const prunedPreview = removeStreamPreview(runtime.streamPreviews, jobId);
        const workspace = state.workspaces.find((w) => w.id === snapshot.workspaceId);
        const slotTask = findTaskForSlot(workspace?.batchTaskIds ?? [], state.batchTasksById, snapshot.workspaceId, snapshot.batchIndex);
        const batchTasksById = slotTask?.status === "cancelled"
          ? state.batchTasksById
          : updateTaskForSlot(
              state.batchTasksById,
              workspace?.batchTaskIds ?? [],
              snapshot.workspaceId,
              snapshot.batchIndex,
              {
                status: "failed",
                jobId,
                errorMessage: e?.message ?? "Failed to save history item",
                lastLogLine: runtime.lastLogLine || undefined,
                rawPath: (typeof e?.rawPath === "string" && e.rawPath) ? e.rawPath : undefined,
                apimartTaskId: typeof e?.apimartTaskId === "string" && e.apimartTaskId.trim() ? e.apimartTaskId.trim() : undefined,
              },
            );
        const patch: WorkspacePatch = {
          errorMessage: e?.message ?? "Failed to save history item",
          errorRawPath: (typeof e?.rawPath === "string" && e.rawPath) ? e.rawPath : null,
          streamPreview: prunedPreview.streamPreview,
          streamPreviews: prunedPreview.streamPreviews,
        };
        return {
          batchTasksById,
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
      removeFromRunning(true);
      const failedTask = Object.values(store.getState().batchTasksById).find((task) => (
        task.workspaceId === snapshot.workspaceId
        && (task.jobId === jobId || task.slotIndex === snapshot.batchIndex)
      ));
      if (failedTask) scheduleAutoRetryForTask(failedTask, e?.message ?? failedTask.errorMessage);
      hooks?.onSettled?.("error");
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
    const message = `提交失败:${e?.message ?? e}`;
    const patch: WorkspacePatch = {
      errorMessage: message,
      errorRawPath: null,
    };
    store.setState((state) => {
      const runtime = workspaceRuntimeFromState(state, snapshot.workspaceId);
      const nextMeta = { ...state.runningJobMeta };
      delete nextMeta[jobId];
      const remaining = runtime.runningJobs.filter((id) => id !== jobId);
      const prunedPreview = removeStreamPreview(runtime.streamPreviews, jobId);
      const workspace = state.workspaces.find((w) => w.id === snapshot.workspaceId);
      const batchTasksById = updateTaskForSlot(
        state.batchTasksById,
        workspace?.batchTaskIds ?? [],
        snapshot.workspaceId,
        snapshot.batchIndex,
        {
          status: "failed",
          jobId,
          errorMessage: message,
          lastLogLine: runtime.lastLogLine || message,
        },
      );
      const nextPatch: WorkspacePatch = {
        ...patch,
        runningJobs: remaining,
        jobsTotal: runtime.jobsTotal,
        jobsCompleted: runtime.jobsCompleted + 1,
        jobsFailed: runtime.jobsFailed + 1,
        progress: remaining.length === 0 ? null : runtime.progress,
        streamPreview: remaining.length === 0 ? null : prunedPreview.streamPreview,
        streamPreviews: remaining.length === 0 ? {} : prunedPreview.streamPreviews,
        lastLogLine: remaining.length === 0 ? "" : runtime.lastLogLine,
      };
      return {
        runningJobMeta: nextMeta,
        batchTasksById,
        workspaces: patchWorkspaceRuntime(state.workspaces, snapshot.workspaceId, nextPatch),
        ...(state.activeWorkspaceId === snapshot.workspaceId ? activeRuntimePatch(nextPatch) : {}),
      } as Partial<StudioState>;
    });
    const failedTask = Object.values(store.getState().batchTasksById).find((task) => (
      task.workspaceId === snapshot.workspaceId
      && (task.jobId === jobId || task.slotIndex === snapshot.batchIndex)
    ));
    if (failedTask) scheduleAutoRetryForTask(failedTask, message);
    hooks?.onSettled?.("error");
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
    || state.promptPrefix !== prevState.promptPrefix
    || state.prompt !== prevState.prompt
    || state.optimizationGuidance !== prevState.optimizationGuidance
    || state.negativePrompt !== prevState.negativePrompt
    || state.mode !== prevState.mode
    || state.size !== prevState.size
    || state.quality !== prevState.quality
    || state.outputFormat !== prevState.outputFormat
    || state.seed !== prevState.seed
    || state.batchCount !== prevState.batchCount
    || state.continuousGenerateTest !== prevState.continuousGenerateTest
    || state.editSourceMode !== prevState.editSourceMode
    || state.batchProcess !== prevState.batchProcess
    || state.styleTag !== prevState.styleTag
    || state.sources !== prevState.sources
    || state.currentImage !== prevState.currentImage
    || state.batchResults !== prevState.batchResults
    || state.batchTasksById !== prevState.batchTasksById
    || state.resultGridOpen !== prevState.resultGridOpen
    || state.historyGallerySinglePreviewId !== prevState.historyGallerySinglePreviewId
    || state.runningJobs !== prevState.runningJobs
    || state.jobsTotal !== prevState.jobsTotal
    || state.jobsCompleted !== prevState.jobsCompleted
    || state.jobsFailed !== prevState.jobsFailed
    || state.progress !== prevState.progress
    || state.streamPreview !== prevState.streamPreview
    || state.streamPreviews !== prevState.streamPreviews
    || state.lastLogLine !== prevState.lastLogLine
    || state.errorMessage !== prevState.errorMessage
    || state.errorRawPath !== prevState.errorRawPath;
  if (!workspaceSessionChanged) return;
  persistWorkspaceSessionFromState(state);
});







