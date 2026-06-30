import { GetAutomationStatus } from "../../platform/runtime/host";
import type { AutomationStatusLike } from "../../platform/runtime/hostTypes";
import { useStudioStore } from "../../state/studioStore";
import type { HistoryItem, SourceImage, Toast } from "../../types/domain";

type E2EWindow = Window & {
  __IMAGE_STUDIO_E2E_BOOTSTRAP?: AutomationStatusLike;
  __imageStudioE2E?: ImageStudioE2EHarness;
};

const e2eMessageSource = "image-studio-e2e";
const e2eStatusMarkerId = "image-studio-e2e-status";
let activeHarness: ImageStudioE2EHarness | null = null;
let commandBridgeInstalled = false;

type ImageSummary = {
  id?: string;
  mode?: string;
  prompt?: string;
  size?: string;
  savedPath?: string;
  imageId?: string;
  previewUrl?: string;
  fullUrl?: string;
  width?: number;
  height?: number;
  sourceImages?: SourceSummary[];
  panoramaRoundtrip?: boolean;
};

type SourceSummary = {
  path?: string;
  name?: string;
  previewUrl?: string;
  width?: number;
  height?: number;
  panoramaRoundtrip?: boolean;
};

type StateSummary = {
  version: string;
  mode: string;
  size: string;
  quality: string;
  outputFormat: string;
  apiMode: string;
  requestPolicy: string;
  activeProfileId: string;
  activeWorkspaceId: string;
  resultGridOpen: boolean;
  historyGalleryOpen: boolean;
  settingsOpen: boolean;
  upstreamModalOpen: boolean;
  resultDetailOpen: boolean;
  panoramaViewerOpen: boolean;
  panoramaAlignOpen: boolean;
  runningJobs: string[];
  jobsTotal: number;
  jobsCompleted: number;
  jobsFailed: number;
  errorMessage: string | null;
  currentImage: ImageSummary | null;
  sourcePreviewReturnImage: ImageSummary | null;
  batchResults: ImageSummary[];
  sources: SourceSummary[];
  historyCount: number;
  toasts: Array<Pick<Toast, "text" | "kind">>;
};

type ImageStudioE2EHarness = {
  version: string;
  status: AutomationStatusLike;
  getStateSummary: () => StateSummary;
  waitForIdle: (timeoutMs?: number) => Promise<StateSummary>;
  setPrompt: (value: string) => void;
  setSize: (value: string) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openResultGrid: () => void;
  closeResultGrid: () => void;
};

const packageVersion = String(import.meta.env.PACKAGE_VERSION || "");

type E2ECommandRequest = {
  source?: string;
  direction?: "request";
  id?: string;
  command?: string;
  args?: unknown[];
};

type E2ECommandResponse = {
  source: string;
  direction: "response";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

const commandHandlers: Record<string, (harness: ImageStudioE2EHarness, args: unknown[]) => unknown> = {
  getStateSummary: (harness) => harness.getStateSummary(),
  waitForIdle: (harness, args) => harness.waitForIdle(Number(args[0]) || undefined),
  setPrompt: (harness, args) => harness.setPrompt(String(args[0] ?? "")),
  setSize: (harness, args) => harness.setSize(String(args[0] ?? "")),
  openSettings: (harness) => harness.openSettings(),
  closeSettings: (harness) => harness.closeSettings(),
  openResultGrid: (harness) => harness.openResultGrid(),
  closeResultGrid: (harness) => harness.closeResultGrid(),
};

function summarizeSource(source: SourceImage): SourceSummary {
  return {
    path: source.path,
    name: source.name,
    previewUrl: source.previewUrl,
    width: source.width,
    height: source.height,
    panoramaRoundtrip: !!source.panoramaRoundtrip,
  };
}

function summarizeImage(item: HistoryItem | null): ImageSummary | null {
  if (!item) return null;
  return {
    id: item.id,
    mode: item.mode,
    prompt: item.prompt,
    size: item.size,
    savedPath: item.savedPath,
    imageId: item.imageId,
    previewUrl: item.previewUrl,
    fullUrl: item.fullUrl,
    width: item.width,
    height: item.height,
    sourceImages: item.sourceImages?.map(summarizeSource),
    panoramaRoundtrip: !!item.panoramaRoundtrip,
  };
}

function getStateSummary(): StateSummary {
  const state = useStudioStore.getState();
  return {
    version: packageVersion,
    mode: state.mode,
    size: state.size,
    quality: state.quality,
    outputFormat: state.outputFormat,
    apiMode: state.apiMode,
    requestPolicy: state.requestPolicy,
    activeProfileId: state.activeProfileId,
    activeWorkspaceId: state.activeWorkspaceId,
    resultGridOpen: state.resultGridOpen,
    historyGalleryOpen: state.historyGalleryOpen,
    settingsOpen: state.settingsOpen,
    upstreamModalOpen: state.upstreamModalOpen,
    resultDetailOpen: !!state.resultDetail,
    panoramaViewerOpen: !!state.panoramaViewerItem,
    panoramaAlignOpen: !!state.panoramaAlignTarget,
    runningJobs: [...state.runningJobs],
    jobsTotal: state.jobsTotal,
    jobsCompleted: state.jobsCompleted,
    jobsFailed: state.jobsFailed,
    errorMessage: state.errorMessage,
    currentImage: summarizeImage(state.currentImage),
    sourcePreviewReturnImage: summarizeImage(state.sourcePreviewReturnImage),
    batchResults: state.batchResults.map((item) => summarizeImage(item)).filter(Boolean) as ImageSummary[],
    sources: state.sources.map(summarizeSource),
    historyCount: state.history.length,
    toasts: state.toasts.slice(-5).map((toast) => ({ text: toast.text, kind: toast.kind })),
  };
}

function localFlagEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("e2e") === "1" || url.searchParams.has("codex-e2e")) return true;
    return localStorage.getItem("gptcodex.e2e") === "1";
  } catch {
    return false;
  }
}

function installHarness(status: AutomationStatusLike) {
  const harness: ImageStudioE2EHarness = {
    version: packageVersion,
    status,
    getStateSummary,
    waitForIdle: (timeoutMs = 30_000) => new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        const summary = getStateSummary();
        if (summary.runningJobs.length === 0) {
          resolve(summary);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          reject(new Error("Timed out waiting for Image Studio to become idle"));
          return;
        }
        window.setTimeout(tick, 200);
      };
      tick();
    }),
    setPrompt: (value: string) => {
      useStudioStore.getState().setField("prompt", String(value));
    },
    setSize: (value: string) => {
      useStudioStore.getState().setField("size", String(value) as any);
    },
    openSettings: () => useStudioStore.getState().openSettings(),
    closeSettings: () => useStudioStore.getState().closeSettings(),
    openResultGrid: () => useStudioStore.getState().openResultGrid(),
    closeResultGrid: () => useStudioStore.getState().closeResultGrid(),
  };
  activeHarness = harness;
  (window as E2EWindow).__imageStudioE2E = harness;
  installCommandBridge();
  publishDOMReadyStatus(status);
  document.documentElement.dataset.e2e = "true";
  document.documentElement.dataset.e2eHarness = "ready";
  document.documentElement.dataset.e2eServer = status.serverUrl || "";
}

function publishDOMReadyStatus(status: AutomationStatusLike) {
  if (typeof document === "undefined") return;
  const payload = {
    ready: true,
    version: packageVersion,
    packageVersion: status.packageVersion || packageVersion,
    serverUrl: status.serverUrl || "",
    commandBridge: "postMessage",
  };
  let marker = document.getElementById(e2eStatusMarkerId) as HTMLMetaElement | null;
  if (!marker) {
    marker = document.createElement("meta");
    marker.id = e2eStatusMarkerId;
    marker.name = "image-studio-e2e-status";
    document.head.appendChild(marker);
  }
  marker.content = JSON.stringify(payload);
}

function installCommandBridge() {
  if (commandBridgeInstalled || typeof window === "undefined") return;
  commandBridgeInstalled = true;
  window.addEventListener("message", async (event) => {
    const message = event.data as E2ECommandRequest | undefined;
    if (!message || message.source !== e2eMessageSource || message.direction !== "request") return;
    const id = String(message.id || "");
    const response: E2ECommandResponse = {
      source: e2eMessageSource,
      direction: "response",
      id,
      ok: false,
    };
    try {
      if (!activeHarness) throw new Error("Image Studio E2E harness is not ready");
      const handler = commandHandlers[String(message.command || "")];
      if (!handler) throw new Error(`Unsupported Image Studio E2E command: ${message.command || ""}`);
      response.result = await handler(activeHarness, Array.isArray(message.args) ? message.args : []);
      response.ok = true;
    } catch (error) {
      response.error = error instanceof Error ? error.message : String(error);
    }
    const targetOrigin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "*";
    window.postMessage(response, targetOrigin);
  });
  document.documentElement.dataset.e2eCommandBridge = "ready";
}

export async function installE2EHarness() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const bootstrapStatus = (window as E2EWindow).__IMAGE_STUDIO_E2E_BOOTSTRAP;
  let status = bootstrapStatus ?? { enabled: false };
  if (!status.enabled) {
    status = await GetAutomationStatus().catch(() => ({ enabled: false }));
  }
  if (!status.enabled && !localFlagEnabled()) return;
  installHarness({
    ...status,
    enabled: true,
    packageVersion: status.packageVersion || packageVersion,
  });
}
