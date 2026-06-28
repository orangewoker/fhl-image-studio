import type { APIMartRecoveryTask, HistoryItem, JobGroupSnapshot, JobSlotSnapshot } from "../../types/domain";
import { historyPreviewSrc, useBlobURL } from "../../lib/images";
import { pixelSizeLabel } from "../history/historyLabels";

export type BatchGridSlot =
  | { type: "result"; item: HistoryItem; apiLabel?: string }
  | { type: "preview"; item: HistoryItem; apiLabel?: string }
  | { type: "failed"; id: string; apiLabel?: string; recoveryTask?: APIMartRecoveryTask; jobGroup?: JobGroupSnapshot; jobSlot?: JobSlotSnapshot }
  | { type: "pending"; id: string; apiLabel?: string; jobGroup?: JobGroupSnapshot; jobSlot?: JobSlotSnapshot };

export function BatchResultGrid({
  items,
  slots,
  currentId,
  onSelect,
  onClose,
  showClose = true,
  title,
  apiLabel,
  onApplyJobSlotParams,
  onRegenerateJobSlot,
  onQueryAPIMartTask,
}: {
  items: HistoryItem[];
  slots?: BatchGridSlot[];
  currentId: string | null;
  onSelect: (item: HistoryItem) => void | Promise<void>;
  onClose: () => void;
  showClose?: boolean;
  title?: string;
  apiLabel?: string;
  onApplyJobSlotParams?: (group: JobGroupSnapshot, slot: JobSlotSnapshot) => void;
  onRegenerateJobSlot?: (group: JobGroupSnapshot, slot: JobSlotSnapshot) => void | Promise<void>;
  onQueryAPIMartTask?: (taskId: string) => void | Promise<void>;
}) {
  const gridSlots = slots ?? items.map((item) => ({ type: "result", item }) satisfies BatchGridSlot);
  const columns = gridSlots.length <= 2 ? 2 : gridSlots.length <= 4 ? 2 : 3;
  return (
    <div className="batch-grid-overlay">
      <div className="batch-grid-head">
        <span className="batch-grid-title">{title ?? `本批结果 · ${items.length} 张`}</span>
        {showClose ? (
          <button type="button" className="batch-grid-close" onClick={onClose} title="返回当前图">
            返回当前图
          </button>
        ) : null}
      </div>
      <div
        className="batch-grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {gridSlots.map((slot, index) => {
          const slotApiLabel = apiLabelForGridSlot(slot, apiLabel);
          if (slot.type === "pending") {
            return <PendingGridTile key={slot.id} index={index} apiLabel={slotApiLabel} />;
          }
          if (slot.type === "failed") {
            return (
              <FailedGridTile
                key={slot.id}
                index={index}
                apiLabel={slotApiLabel}
                recoveryTask={slot.recoveryTask}
                jobGroup={slot.jobGroup}
                jobSlot={slot.jobSlot}
                onApplyJobSlotParams={onApplyJobSlotParams}
                onRegenerateJobSlot={onRegenerateJobSlot}
                onQueryAPIMartTask={onQueryAPIMartTask}
              />
            );
          }
          return (
            <BatchGridTile
              key={slot.item.id}
              item={slot.item}
              index={index}
              active={slot.type === "result" && slot.item.id === currentId}
              preview={slot.type === "preview"}
              onSelect={onSelect}
              apiLabel={slotApiLabel}
            />
          );
        })}
      </div>
    </div>
  );
}

function apiLabelForGridSlot(slot: BatchGridSlot, fallback?: string) {
  const itemLabel = (slot.type === "result" || slot.type === "preview")
    ? slot.item.apiLabel?.trim()
    : "";
  const slotLabel = slot.apiLabel?.trim();
  const groupLabel = (slot.type === "pending" || slot.type === "failed")
    ? slot.jobGroup?.apiLabel?.trim()
    : "";
  const modeLabel = (slot.type === "pending" || slot.type === "failed")
    ? apiModeFallbackLabel(slot.jobGroup?.apiMode)
    : "";
  return itemLabel || slotLabel || groupLabel || modeLabel || fallback;
}

function apiModeFallbackLabel(apiMode?: JobGroupSnapshot["apiMode"]) {
  if (apiMode === "apimart") return "APIMart";
  if (apiMode === "responses") return "Responses";
  if (apiMode === "images") return "Images";
  return "";
}

function BatchGridTile({
  item,
  index,
  active,
  preview,
  onSelect,
  apiLabel,
}: {
  item: HistoryItem;
  index: number;
  active: boolean;
  preview: boolean;
  onSelect: (item: HistoryItem) => void | Promise<void>;
  apiLabel?: string;
}) {
  const previewURL = useBlobURL(item.imageBlob ?? item.previewBlob ?? null, item.imageB64 ?? null);
  const src = historyPreviewSrc(item, previewURL);
  const pixelLabel = pixelSizeLabel(item);
  return (
    <button
      type="button"
      className={`batch-grid-tile ${active ? "active" : ""} ${preview ? "previewing" : ""}`}
      onClick={() => {
        if (!preview) void onSelect(item);
      }}
      disabled={preview}
      title={item.prompt}
    >
      <img
        src={src}
        alt={item.prompt || `batch result ${index + 1}`}
        loading="eager"
        decoding="async"
        draggable={false}
      />
      <span className="batch-grid-index">{index + 1}</span>
      {preview ? (
        <span className="batch-grid-preview-wait">服务器信号图像已返回，等待最后结果...</span>
      ) : null}
      {!preview && item.elapsedSec ? <span className="batch-grid-meta">{item.elapsedSec}s</span> : null}
      {apiLabel ? <span className="batch-grid-api-label">{apiLabel}</span> : null}
      {!preview && pixelLabel ? <span className="batch-grid-pixels">{pixelLabel}</span> : null}
    </button>
  );
}

function PendingGridTile({ index, apiLabel }: { index: number; apiLabel?: string }) {
  return (
    <div className="batch-grid-tile pending" aria-label={`等待第 ${index + 1} 张预览`}>
      <span className="batch-grid-index">{index + 1}</span>
      <span className="batch-grid-pending-ring" />
      <span className="batch-grid-pending-label">等待预览</span>
      {apiLabel ? <span className="batch-grid-api-label">{apiLabel}</span> : null}
    </div>
  );
}

function FailedGridTile({
  index,
  apiLabel,
  jobGroup,
  jobSlot,
  onApplyJobSlotParams,
  onRegenerateJobSlot,
  recoveryTask,
  onQueryAPIMartTask,
}: {
  index: number;
  apiLabel?: string;
  jobGroup?: JobGroupSnapshot;
  jobSlot?: JobSlotSnapshot;
  onApplyJobSlotParams?: (group: JobGroupSnapshot, slot: JobSlotSnapshot) => void;
  onRegenerateJobSlot?: (group: JobGroupSnapshot, slot: JobSlotSnapshot) => void | Promise<void>;
  recoveryTask?: APIMartRecoveryTask;
  onQueryAPIMartTask?: (taskId: string) => void | Promise<void>;
}) {
  const canApplyParams = Boolean(
    jobGroup
      && jobSlot
      && jobSlot.status !== "queued"
      && jobSlot.status !== "running"
      && onApplyJobSlotParams,
  );
  const canRegenerate = Boolean(
    jobGroup
      && jobSlot
      && jobSlot.status !== "queued"
      && jobSlot.status !== "running"
      && onRegenerateJobSlot,
  );
  return (
    <div className="batch-grid-tile failed" aria-label={`第 ${index + 1} 张生成失败或未返回`}>
      <span className="batch-grid-index">{index + 1}</span>
      <span className="batch-grid-failed-mark">!</span>
      <span className="batch-grid-failed-label">生成失败 / 未返回</span>
      {apiLabel ? <span className="batch-grid-api-label">{apiLabel}</span> : null}
      {canApplyParams || canRegenerate || (recoveryTask?.taskId && onQueryAPIMartTask) ? (
        <span className="batch-grid-failed-actions">
          {canApplyParams && jobGroup && jobSlot && onApplyJobSlotParams ? (
            <button
              type="button"
              className="batch-grid-apply-params"
              title="应用这格任务参数到控制台，不重新生成"
              onClick={(event) => {
                event.stopPropagation();
                onApplyJobSlotParams(jobGroup, jobSlot);
              }}
            >
              应用参数
            </button>
          ) : null}
          {canRegenerate && jobGroup && jobSlot && onRegenerateJobSlot ? (
            <button
              type="button"
              className="batch-grid-regenerate-slot"
              title="按这格任务参数重新生成，可能产生新扣费"
              onClick={(event) => {
                event.stopPropagation();
                void onRegenerateJobSlot(jobGroup, jobSlot);
              }}
            >
              重新生成
            </button>
          ) : null}
          {recoveryTask?.taskId && onQueryAPIMartTask ? (
            <button
              type="button"
              className="batch-grid-apimart-query"
              title="继续查询 APIMart 后台任务，不重新生成，不重新扣费"
              onClick={(event) => {
                event.stopPropagation();
                void onQueryAPIMartTask(recoveryTask.taskId);
              }}
            >
              查后台
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
