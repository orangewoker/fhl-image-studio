import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { historyPreviewSrc, useBlobURL } from "../../lib/images";
import {
  hasPanoramaRoundtripRef,
  isLikelyPanoramaItem,
  panoramaProjectOutputsForSource,
} from "../../panorama/core";
import { useStudioStore } from "../../state/studioStore";
import type { HistoryItem } from "../../types/domain";
import { Modal } from "../common/Modal";
import "./panoramaTy360.css";

function panoramaOutputRoleLabel(item: HistoryItem) {
  switch (item.panoramaProject?.role) {
    case "shot":
      return "镜头导出";
    case "edited-shot":
      return "镜头编辑";
    case "pasted-panorama":
      return "贴回全景";
    default:
      return hasPanoramaRoundtripRef(item) ? "镜头图" : "输出";
  }
}

function PanoramaOutputRow({
  item,
  onOpenDetail,
  onEdit,
  onAlignPasteback,
  onImportPasteback,
  onOpenPanorama,
}: {
  item: HistoryItem;
  onOpenDetail: (item: HistoryItem) => void;
  onEdit: (item: HistoryItem) => void;
  onAlignPasteback: (item: HistoryItem) => void;
  onImportPasteback: (item: HistoryItem) => void;
  onOpenPanorama: (item: HistoryItem) => void;
}) {
  const objectURL = useBlobURL(item.previewBlob ?? item.imageBlob ?? null, item.imageB64);
  const thumbSrc = historyPreviewSrc(item, objectURL);

  return (
    <div className="pano-output-item">
      <button
        type="button"
        className="pano-output-thumb"
        onClick={() => onOpenDetail(item)}
        title="打开详情"
      >
        {thumbSrc ? <img src={thumbSrc} alt="" /> : <span>无预览</span>}
      </button>
      <div className="pano-output-meta">
        <div className="pano-output-line">
          <span className="pano-output-role">{panoramaOutputRoleLabel(item)}</span>
          <span className="pano-output-size">{item.width || item.previewWidth || "?"}x{item.height || item.previewHeight || "?"}</span>
        </div>
        <div className="pano-output-actions">
          <button type="button" className="pano-mini-btn" onClick={() => onOpenDetail(item)}>
            详情
          </button>
          <button type="button" className="pano-mini-btn" onClick={() => onEdit(item)}>
            编辑
          </button>
          {hasPanoramaRoundtripRef(item) ? (
            <>
              <button type="button" className="pano-mini-btn" onClick={() => onAlignPasteback(item)}>
                对齐贴回
              </button>
              <button type="button" className="pano-mini-btn" onClick={() => onImportPasteback(item)}>
                导入贴回
              </button>
            </>
          ) : null}
          {isLikelyPanoramaItem(item) ? (
            <button type="button" className="pano-mini-btn" onClick={() => onOpenPanorama(item)}>
              360
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PanoramaOutputManagerModal({
  open,
  source,
  onClose,
}: {
  open: boolean;
  source: HistoryItem | null;
  onClose: () => void;
}) {
  const history = useStudioStore((state) => state.history);
  const openResultDetail = useStudioStore((state) => state.openResultDetail);
  const reuseAsSource = useStudioStore((state) => state.reuseAsSource);
  const openPanoramaViewer = useStudioStore((state) => state.openPanoramaViewer);
  const openPanoramaPastebackAligner = useStudioStore((state) => state.openPanoramaPastebackAligner);
  const importExternalPanoramaPastebackImage = useStudioStore((state) => state.importExternalPanoramaPastebackImage);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importAnchor, setImportAnchor] = useState<HistoryItem | null>(null);

  const outputs = useMemo(
    () => (source ? panoramaProjectOutputsForSource(history, source) : []),
    [history, source],
  );

  function handleOpenDetail(item: HistoryItem) {
    onClose();
    void openResultDetail(item);
  }

  function handleEdit(item: HistoryItem) {
    void reuseAsSource(item).then(onClose);
  }

  function handleAlignPasteback(item: HistoryItem) {
    onClose();
    openPanoramaPastebackAligner(item);
  }

  function handleImportPasteback(item: HistoryItem) {
    setImportAnchor(item);
    const input = importInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }

  async function handleImportPastebackFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    const anchor = importAnchor;
    event.currentTarget.value = "";
    setImportAnchor(null);
    if (!file || !anchor) return;
    const imported = await importExternalPanoramaPastebackImage(anchor, file);
    if (imported) onClose();
  }

  function handleOpenPanorama(item: HistoryItem) {
    onClose();
    void openPanoramaViewer(item);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`全景输出管理${outputs.length ? ` ${outputs.length}` : ""}`}
      width={520}
      cardClassName="pano-output-modal"
      bodyClassName="pano-output-modal-body"
    >
      <div className="pano-output-manager">
        <div className="pano-output-modal-summary">
          <span>{source?.prompt?.trim() || "当前全景图"}</span>
          <span>{outputs.length} 个输出</span>
        </div>
        {outputs.length > 0 ? (
          <div className="pano-output-list pano-output-list-modal">
            {outputs.map((output) => (
              <PanoramaOutputRow
                key={output.id}
                item={output}
                onOpenDetail={handleOpenDetail}
                onEdit={handleEdit}
                onAlignPasteback={handleAlignPasteback}
                onImportPasteback={handleImportPasteback}
                onOpenPanorama={handleOpenPanorama}
              />
            ))}
          </div>
        ) : (
          <div className="pano-output-empty">还没有镜头输出</div>
        )}
        <input
          ref={importInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="pano-output-file-input"
          tabIndex={-1}
          onChange={handleImportPastebackFile}
        />
      </div>
    </Modal>
  );
}
