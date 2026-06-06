import type { backend } from "../../wailsjs/go/models";
import type {
  Annotation,
  APIMode,
  HistoryItem,
  JobGroupSnapshot,
  KernelRuntimeMode,
  Mode,
  OutputFormatValue,
  Preset,
  ProgressInfo,
  ProxyMode,
  QualityValue,
  RequestPolicy,
  SizeValue,
  SourceImage,
  StreamPreview,
  StreamPreviewMap,
  ThemeMode,
  Toast,
  UpstreamProfile,
  Workspace,
} from "../types/domain";
import type { RunningJobMeta } from "./workspaceRuntime";

export interface ModeConfig {
  baseURL: string;
  apiKey: string;
  textModelID: string;
  imageModelID: string;
  concurrencyLimit: number;
}

export interface PromptOptimizeRequest {
  apiKey: string;
  prompt: string;
  mode: Mode;
  baseURL: string;
  textModelID: string;
  proxyMode: ProxyMode;
  proxyURL: string;
  imagePaths: string[];
  imagePath: string;
}

export interface Stroke {
  points: number[];
  size: number;
  erase?: boolean;
}

export interface UndoEntry {
  label: string;
  undo: (s: StudioState) => Partial<StudioState>;
  redo: (s: StudioState) => Partial<StudioState>;
}

export interface StudioState {
  apiKey: string;
  mode: Mode;
  prompt: string;
  negativePrompt: string;
  size: SizeValue;
  quality: QualityValue;
  outputFormat: OutputFormatValue;
  seed: number;
  kernelRuntimeMode: KernelRuntimeMode;
  baseURL: string;
  textModelID: string;
  proxyMode: ProxyMode;
  proxyURL: string;
  imageModelID: string;
  apiMode: APIMode;
  requestPolicy: RequestPolicy;
  imagesNewAPICompat: boolean;
  noPromptRevision: boolean;
  profiles: UpstreamProfile[];
  activeProfileId: string;
  sources: SourceImage[];
  runningJobs: string[];
  jobsTotal: number;
  jobsCompleted: number;
  progress: ProgressInfo | null;
  streamPreview: StreamPreview | null;
  streamPreviews: StreamPreviewMap;
  lastLogLine: string;
  errorMessage: string | null;
  errorRawPath: string | null;
  isRunning: boolean;
  lastPayload: backend.GenerateOptions | null;
  runningJobMeta: Record<string, RunningJobMeta>;
  jobGroupsByWorkspace: Record<string, JobGroupSnapshot[]>;
  currentImage: HistoryItem | null;
  history: HistoryItem[];
  historyHasMore: boolean;
  historyLoading: boolean;
  historyCursorBeforeDayStart: number | null;
  batchResults: HistoryItem[];
  resultGridOpen: boolean;
  historyRailCollapsed: boolean;
  historyTimelineOpen: boolean;
  tool: "pan" | "mask" | "annotate";
  brushSize: number;
  brushMode: "paint" | "erase";
  annotationKind: "rect" | "arrow" | "freehand" | "text";
  annotationColor: string;
  selectedAnnotationId: string | null;
  maskDataURL: string | null;
  strokes: Stroke[];
  annotations: Annotation[];
  compareB: HistoryItem | null;
  compareSplit: number;
  toasts: Toast[];
  recentDurations: number[];
  viewZoom: number;
  canvasViewResetTick: number;
  fullscreen: boolean;
  promptHistory: string[];
  batchCount: number;
  presets: Preset[];
  theme: ThemeMode;
  fontScale: number;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  styleTag: string;
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  setField: <K extends keyof StudioState>(key: K, value: StudioState[K]) => void;
  setFullscreen: (value: boolean) => Promise<void>;
  toggleFullscreen: () => Promise<void>;
  setAPIKey: (v: string) => Promise<void>;
  clearError: () => void;
  createProfile: (input: {
    name?: string;
    apiMode: APIMode;
    baseURL?: string;
    requestPolicy?: RequestPolicy;
    textModelID?: string;
    imageModelID?: string;
    concurrencyLimit?: number;
    imagesNewAPICompat?: boolean;
    apiKey?: string;
    setActive?: boolean;
  }) => Promise<string>;
  updateProfile: (id: string, patch: Partial<Omit<UpstreamProfile, "id" | "createdAt">> & { apiKey?: string }) => Promise<boolean>;
  deleteProfile: (id: string) => Promise<void>;
  duplicateProfile: (id: string) => Promise<string | null>;
  setActiveProfile: (id: string) => Promise<void>;
  selectSourceImage: () => Promise<void>;
  removeSource: (index: number) => void;
  clearSources: () => void;
  reorderSources: (from: number, to: number) => void;
  submit: () => Promise<void>;
  cancel: () => Promise<void>;
  reuseAsSource: (item: HistoryItem) => Promise<void>;
  applyHistoryParams: (item: HistoryItem) => void;
  regenerateFromHistory: (item: HistoryItem) => Promise<void>;
  deleteHistoryItem: (id: string) => Promise<void>;
  saveCurrentImageAs: () => Promise<void>;
  saveHistoryItemAs: (item: HistoryItem) => Promise<void>;
  shareCurrentImage: () => Promise<void>;
  shareHistoryItem: (item: HistoryItem) => Promise<void>;
  bootstrap: () => Promise<void>;
  setMaskDataURL: (v: string | null) => void;
  pushStroke: (s: Stroke) => void;
  resetMask: () => void;
  addAnnotation: (a: Annotation) => void;
  removeAnnotation: (id: string) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  clearAnnotations: () => void;
  undo: () => void;
  redo: () => void;
  setCompareB: (item: HistoryItem | null) => void;
  setCompareSplit: (v: number) => void;
  openResultGrid: () => void;
  closeResultGrid: () => void;
  selectBatchResult: (item: HistoryItem) => Promise<void>;
  importImageFile: (file: File) => Promise<void>;
  pushToast: (text: string, kind?: Toast["kind"], ttl?: number, action?: Toast["action"]) => void;
  dismissToast: (id: string) => void;
  resultDetail: HistoryItem | null;
  openResultDetail: (item: HistoryItem) => Promise<void>;
  closeResultDetail: () => void;
  materializeCurrentImage: (item: HistoryItem) => Promise<HistoryItem>;
  loadMoreHistory: () => Promise<void>;
  retryLast: () => Promise<void>;
  setHistoryRailCollapsed: (collapsed: boolean) => void;
  openHistoryTimeline: () => void;
  closeHistoryTimeline: () => void;
  pruneHistoryOlderThanDays: (days: number) => Promise<number>;
  savePreset: (name: string) => void;
  applyPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  exportHistory: () => Promise<void>;
  importHistory: () => Promise<void>;
  setTheme: (t: ThemeMode) => void;
  setFontScale: (v: number) => void;
  setProxyConfig: (mode: ProxyMode, url?: string) => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  testAPIKey: () => Promise<void>;
  isTestingKey: boolean;
  isOptimizingPrompt: boolean;
  optimizePrompt: () => Promise<void>;
  upstreamModalOpen: boolean;
  upstreamReturnTarget: "app" | "settings";
  openUpstreamConfig: (returnTarget?: "app" | "settings") => void;
  closeUpstreamConfig: () => void;
  starPromptOpen: boolean;
  starPromptSource: "auto" | "manual";
  openStarPrompt: () => void;
  dismissStarPrompt: () => void;
  newWorkspace: (name?: string) => void;
  switchWorkspace: (id: string) => void;
  closeWorkspace: (id: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  rotateCurrent: (degrees: number) => Promise<void>;
  flipCurrent: (horizontal: boolean) => Promise<void>;
  cropToRect: (x: number, y: number, w: number, h: number) => Promise<void>;
}
