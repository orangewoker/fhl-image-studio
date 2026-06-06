import type { HistoryItem } from "../../types/domain";
import { historyPreviewSrc, useBlobURL } from "../../lib/images";

export type BatchGridSlot =
  | { type: "result"; item: HistoryItem }
  | { type: "preview"; item: HistoryItem }
  | { type: "failed"; id: string }
  | { type: "pending"; id: string };

export function BatchResultGrid({
  items,
  slots,
  currentId,
  onSelect,
  onClose,
  showClose = true,
  title,
}: {
  items: HistoryItem[];
  slots?: BatchGridSlot[];
  currentId: string | null;
  onSelect: (item: HistoryItem) => void | Promise<void>;
  onClose: () => void;
  showClose?: boolean;
  title?: string;
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
          if (slot.type === "pending") {
            return <PendingGridTile key={slot.id} index={index} />;
          }
          if (slot.type === "failed") {
            return <FailedGridTile key={slot.id} index={index} />;
          }
          return (
            <BatchGridTile
              key={slot.item.id}
              item={slot.item}
              index={index}
              active={slot.type === "result" && slot.item.id === currentId}
              preview={slot.type === "preview"}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}

function BatchGridTile({
  item,
  index,
  active,
  preview,
  onSelect,
}: {
  item: HistoryItem;
  index: number;
  active: boolean;
  preview: boolean;
  onSelect: (item: HistoryItem) => void | Promise<void>;
}) {
  const previewURL = useBlobURL(item.imageBlob ?? item.previewBlob ?? null, item.imageB64 ?? null);
  const src = historyPreviewSrc(item, previewURL);
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
    </button>
  );
}

function PendingGridTile({ index }: { index: number }) {
  return (
    <div className="batch-grid-tile pending" aria-label={`等待第 ${index + 1} 张预览`}>
      <span className="batch-grid-index">{index + 1}</span>
      <span className="batch-grid-pending-ring" />
      <span className="batch-grid-pending-label">等待预览</span>
    </div>
  );
}

function FailedGridTile({ index }: { index: number }) {
  return (
    <div className="batch-grid-tile failed" aria-label={`第 ${index + 1} 张生成失败或未返回`}>
      <span className="batch-grid-index">{index + 1}</span>
      <span className="batch-grid-failed-mark">!</span>
      <span className="batch-grid-failed-label">生成失败 / 未返回</span>
    </div>
  );
}
