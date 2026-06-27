import type { BatchTaskRecord, HistoryItem, SourceImage } from "../types/domain.ts";
import type { StudioState } from "./studioStore.types.ts";
import { sourceImagesFromHistoryItem, sourceImagesFromPaths } from "./historySourceImages.ts";
import { patchWorkspaceRuntime } from "./workspaceRuntime.ts";

type SourceContextPatch = Pick<StudioState, "selectedBatchTaskId" | "workspaces"> & Partial<Pick<StudioState, "sources" | "mode" | "editSourceMode">>;

function buildSourceContextPatch(
  state: StudioState,
  sources: SourceImage[],
  selectedBatchTaskId: string | null,
): SourceContextPatch {
  const workspacePatch: Parameters<typeof patchWorkspaceRuntime>[2] = {
    selectedBatchTaskId,
  };
  const patch: SourceContextPatch = {
    selectedBatchTaskId,
    workspaces: state.workspaces,
  };
  if (sources.length > 0) {
    workspacePatch.sources = sources;
    workspacePatch.mode = "edit";
    workspacePatch.editSourceMode = "manual";
    patch.sources = sources;
    patch.mode = "edit";
    patch.editSourceMode = "manual";
  }
  patch.workspaces = patchWorkspaceRuntime(state.workspaces, state.activeWorkspaceId, workspacePatch);
  return patch;
}

export function sourceContextPatchFromHistoryItem(
  state: StudioState,
  item: HistoryItem,
  selectedBatchTaskId: string | null = null,
): SourceContextPatch {
  const sources = item.mode === "edit" ? sourceImagesFromHistoryItem(item) : [];
  return buildSourceContextPatch(state, sources, selectedBatchTaskId);
}

export function sourceContextPatchFromBatchTask(
  state: StudioState,
  task: BatchTaskRecord,
  selectedBatchTaskId: string | null = task.id,
): SourceContextPatch {
  const activeWorkspace = state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId);
  if (activeWorkspace?.mode === "edit" && activeWorkspace.editSourceMode === "batch") {
    return buildSourceContextPatch(state, [], selectedBatchTaskId);
  }
  const sources = task.mode === "edit"
    ? ((task.sourceImages?.length ?? 0) > 0 ? task.sourceImages! : sourceImagesFromPaths(task.sourceImagePaths))
    : [];
  return buildSourceContextPatch(state, sources, selectedBatchTaskId);
}
