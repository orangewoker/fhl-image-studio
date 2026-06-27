import { useEffect, useState } from "react";
import { INTERNAL_HISTORY_ITEM_MIME, readInternalHistoryItemDragData } from "../../lib/dragExport.ts";
import type { HistoryItem } from "../../types/domain";

const GLOBAL_IMPORT_IGNORE_SELECTOR = "[role='dialog'], .app-modal-backdrop, .context-menu";

function hasDraggedFiles(event: DragEvent) {
  return Boolean(event.dataTransfer?.types.includes("Files"));
}

function hasInternalHistoryDrag(event: DragEvent) {
  return Boolean(event.dataTransfer?.types.includes(INTERNAL_HISTORY_ITEM_MIME));
}

function isInsideGlobalImportIgnoreArea(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(GLOBAL_IMPORT_IGNORE_SELECTOR));
}

export function useGlobalImageImport(
  importImageFile: (file: File) => Promise<void>,
  importHistoryItem: (item: HistoryItem) => Promise<void>,
) {
  const [dragHover, setDragHover] = useState(false);

  useEffect(() => {
    let depth = 0;

    const clearDragHover = () => {
      depth = 0;
      setDragHover(false);
    };

    const shouldIgnoreDrag = (event: DragEvent) => {
      if (!isInsideGlobalImportIgnoreArea(event.target)) return false;
      if (hasDraggedFiles(event) || hasInternalHistoryDrag(event)) event.preventDefault();
      clearDragHover();
      return true;
    };

    const onDragEnter = (event: DragEvent) => {
      if (shouldIgnoreDrag(event)) return;
      if (hasInternalHistoryDrag(event)) {
        event.preventDefault();
        return;
      }
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragHover(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (shouldIgnoreDrag(event)) return;
      if (hasInternalHistoryDrag(event)) {
        event.preventDefault();
        return;
      }
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
    };

    const onDragLeave = (event: DragEvent) => {
      if (shouldIgnoreDrag(event)) return;
      if (!hasDraggedFiles(event) && !hasInternalHistoryDrag(event)) return;
      event.preventDefault();
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragHover(false);
    };

    const onDrop = (event: DragEvent) => {
      if (shouldIgnoreDrag(event)) return;
      event.preventDefault();
      clearDragHover();

      const internalItem = readInternalHistoryItemDragData(event.dataTransfer);
      if (internalItem) {
        void importHistoryItem(internalItem);
        return;
      }

      if (!hasDraggedFiles(event)) return;
      const files = event.dataTransfer?.files;
      if (!files?.length) return;

      void (async () => {
        for (const file of Array.from(files)) {
          await importImageFile(file);
        }
      })();
    };

    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        event.preventDefault();
        void importImageFile(file);
        return;
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    document.addEventListener("paste", onPaste);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      document.removeEventListener("paste", onPaste);
    };
  }, [importHistoryItem, importImageFile]);

  return { dragHover };
}
