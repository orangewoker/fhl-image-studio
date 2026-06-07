import { useEffect, useMemo, useState } from "react";
import { GetStoredAPIKey } from "../../runtime/host";
import { keyringUserFor } from "../../../lib/profiles";
import { useStudioStore } from "../../../state/studioStore";
import type { APIMode, RequestPolicy, UpstreamProfile } from "../../../types/domain";

export const ANDROID_API_MODE_OPTIONS: Array<{
  id: APIMode;
  title: string;
  meta: string;
}> = [
  { id: "responses", title: "Responses", meta: "SSE 长任务" },
  { id: "images", title: "Images", meta: "标准图像接口" },
];

export const ANDROID_REQUEST_POLICY_OPTIONS: Array<{
  id: RequestPolicy;
  title: string;
  meta: string;
}> = [
  { id: "openai", title: "OpenAI 标准", meta: "只发送公开字段" },
  { id: "compat", title: "兼容中转", meta: "允许 relay 扩展字段" },
];

export function useAndroidUpstreamConfig(open: boolean) {
  const {
    profiles,
    activeProfileId,
    createProfile,
    updateProfile,
    deleteProfile,
    duplicateProfile,
    setActiveProfile,
    testAPIKey,
    isTestingKey,
    pushToast,
  } = useStudioStore();

  const [selectedId, setSelectedId] = useState(activeProfileId);
  const [draft, setDraft] = useState<UpstreamProfile | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savedKeyLoaded, setSavedKeyLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextSelectedId = selectedId && profiles.some((profile) => profile.id === selectedId)
      ? selectedId
      : activeProfileId || profiles[0]?.id || "";

    if (nextSelectedId !== selectedId) {
      setSelectedId(nextSelectedId);
      return;
    }

    const selected = profiles.find((profile) => profile.id === nextSelectedId) ?? null;
    setDraft(selected ? { ...selected } : null);
    setDraftKey("");
    setShowKey(false);
    setSavedKeyLoaded(false);

    if (!selected) {
      setSavedKeyLoaded(true);
      return;
    }

    let cancelled = false;
    GetStoredAPIKey(keyringUserFor(selected.id))
      .then((key) => {
        if (cancelled) return;
        setDraftKey(key ?? "");
        setSavedKeyLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setSavedKeyLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [activeProfileId, open, profiles, selectedId]);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [activeProfileId, profiles],
  );

  const baseURLError = useMemo(() => null, [draft]);

  const canSave = !!draft
    && !!draft.name.trim()
    && !!draft.baseURL.trim()
    && !!draftKey.trim()
    && savedKeyLoaded
    && !saving;

  function patchDraft(patch: Partial<UpstreamProfile>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleNew(apiMode: APIMode = "responses") {
    const id = await createProfile({
      apiMode,
      requestPolicy: "openai",
      setActive: profiles.length === 0,
    });
    setSelectedId(id);
  }

  async function handleDuplicate() {
    if (!selectedId) return;
    const id = await duplicateProfile(selectedId);
    if (id) {
      setSelectedId(id);
      pushToast("已复制上游配置", "success");
    }
  }

  async function handleDelete() {
    if (!draft) return;
    if (!window.confirm(`确认删除「${draft.name}」配置? 对应的 API Key 也会从系统凭据存储清除。`)) return;
    await deleteProfile(draft.id);
    const remaining = useStudioStore.getState().profiles;
    setSelectedId(remaining[0]?.id ?? "");
    pushToast("已删除上游配置", "success");
  }

  async function handleSave() {
    if (!draft || !canSave) return false;
    setSaving(true);
    try {
      const ok = await updateProfile(draft.id, {
        name: draft.name,
        apiMode: draft.apiMode,
        requestPolicy: draft.requestPolicy,
        baseURL: draft.baseURL,
        textModelID: draft.textModelID,
        imageModelID: draft.imageModelID,
        concurrencyLimit: draft.concurrencyLimit,
        apiKey: draftKey.trim(),
      });
      if (ok) pushToast("已保存上游配置", "success");
      return ok;
    } finally {
      setSaving(false);
    }
  }

  async function handleSetActive() {
    if (!draft) return;
    await setActiveProfile(draft.id);
    pushToast("已切换当前上游", "success");
  }

  async function handleSaveAndSetActive(onSaved?: () => void) {
    if (!draft) return;
    const draftId = draft.id;
    const saved = await handleSave();
    if (saved && draftId !== activeProfileId) {
      await setActiveProfile(draftId);
    }
    if (saved) onSaved?.();
  }

  async function handleSaveAndTest(onSaved?: () => void) {
    const saved = await handleSave();
    if (!saved || !draft) return;
    if (draft.id !== useStudioStore.getState().activeProfileId) {
      await setActiveProfile(draft.id);
    }
    onSaved?.();
    setTimeout(() => { void testAPIKey(); }, 0);
  }

  return {
    activeProfile,
    activeProfileId,
    baseURLError,
    canSave,
    draft,
    draftKey,
    handleDelete,
    handleDuplicate,
    handleNew,
    handleSave,
    handleSaveAndSetActive,
    handleSaveAndTest,
    handleSetActive,
    isTestingKey,
    patchDraft,
    profiles,
    savedKeyLoaded,
    saving,
    selectedId,
    setDraftKey,
    setSelectedId,
    setShowKey,
    showKey,
  };
}
