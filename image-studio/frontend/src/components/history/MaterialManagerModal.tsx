import { useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  ChevronDown,
  Check,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Modal } from "../common/Modal";
import { historyPreviewSrc, useBlobURL, useImageLoadState } from "../../lib/images";
import {
  refsFromHistoryIds,
  smartPromptMaterialGroups,
  ungroupedHistoryItems,
  uniqueMaterialGroupName,
} from "../../state/materialLibrary";
import { useStudioStore } from "../../state/studioStore";
import type { HistoryItem, MaterialGroup, MaterialRef, SourceImage } from "../../types/domain";
import type { MaterialOutputSyncResultLike } from "../../platform/runtime/hostTypes";

type CategoryKey = "folders" | "ungrouped" | "smartPrompts";

type Selection =
  | { type: "group"; id: string }
  | { type: "smart"; key: string }
  | { type: "ungrouped"; id: string }
  | null;

type FolderDraft = {
  name: string;
  description: string;
  error: string;
  focusFolders: boolean;
  pendingHistoryIds?: string[];
} | null;

const DRAG_HISTORY_IDS = "application/x-fhl-history-ids";

export function MaterialManagerModal() {
  const {
    materialManagerOpen,
    closeMaterialManager,
    materialGroups,
    history,
    createMaterialGroup,
    renameMaterialGroup,
    deleteMaterialGroup,
    moveHistoryItemsToMaterialGroup,
    removeMaterialItem,
    syncMaterialGroupToOutput,
    syncAllMaterialGroupsToOutput,
    openMaterialSyncDir,
    pushToast,
  } = useStudioStore();
  const [category, setCategory] = useState<CategoryKey>("folders");
  const [selection, setSelection] = useState<Selection>(null);
  const [folderDraft, setFolderDraft] = useState<FolderDraft>(null);
  const [multiSelectEnabled, setMultiSelectEnabled] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [selectedMaterialFolderId, setSelectedMaterialFolderId] = useState<string | null>(null);
  const [materialAssetPoolOpen, setMaterialAssetPoolOpen] = useState(false);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [workspaceDropActive, setWorkspaceDropActive] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; historyIds: string[] } | null>(null);
  const [syncingGroupId, setSyncingGroupId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncResultsByGroup, setSyncResultsByGroup] = useState<Record<string, MaterialOutputSyncResultLike>>({});

  const folders = useMemo(() => materialGroups.filter((group) => group.kind === "folder"), [materialGroups]);
  const ungrouped = useMemo(() => ungroupedHistoryItems(history, materialGroups), [history, materialGroups]);
  const smartGroups = useMemo(() => smartPromptMaterialGroups(history, materialGroups), [history, materialGroups]);
  const historyById = useMemo(() => new Map(history.map((item) => [item.id, item])), [history]);
  const selectedHistoryIdSet = useMemo(() => new Set(selectedHistoryIds), [selectedHistoryIds]);
  const selectedMaterialFolder = selectedMaterialFolderId ? folders.find((group) => group.id === selectedMaterialFolderId) ?? null : null;
  const workspaceItems = selectedMaterialFolder ? refsToPreviewItems(selectedMaterialFolder.items, historyById) : [];

  const selectedGroup = selection?.type === "group"
    ? materialGroups.find((group) => group.id === selection.id) ?? null
    : null;
  const selectedSmart = selection?.type === "smart"
    ? smartGroups.find((group) => group.key === selection.key) ?? null
    : null;
  const selectedUngrouped = selection?.type === "ungrouped"
    ? historyById.get(selection.id) ?? null
    : null;

  useEffect(() => {
    if (!selectedMaterialFolderId) return;
    if (!folders.some((group) => group.id === selectedMaterialFolderId)) {
      setSelectedMaterialFolderId(null);
      setSelection(null);
    }
  }, [folders, selectedMaterialFolderId]);

  useEffect(() => {
    const visibleIds = new Set(ungrouped.map((item) => item.id));
    setSelectedHistoryIds((ids) => {
      const next = ids.filter((id) => visibleIds.has(id));
      return next.length === ids.length ? ids : next;
    });
  }, [ungrouped]);

  useEffect(() => {
    if (!materialManagerOpen || !multiSelectEnabled || category !== "ungrouped") return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (selectedHistoryIds.length === 0 && !contextMenu) return;
      event.preventDefault();
      setSelectedHistoryIds([]);
      setContextMenu(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [category, contextMenu, materialManagerOpen, multiSelectEnabled, selectedHistoryIds.length]);

  useEffect(() => {
    if (!contextMenu) return;
    function closeMenu() {
      setContextMenu(null);
    }
    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
    };
  }, [contextMenu]);

  function openFolderDraft(focusFolders = true, pendingHistoryIds: string[] = []) {
    if (focusFolders) setCategory("folders");
    setSelection(null);
    setFolderDraft({ name: "新建文件夹", description: "", error: "", focusFolders, pendingHistoryIds });
  }

  function createFolderFromDraft() {
    if (!folderDraft) return;
    const rawName = folderDraft.name.trim();
    if (!rawName) {
      setFolderDraft({ ...folderDraft, error: "文件夹名称必填" });
      return;
    }
    const resolvedName = uniqueMaterialGroupName(materialGroups, "folder", rawName);
    const pendingIds = uniqueHistoryIds(folderDraft.pendingHistoryIds ?? []);
    const id = createMaterialGroup("folder", resolvedName, refsFromHistoryIds(pendingIds), folderDraft.description);
    if (resolvedName !== rawName) {
      pushToast(`「${rawName}」已存在，已创建为「${resolvedName}」`, "warn", 2600);
    } else if (pendingIds.length > 0) {
      pushToast(`已创建文件夹「${resolvedName}」，并收纳 ${pendingIds.length} 张素材`, "success", 2200);
    } else {
      pushToast(`已创建文件夹「${resolvedName}」`, "success", 1800);
    }
    setFolderDraft(null);
    setSelectedMaterialFolderId(id);
    if (folderDraft.focusFolders) setCategory("folders");
    setSelection({ type: "group", id });
    clearMovedHistoryIds(pendingIds);
  }

  function renameSelectedGroup(group: MaterialGroup) {
    const name = window.prompt("输入新名称", group.name);
    if (!name?.trim()) return;
    renameMaterialGroup(group.id, name.trim());
  }

  function deleteSelectedGroup(group: MaterialGroup) {
    if (!window.confirm(`删除素材组「${group.name}」？\n\n只删除分组关系，不删除历史记录、输出文件或本地图片。`)) return;
    deleteMaterialGroup(group.id);
    if (selectedMaterialFolderId === group.id) setSelectedMaterialFolderId(null);
    setSelection(null);
  }

  function convertSmartGroupToFolder() {
    if (!selectedSmart) return;
    const name = window.prompt("输入文件夹名称", selectedSmart.prompt || "智能提示词组");
    if (!name?.trim()) return;
    const id = createMaterialGroup("folder", name.trim(), refsFromHistoryIds(selectedSmart.items.map((item) => item.id)));
    setCategory("folders");
    setSelection({ type: "group", id });
    setSelectedMaterialFolderId(id);
  }

  function clearMovedHistoryIds(ids: string[]) {
    if (ids.length === 0) return;
    const moved = new Set(ids);
    setSelectedHistoryIds((prev) => prev.filter((id) => !moved.has(id)));
    if (selection?.type === "ungrouped" && moved.has(selection.id)) setSelection(null);
  }

  function moveHistoryIdsToGroup(groupId: string, ids: string[]) {
    const group = materialGroups.find((item) => item.id === groupId && item.kind === "folder")
      ?? materialGroups.find((item) => item.id === groupId);
    const validIds = uniqueHistoryIds(ids).filter((id) => historyById.has(id));
    if (!group) {
      pushToast("请先选择目标文件夹", "warn", 2200);
      return;
    }
    if (validIds.length === 0) return;
    moveHistoryItemsToMaterialGroup(groupId, validIds);
    clearMovedHistoryIds(validIds);
    pushToast(`已收纳 ${validIds.length} 张到「${group.name}」`, "success", 1800);
  }

  function selectFolderWorkspace(groupId: string) {
    setCategory("folders");
    setFolderDraft(null);
    setMaterialAssetPoolOpen(false);
    setSelectedMaterialFolderId(groupId);
    setSelection({ type: "group", id: groupId });
  }

  function dropHistoryIntoGroup(groupId: string, event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragOverFolderId(null);
    const ids = readDraggedHistoryIds(event);
    if (ids.length === 0) {
      pushToast("没有可收纳的素材", "warn", 1800);
      return;
    }
    moveHistoryIdsToGroup(groupId, ids);
  }

  function dropHistoryIntoWorkspace(event: React.DragEvent) {
    event.preventDefault();
    setWorkspaceDropActive(false);
    if (!selectedMaterialFolder) {
      pushToast("先选择一个文件夹，再拖入素材", "warn", 2200);
      return;
    }
    moveHistoryIdsToGroup(selectedMaterialFolder.id, readDraggedHistoryIds(event));
  }

  function handleUngroupedSelect(item: HistoryItem, index: number, event: React.MouseEvent) {
    const previousSelection = selection;
    const modifierSelect = event.ctrlKey || event.metaKey || event.shiftKey;
    const previousSelectionIndex = previousSelection?.type === "ungrouped"
      ? ungrouped.findIndex((entry) => entry.id === previousSelection.id)
      : -1;
    const anchorIndex = lastSelectedIndex ?? (previousSelectionIndex >= 0 ? previousSelectionIndex : null);
    setFolderDraft(null);
    setSelection({ type: "ungrouped", id: item.id });
    setContextMenu(null);
    if (!multiSelectEnabled && !modifierSelect) {
      setSelectedHistoryIds([]);
      setLastSelectedIndex(index);
      return;
    }
    if (!multiSelectEnabled && modifierSelect) {
      setMultiSelectEnabled(true);
    }
    if (event.shiftKey && anchorIndex !== null) {
      const start = Math.min(anchorIndex, index);
      const end = Math.max(anchorIndex, index);
      const rangeIds = ungrouped.slice(start, end + 1).map((entry) => entry.id);
      setSelectedHistoryIds((prev) => uniqueHistoryIds([...prev, ...rangeIds]));
    } else if (event.ctrlKey || event.metaKey) {
      const baseIds = !multiSelectEnabled && previousSelection?.type === "ungrouped" && previousSelection.id !== item.id
        ? [previousSelection.id]
        : [];
      setSelectedHistoryIds((prev) => {
        const merged = uniqueHistoryIds([...baseIds, ...prev]);
        return merged.includes(item.id) ? merged.filter((id) => id !== item.id) : [...merged, item.id];
      });
    } else {
      setSelectedHistoryIds((prev) => (
        prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
      ));
    }
    setLastSelectedIndex(index);
  }

  function handleUngroupedContextMenu(item: HistoryItem, index: number, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setFolderDraft(null);
    setSelection({ type: "ungrouped", id: item.id });
    setLastSelectedIndex(index);
    const ids = selectedHistoryIdSet.has(item.id) ? selectedHistoryIds : [item.id];
    if (multiSelectEnabled && !selectedHistoryIdSet.has(item.id)) setSelectedHistoryIds([item.id]);
    setContextMenu({ x: event.clientX, y: event.clientY, historyIds: ids });
  }

  function dragIdsForItem(item: HistoryItem) {
    if (multiSelectEnabled && selectedHistoryIdSet.has(item.id) && selectedHistoryIds.length > 0) {
      return selectedHistoryIds;
    }
    return [item.id];
  }

  function moveSelectedToCurrentFolder() {
    if (!selectedMaterialFolder) {
      pushToast("先选择一个文件夹", "warn", 2200);
      return;
    }
    moveHistoryIdsToGroup(selectedMaterialFolder.id, selectedHistoryIds);
  }

  function createFolderForSelected() {
    openFolderDraft(true, selectedHistoryIds);
  }

  function toggleMultiSelect(next: boolean) {
    setMultiSelectEnabled(next);
    setContextMenu(null);
    if (!next) {
      setSelectedHistoryIds([]);
      setLastSelectedIndex(null);
    }
  }

  async function syncGroupToOutput(group: MaterialGroup) {
    if (syncingGroupId || syncingAll) return;
    setSyncingGroupId(group.id);
    try {
      const result = await syncMaterialGroupToOutput(group.id);
      if (result) {
        setSyncResultsByGroup((prev) => ({ ...prev, [group.id]: result }));
      }
    } finally {
      setSyncingGroupId(null);
    }
  }

  async function syncAllGroupsToOutput() {
    if (syncingAll || syncingGroupId) return;
    setSyncingAll(true);
    try {
      await syncAllMaterialGroupsToOutput();
    } finally {
      setSyncingAll(false);
    }
  }

  if (!materialManagerOpen) return null;

  return (
    <Modal
      open
      onClose={closeMaterialManager}
      title="素材管理"
      width={1120}
      bodyClassName="material-manager-modal-body"
      cardClassName="material-manager-modal-card"
    >
      <div className="material-manager">
        <aside className="material-manager-sidebar">
          <div className="material-manager-sidebar-head">
            <strong>素材库</strong>
            <span>{history.length} 张历史图</span>
          </div>
          <FolderTree
            folders={folders}
            historyById={historyById}
            selectedFolderId={selectedMaterialFolderId}
            onCreateFolder={() => openFolderDraft(true)}
            onDragEnterFolder={setDragOverFolderId}
            onDragLeaveFolder={() => setDragOverFolderId(null)}
            onDrop={dropHistoryIntoGroup}
            dragOverFolderId={dragOverFolderId}
            onSelectFolder={(id) => {
              selectFolderWorkspace(id);
            }}
          />
          <div className="material-manager-assist-section">
            <button
              type="button"
              className={`material-manager-assist-button ${materialAssetPoolOpen ? "active" : ""}`}
              onClick={() => {
                setCategory("ungrouped");
                setFolderDraft(null);
                setSelection(null);
                setMaterialAssetPoolOpen((open) => !open);
              }}
            >
              <ImageIcon className="h-4 w-4" />
              <span>
                <strong>未分组素材池</strong>
                <small>{ungrouped.length} 张可收纳</small>
              </span>
            </button>
            <button
              type="button"
              className={`material-manager-assist-button ${category === "smartPrompts" ? "active" : ""}`}
              onClick={() => {
                setCategory("smartPrompts");
                setMaterialAssetPoolOpen(false);
                setFolderDraft(null);
                setSelection(null);
              }}
            >
              <Sparkles className="h-4 w-4" />
              <span>
                <strong>智能提示词组</strong>
                <small>{smartGroups.length} 项</small>
              </span>
            </button>
          </div>
          <div className="material-manager-sidebar-actions">
            <button type="button" onClick={() => void syncAllGroupsToOutput()} disabled={syncingAll || materialGroups.length === 0}>
              <RefreshCw className="h-3.5 w-3.5" /> {syncingAll ? "同步中..." : "同步全部到 output"}
            </button>
          </div>
        </aside>

        <main className="material-manager-main">
          {materialAssetPoolOpen ? (
            <HistoryGrid
              items={ungrouped}
              emptyText="没有未分组素材。图片进入文件夹后会自动从这里消失。"
              selectedId={selection?.type === "ungrouped" ? selection.id : null}
              selectedIds={selectedHistoryIdSet}
              selectedCount={selectedHistoryIds.length}
              multiSelectEnabled={multiSelectEnabled}
              currentFolder={selectedMaterialFolder}
              onAddSelectedToCurrentFolder={moveSelectedToCurrentFolder}
              onCreateFolderForSelected={createFolderForSelected}
              onClose={() => setMaterialAssetPoolOpen(false)}
              onToggleMultiSelect={toggleMultiSelect}
              onSelectAll={() => {
                setSelectedHistoryIds(ungrouped.map((item) => item.id));
                setLastSelectedIndex(ungrouped.length > 0 ? ungrouped.length - 1 : null);
              }}
              onClearSelection={() => setSelectedHistoryIds([])}
              onSelect={handleUngroupedSelect}
              onContextMenu={handleUngroupedContextMenu}
              dragIdsForItem={dragIdsForItem}
            />
          ) : category === "smartPrompts" ? (
            <>
              <div className="material-manager-main-head">
                <div>
                  <h4>智能提示词组</h4>
                  <p>相同 prompt 自动聚合，可一键转为文件夹。</p>
                </div>
              </div>
              <SmartPromptList
                groups={smartGroups}
                selectedKey={selection?.type === "smart" ? selection.key : null}
                onSelect={(key) => {
                  setFolderDraft(null);
                  setSelection({ type: "smart", key });
                }}
              />
            </>
          ) : (
            <FolderWorkspace
              folder={selectedMaterialFolder}
              items={workspaceItems}
              dropActive={workspaceDropActive}
              syncResult={selectedMaterialFolder ? syncResultsByGroup[selectedMaterialFolder.id] ?? null : null}
              syncing={selectedMaterialFolder ? syncingGroupId === selectedMaterialFolder.id : false}
              selectedItemKey={selection?.type === "ungrouped" ? `history:${selection.id}` : null}
              onAddAssets={() => setMaterialAssetPoolOpen(true)}
              onCreateFolder={() => openFolderDraft(true)}
              onDelete={selectedMaterialFolder ? () => deleteSelectedGroup(selectedMaterialFolder) : undefined}
              onDragLeave={() => setWorkspaceDropActive(false)}
              onDragOver={(event) => {
                event.preventDefault();
                if (selectedMaterialFolder) setWorkspaceDropActive(true);
              }}
              onDrop={dropHistoryIntoWorkspace}
              onOpenSyncDir={(path) => void openMaterialSyncDir(path)}
              onRemoveItem={(ref) => selectedMaterialFolder && removeMaterialItem(selectedMaterialFolder.id, ref)}
              onRename={selectedMaterialFolder ? () => renameSelectedGroup(selectedMaterialFolder) : undefined}
              onSelectItem={(item) => {
                if (item.type === "history") setSelection({ type: "ungrouped", id: item.history.id });
              }}
              onSync={selectedMaterialFolder ? () => void syncGroupToOutput(selectedMaterialFolder) : undefined}
            />
          )}
        </main>

        <aside className="material-manager-detail">
          {folderDraft ? (
            <FolderDraftDetail
              draft={folderDraft}
              onChange={setFolderDraft}
              onCancel={() => setFolderDraft(null)}
              onSubmit={createFolderFromDraft}
            />
          ) : selectedGroup ? (
            <GroupDetail
              group={selectedGroup}
              historyById={historyById}
              onRename={() => renameSelectedGroup(selectedGroup)}
              onDelete={() => deleteSelectedGroup(selectedGroup)}
              onRemoveItem={(ref) => removeMaterialItem(selectedGroup.id, ref)}
              onSync={() => void syncGroupToOutput(selectedGroup)}
              onOpenSyncDir={(path) => void openMaterialSyncDir(path)}
              syncResult={syncResultsByGroup[selectedGroup.id] ?? null}
              syncing={syncingGroupId === selectedGroup.id}
            />
          ) : selectedSmart ? (
            <SmartPromptDetail group={selectedSmart} onConvert={convertSmartGroupToFolder} />
          ) : selectedUngrouped ? (
            <UngroupedDetail item={selectedUngrouped} />
          ) : (
            <div className="material-manager-empty-detail">
              <Sparkles className="h-5 w-5" />
              <strong>选择一个素材组或图片</strong>
              <span>素材管理负责分类、收纳和复用；大图浏览继续用右侧的查看完整相册。</span>
            </div>
          )}
        </aside>
      </div>
      {contextMenu ? (
        <MaterialContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          count={contextMenu.historyIds.length}
          folders={folders}
          targetFolder={selectedMaterialFolder}
          onMoveToTarget={() => {
            if (selectedMaterialFolder) moveHistoryIdsToGroup(selectedMaterialFolder.id, contextMenu.historyIds);
            setContextMenu(null);
          }}
          onMoveToFolder={(groupId) => {
            moveHistoryIdsToGroup(groupId, contextMenu.historyIds);
            setContextMenu(null);
          }}
          onCreateFolder={() => {
            openFolderDraft(false, contextMenu.historyIds);
            setContextMenu(null);
          }}
        />
      ) : null}
    </Modal>
  );
}

function GroupList({
  emptyText,
  groups,
  historyById,
  onDrop,
  onSelect,
  selectedId,
}: {
  emptyText: string;
  groups: MaterialGroup[];
  historyById: Map<string, HistoryItem>;
  onDrop: (groupId: string, event: React.DragEvent) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  if (groups.length === 0) {
    return <div className="material-manager-empty-list">{emptyText}</div>;
  }
  return (
    <div className="material-manager-group-list">
      {groups.map((group) => {
        const previewItems = refsToPreviewItems(group.items, historyById).slice(0, 4);
        return (
          <button
            key={group.id}
            type="button"
            className={`material-manager-group-card ${selectedId === group.id ? "active" : ""}`}
            onClick={() => onSelect(group.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDrop(group.id, event)}
          >
            <span className="material-manager-group-icon"><Folder className="h-4 w-4" /></span>
            <span className="material-manager-group-copy">
              <strong>{group.name}</strong>
              <small>{group.description || `${group.items.length} 张 · ${formatDate(group.updatedAt)}`}</small>
            </span>
            <span className="material-manager-group-previews">
              {previewItems.length > 0
                ? previewItems.map((item, index) => <PreviewThumb key={item.key} item={item} compact index={index} />)
                : <span className="material-manager-group-empty-thumb" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FolderTree({
  dragOverFolderId,
  folders,
  onCreateFolder,
  onDragEnterFolder,
  onDragLeaveFolder,
  onDrop,
  onSelectFolder,
  historyById,
  selectedFolderId,
}: {
  dragOverFolderId: string | null;
  folders: MaterialGroup[];
  onCreateFolder: () => void;
  onDragEnterFolder: (groupId: string) => void;
  onDragLeaveFolder: () => void;
  onDrop: (groupId: string, event: React.DragEvent) => void;
  onSelectFolder: (id: string) => void;
  historyById: Map<string, HistoryItem>;
  selectedFolderId: string | null;
}) {
  return (
    <div className="material-manager-folder-tree">
      <div className="material-manager-folder-root">
        <span><ChevronDown className="h-3.5 w-3.5" /></span>
        <strong>总文件夹</strong>
        <small>{folders.length} 个</small>
      </div>
      <div className="material-manager-folder-children">
        {folders.length === 0 ? (
          <div className="material-manager-folder-empty">还没有子文件夹，先新建一个开始收纳。</div>
        ) : (
          folders.map((group) => {
            const previews = refsToPreviewItems(group.items, historyById).slice(0, 3);
            return (
              <button
                key={group.id}
                type="button"
                className={`material-manager-folder-node ${selectedFolderId === group.id ? "active" : ""} ${dragOverFolderId === group.id ? "drag-over" : ""}`}
                onClick={() => onSelectFolder(group.id)}
                onDragEnter={() => onDragEnterFolder(group.id)}
                onDragLeave={onDragLeaveFolder}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  onDragEnterFolder(group.id);
                }}
                onDrop={(event) => onDrop(group.id, event)}
              >
                <Folder className="h-4 w-4" />
                <span>
                  <strong>{group.name}</strong>
                  <small>{group.items.length} 张素材</small>
                </span>
                <em>松开后收纳到此文件夹</em>
                <span className="material-manager-folder-mini-previews">
                  {previews.map((item, index) => <PreviewThumb key={item.key} item={item} compact index={index} />)}
                </span>
              </button>
            );
          })
        )}
      </div>
      <div className="material-manager-folder-actions">
        <button type="button" onClick={onCreateFolder}>
          <FolderPlus className="h-3.5 w-3.5" /> 新建文件夹
        </button>
      </div>
    </div>
  );
}

function FolderWorkspace({
  dropActive,
  folder,
  items,
  onAddAssets,
  onCreateFolder,
  onDelete,
  onDragLeave,
  onDragOver,
  onDrop,
  onOpenSyncDir,
  onRemoveItem,
  onRename,
  onSelectItem,
  onSync,
  selectedItemKey,
  syncResult,
  syncing,
}: {
  dropActive: boolean;
  folder: MaterialGroup | null;
  items: PreviewItem[];
  onAddAssets: () => void;
  onCreateFolder: () => void;
  onDelete?: () => void;
  onDragLeave: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onOpenSyncDir: (path?: string) => void;
  onRemoveItem: (ref: MaterialRef) => void;
  onRename?: () => void;
  onSelectItem: (item: PreviewItem) => void;
  onSync?: () => void;
  selectedItemKey: string | null;
  syncResult: MaterialOutputSyncResultLike | null;
  syncing: boolean;
}) {
  if (!folder) {
    return (
      <div className="material-manager-workspace-empty">
        <FolderOpen className="h-8 w-8" />
        <strong>选择或新建一个文件夹开始收纳</strong>
        <span>左侧总文件夹下的子文件夹会成为这里的收纳工作台。</span>
        <button type="button" onClick={onCreateFolder}>
          <FolderPlus className="h-3.5 w-3.5" /> 新建文件夹
        </button>
      </div>
    );
  }
  return (
    <div
      className={`material-manager-workspace ${dropActive ? "dragging" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="material-manager-workspace-head">
        <div>
          <h4>{folder.name}</h4>
          <p>{folder.items.length} 张素材{folder.description ? ` · ${folder.description}` : ""}</p>
        </div>
        <div className="material-manager-workspace-actions">
          <button type="button" onClick={onAddAssets}>
            <Plus className="h-3.5 w-3.5" /> 添加未分组素材
          </button>
          <button type="button" onClick={onRename}>
            <RefreshCw className="h-3.5 w-3.5" /> 重命名
          </button>
          <button type="button" onClick={onSync} disabled={!onSync || syncing}>
            <RefreshCw className="h-3.5 w-3.5" /> {syncing ? "同步中..." : "同步到 output"}
          </button>
          <button type="button" onClick={() => onOpenSyncDir(syncResult?.targetDir)} disabled={!syncResult?.targetDir}>
            <Folder className="h-3.5 w-3.5" /> 打开目录
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> 删除
          </button>
        </div>
      </div>
      {syncResult ? (
        <div className={`material-manager-workspace-sync ${syncResult.missing > 0 ? "warn" : ""}`}>
          已同步 {syncResult.synced} 张 / 缺失 {syncResult.missing} 张
        </div>
      ) : null}
      <div className="material-manager-workspace-drop-hint">
        把未分组素材拖进这里，会立即收纳到「{folder.name}」。
      </div>
      {items.length === 0 ? (
        <div className="material-manager-workspace-empty-grid">这个文件夹还是空的，点击“添加未分组素材”或直接拖图进来。</div>
      ) : (
        <div className="material-manager-workspace-grid">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`material-manager-workspace-tile ${selectedItemKey === item.key ? "active" : ""}`}
              onClick={() => onSelectItem(item)}
            >
              <PreviewThumb item={item} />
              <span>{item.type === "history" ? (item.history.prompt || "(无 prompt)") : item.source.name}</span>
              {item.ref ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="material-manager-workspace-remove"
                  title="移出文件夹"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveItem(item.ref!);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    onRemoveItem(item.ref!);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryGrid({
  currentFolder,
  dragIdsForItem,
  emptyText,
  items,
  multiSelectEnabled,
  onAddSelectedToCurrentFolder,
  onClearSelection,
  onContextMenu,
  onClose,
  onCreateFolderForSelected,
  onSelect,
  onSelectAll,
  onToggleMultiSelect,
  selectedId,
  selectedIds,
  selectedCount,
}: {
  currentFolder: MaterialGroup | null;
  dragIdsForItem: (item: HistoryItem) => string[];
  emptyText: string;
  items: HistoryItem[];
  multiSelectEnabled: boolean;
  onAddSelectedToCurrentFolder: () => void;
  onClearSelection: () => void;
  onContextMenu: (item: HistoryItem, index: number, event: React.MouseEvent) => void;
  onClose: () => void;
  onCreateFolderForSelected: () => void;
  onSelect: (item: HistoryItem, index: number, event: React.MouseEvent) => void;
  onSelectAll: () => void;
  onToggleMultiSelect: (enabled: boolean) => void;
  selectedId: string | null;
  selectedIds: Set<string>;
  selectedCount: number;
}) {
  return (
    <>
      <div className="material-manager-main-head">
        <div>
          <h4>未分组素材池</h4>
          <p>
            选中后拖到左侧文件夹即可收纳；单张可直接拖入。
            {currentFolder ? ` 当前文件夹: ${currentFolder.name}` : ""}
          </p>
        </div>
        <button type="button" className="material-manager-head-button" onClick={onClose}>
          <X className="h-3.5 w-3.5" /> 返回文件夹
        </button>
      </div>
      <div className="material-manager-ungrouped-toolbar">
        <div className="material-manager-multiselect-row">
          <label className={`material-manager-switch ${multiSelectEnabled ? "active" : ""}`}>
            <input
              type="checkbox"
              checked={multiSelectEnabled}
              onChange={(event) => onToggleMultiSelect(event.target.checked)}
            />
            <span />
            <strong>多选模式</strong>
          </label>
          <span className="material-manager-selected-count">已选 {selectedCount} 张</span>
          <button type="button" onClick={onSelectAll} disabled={items.length === 0 || selectedCount === items.length}>
            全选当前列表
          </button>
          <button type="button" onClick={onClearSelection} disabled={selectedCount === 0}>
            清空选择
          </button>
          <button type="button" onClick={onAddSelectedToCurrentFolder} disabled={!currentFolder || selectedCount === 0}>
            加入当前文件夹
          </button>
          <button type="button" onClick={onCreateFolderForSelected} disabled={selectedCount === 0}>
            新建文件夹并加入
          </button>
        </div>
        <div
          className={`material-manager-key-hint ${multiSelectEnabled ? "visible" : ""}`}
          title="Ctrl/Cmd + 点击可以逐张多选；Shift + 点击会从上次选择位置连续选择；Esc 清空选择。右键图片可以移动到当前目标文件夹或指定文件夹。"
        >
          Ctrl 多选 · Shift 连续选择 · Esc 清空选择
        </div>
      </div>
      {items.length === 0 ? (
        <div className="material-manager-empty-list">{emptyText}</div>
      ) : (
        <div className="material-manager-history-grid">
          {items.map((item, index) => (
            <HistoryMaterialTile
              key={item.id}
              item={item}
              active={selectedId === item.id}
              checked={selectedIds.has(item.id)}
              multiSelectEnabled={multiSelectEnabled}
              dragIds={dragIdsForItem(item)}
              onContextMenu={(event) => onContextMenu(item, index, event)}
              onSelect={(event) => onSelect(item, index, event)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function SmartPromptList({
  groups,
  onSelect,
  selectedKey,
}: {
  groups: Array<{ key: string; prompt: string; items: HistoryItem[] }>;
  onSelect: (key: string) => void;
  selectedKey: string | null;
}) {
  if (groups.length === 0) {
    return <div className="material-manager-empty-list">当前没有可聚合的多图 prompt 组。</div>;
  }
  return (
    <div className="material-manager-smart-list">
      {groups.map((group) => (
        <button
          key={group.key}
          type="button"
          className={`material-manager-smart-card ${selectedKey === group.key ? "active" : ""}`}
          onClick={() => onSelect(group.key)}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(DRAG_HISTORY_IDS, group.items.map((item) => item.id).join(","));
            event.dataTransfer.effectAllowed = "copy";
          }}
        >
          <span className="material-manager-smart-pile">
            {group.items.slice(0, 4).map((item, index) => (
              <PreviewThumb key={item.id} item={{ type: "history", key: item.id, history: item }} compact index={index} />
            ))}
          </span>
          <span className="material-manager-smart-copy">
            <strong>{group.prompt || "(无 prompt)"}</strong>
            <small>{group.items.length} 张同 prompt 图片 · 可转为文件夹</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function FolderDraftDetail({
  draft,
  onCancel,
  onChange,
  onSubmit,
}: {
  draft: NonNullable<FolderDraft>;
  onCancel: () => void;
  onChange: (draft: NonNullable<FolderDraft>) => void;
  onSubmit: () => void;
}) {
  const name = draft.name;
  const description = draft.description;
  return (
    <form
      className="material-manager-detail-stack material-manager-folder-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="material-manager-detail-head">
        <span className="material-manager-detail-icon"><FolderPlus className="h-4 w-4" /></span>
        <div>
          <h4>新建文件夹</h4>
          <p>先设置基础信息，再把历史图拖入文件夹整理。</p>
        </div>
      </div>

      <label className="material-manager-field">
        <span>文件夹名称 <strong>必填</strong></span>
        <input
          value={name}
          autoFocus
          maxLength={40}
          onChange={(event) => onChange({ ...draft, name: event.target.value, error: "" })}
          placeholder="例如：人物设定、商品图、室内参考"
        />
      </label>

      <label className="material-manager-field">
        <span>项目简介</span>
        <textarea
          value={description}
          maxLength={180}
          rows={4}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
          placeholder="可选：记录这个文件夹的用途、项目背景、固定画风、客户名称等。"
        />
      </label>

      {draft.error ? <div className="material-manager-form-error">{draft.error}</div> : null}

      <div className="material-manager-form-note">
        后续可继续扩展封面图、颜色标签、常用参考图、项目状态和备注字段；本轮先保留名称与简介，保证整理动作轻快。
      </div>

      <div className="material-manager-reference-actions">
        <button type="submit">
          <Check className="h-3.5 w-3.5" /> 创建文件夹
        </button>
        <button type="button" onClick={onCancel}>
          <X className="h-3.5 w-3.5" /> 取消
        </button>
      </div>
    </form>
  );
}

function GroupDetail({
  group,
  historyById,
  onDelete,
  onOpenSyncDir,
  onRemoveItem,
  onRename,
  onSync,
  syncResult,
  syncing,
}: {
  group: MaterialGroup;
  historyById: Map<string, HistoryItem>;
  onDelete: () => void;
  onOpenSyncDir: (path?: string) => void;
  onRemoveItem: (ref: MaterialRef) => void;
  onRename: () => void;
  onSync: () => void;
  syncResult: MaterialOutputSyncResultLike | null;
  syncing: boolean;
}) {
  const previews = refsToPreviewItems(group.items, historyById);
  return (
    <div className="material-manager-detail-stack">
      <div className="material-manager-detail-head">
        <span className="material-manager-detail-icon"><Folder className="h-4 w-4" /></span>
        <div>
          <h4>{group.name}</h4>
          <p>{group.items.length} 张 · 创建于 {formatDate(group.createdAt)}</p>
        </div>
      </div>

      {group.description ? (
        <p className="material-manager-detail-prompt">{group.description}</p>
      ) : null}

      <div className="material-manager-detail-actions">
        <button type="button" onClick={onRename}>
          <RefreshCw className="h-3.5 w-3.5" /> 重命名
        </button>
        <button type="button" className="danger" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> 删除组
        </button>
      </div>

      <div className="material-manager-sync-panel">
        <div className="material-manager-sync-actions">
          <button type="button" onClick={onSync} disabled={syncing}>
            <RefreshCw className="h-3.5 w-3.5" /> {syncing ? "同步中..." : "同步此文件夹到 output"}
          </button>
          <button type="button" onClick={() => onOpenSyncDir(syncResult?.targetDir)} disabled={!syncResult?.targetDir}>
            <Folder className="h-3.5 w-3.5" /> 打开同步目录
          </button>
        </div>
        {syncResult ? (
          <div className={`material-manager-sync-summary ${syncResult.missing > 0 ? "warn" : ""}`}>
            <strong>已同步 {syncResult.synced} 张 / 缺失 {syncResult.missing} 张</strong>
            <span title={syncResult.targetDir}>{syncResult.targetDir}</span>
            {syncResult.missingItems.length > 0 ? (
              <ul>
                {syncResult.missingItems.slice(0, 3).map((item, index) => (
                  <li key={`${item.historyId}-${index}`}>{item.reason}</li>
                ))}
                {syncResult.missingItems.length > 3 ? <li>还有 {syncResult.missingItems.length - 3} 项缺失</li> : null}
              </ul>
            ) : null}
          </div>
        ) : (
          <div className="material-manager-sync-note">
            复制镜像到 output，不移动原图，也不改变历史记录路径。
          </div>
        )}
      </div>

      <div className="material-manager-detail-thumbs">
        {previews.length === 0 ? (
          <div className="material-manager-empty-list">这个组还是空的，可以把历史图片拖进来。</div>
        ) : (
          previews.map((item) => (
            <div key={item.key} className="material-manager-detail-thumb-wrap">
              <PreviewThumb item={item} />
              {item.ref ? (
                <button type="button" onClick={() => onRemoveItem(item.ref!)} title="移出素材组">
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SmartPromptDetail({
  group,
  onConvert,
}: {
  group: { prompt: string; items: HistoryItem[] };
  onConvert: () => void;
}) {
  return (
    <div className="material-manager-detail-stack">
      <div className="material-manager-detail-head">
        <span className="material-manager-detail-icon"><Sparkles className="h-4 w-4" /></span>
        <div>
          <h4>智能提示词组</h4>
          <p>{group.items.length} 张 · 虚拟分组，不写入历史记录</p>
        </div>
      </div>
      <p className="material-manager-detail-prompt">{group.prompt || "(无 prompt)"}</p>
      <div className="material-manager-reference-actions">
        <button type="button" onClick={onConvert}>
          <FolderPlus className="h-3.5 w-3.5" /> 转为文件夹
        </button>
      </div>
      <div className="material-manager-detail-thumbs">
        {group.items.map((item) => (
          <PreviewThumb key={item.id} item={{ type: "history", key: item.id, history: item }} />
        ))}
      </div>
    </div>
  );
}

function UngroupedDetail({ item }: { item: HistoryItem }) {
  return (
    <div className="material-manager-detail-stack">
      <div className="material-manager-detail-head">
        <span className="material-manager-detail-icon"><ImageIcon className="h-4 w-4" /></span>
        <div>
          <h4>未分组图片</h4>
          <p>{formatDate(item.createdAt)}</p>
        </div>
      </div>
      <p className="material-manager-detail-prompt">{item.prompt || "(无 prompt)"}</p>
      <MaterialDetailImagePreview item={item} />
    </div>
  );
}

function MaterialDetailImagePreview({ item }: { item: HistoryItem }) {
  const blob = item.previewBlob ?? item.imageBlob ?? null;
  const objectURL = useBlobURL(blob, item.imageB64 ?? null);
  const imageSrc = historyPreviewSrc(item, objectURL);
  const state = useImageLoadState(imageSrc || null);
  return (
    <span className="material-manager-detail-preview">
      {imageSrc && state === "ready" ? (
        <img src={imageSrc} alt={item.prompt || "history image"} loading="lazy" decoding="async" />
      ) : (
        <span className="material-manager-detail-preview-fallback" />
      )}
    </span>
  );
}

type PreviewItem =
  | { type: "history"; key: string; ref?: MaterialRef; history: HistoryItem }
  | { type: "source"; key: string; ref?: MaterialRef; source: SourceImage };

function refsToPreviewItems(refs: MaterialRef[], historyById: Map<string, HistoryItem>): PreviewItem[] {
  return refs.flatMap((ref): PreviewItem[] => {
    if (ref.kind === "source") {
      return [{ type: "source", key: `source:${ref.source.path || ref.source.previewUrl || ref.source.name}`, ref, source: ref.source }];
    }
    const history = historyById.get(ref.historyId);
    return history ? [{ type: "history", key: `history:${history.id}`, ref, history }] : [];
  });
}

function HistoryMaterialTile({
  active,
  checked,
  dragIds,
  item,
  multiSelectEnabled,
  onContextMenu,
  onSelect,
}: {
  active: boolean;
  checked: boolean;
  dragIds: string[];
  item: HistoryItem;
  multiSelectEnabled: boolean;
  onContextMenu: (event: React.MouseEvent) => void;
  onSelect: (event: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`material-manager-history-tile ${active ? "active" : ""} ${checked ? "checked" : ""}`}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_HISTORY_IDS, uniqueHistoryIds(dragIds).join(","));
        event.dataTransfer.effectAllowed = "copy";
      }}
      title={item.prompt}
    >
      {multiSelectEnabled ? (
        <span className={`material-manager-checkmark ${checked ? "checked" : ""}`}>
          {checked ? <Check className="h-3.5 w-3.5" /> : null}
        </span>
      ) : null}
      <PreviewThumb item={{ type: "history", key: item.id, history: item }} compact />
      <span>{item.prompt || "(无 prompt)"}</span>
    </button>
  );
}

function MaterialContextMenu({
  count,
  folders,
  onCreateFolder,
  onMoveToFolder,
  onMoveToTarget,
  targetFolder,
  x,
  y,
}: {
  count: number;
  folders: MaterialGroup[];
  onCreateFolder: () => void;
  onMoveToFolder: (groupId: string) => void;
  onMoveToTarget: () => void;
  targetFolder: MaterialGroup | null;
  x: number;
  y: number;
}) {
  const top = Math.min(y, Math.max(24, window.innerHeight - 320));
  const left = Math.min(x, Math.max(24, window.innerWidth - 260));
  return (
    <div
      className="material-manager-context-menu"
      style={{ left, top }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="material-manager-context-title">移动 {count} 张素材</div>
      <button type="button" onClick={onMoveToTarget} disabled={!targetFolder}>
        移动到当前文件夹{targetFolder ? `「${targetFolder.name}」` : ""}
      </button>
      <div className="material-manager-context-divider" />
      {folders.length === 0 ? (
        <span className="material-manager-context-empty">还没有文件夹</span>
      ) : (
        folders.map((group) => (
          <button key={group.id} type="button" onClick={() => onMoveToFolder(group.id)}>
            移动到「{group.name}」
          </button>
        ))
      )}
      <div className="material-manager-context-divider" />
      <button type="button" onClick={onCreateFolder}>
        新建文件夹并移动
      </button>
    </div>
  );
}

function PreviewThumb({
  compact = false,
  index,
  item,
}: {
  compact?: boolean;
  index?: number;
  item: PreviewItem;
}) {
  const source = item.type === "history" ? item.history : item.source;
  const blob = item.type === "history"
    ? (item.history.previewBlob ?? item.history.imageBlob ?? null)
    : (item.source.imageBlob ?? null);
  const objectURL = useBlobURL(blob, source.imageB64 ?? null);
  const imageSrc = historyPreviewSrc(source, objectURL);
  const state = useImageLoadState(imageSrc || null);
  return (
    <span className={`material-manager-thumb ${compact ? "compact" : ""}`} style={index !== undefined ? { zIndex: 10 - index } : undefined}>
      {imageSrc && state === "ready" ? (
        <img src={imageSrc} alt={item.type === "history" ? item.history.prompt : item.source.name} loading="lazy" decoding="async" />
      ) : (
        <span className="material-manager-thumb-fallback" />
      )}
    </span>
  );
}

function formatDate(value: number) {
  if (!Number.isFinite(value)) return "-";
  return new Date(value).toLocaleDateString();
}

function readDraggedHistoryIds(event: React.DragEvent): string[] {
  return uniqueHistoryIds(
    event.dataTransfer
      .getData(DRAG_HISTORY_IDS)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

function uniqueHistoryIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
