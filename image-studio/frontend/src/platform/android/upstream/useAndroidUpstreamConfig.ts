import { useEffect, useMemo, useState } from "react";
import { ensureAPIMartAsyncProfile, focusAPIMartAPIKeyInput } from "../../../lib/apimartAPI";
import { ensureFHLResponsesProfile, focusFHLAPIKeyInput } from "../../../lib/fhlAPI";
import { RUNNINGHUB_BASE_URL, keyringUserFor } from "../../../lib/profiles";
import { ensureRunningHubProfiles } from "../../../lib/runninghubAPI";
import { useStudioStore } from "../../../state/studioStore";
import type { APIMode, RequestPolicy, UpstreamProfile } from "../../../types/domain";
import { GetStoredAPIKey } from "../../runtime/host";

export type AndroidUpstreamModeId = APIMode;

export const ANDROID_UPSTREAM_MODE_OPTIONS: Array<{
  id: AndroidUpstreamModeId;
  title: string;
  meta: string;
}> = [
  { id: "responses", title: "一键配置 FHL Responses", meta: "SSE 保活 / gpt-5.5 + gpt-image-2 / 不内置 API Key" },
  { id: "apimart", title: "一键配置 APIMart 异步", meta: "推荐异步 task_id 参数 / 不内置 API Key" },
  { id: "runninghub", title: "一键配置 RH", meta: "桥接 8117 / banana2 + image_g2 / 安卓端不写 RH Key" },
];

export const ANDROID_API_MODE_OPTIONS: Array<{
  id: APIMode;
  title: string;
  meta: string;
}> = [
  { id: "responses", title: "Responses API", meta: "SSE 保活" },
  { id: "images", title: "Images API", meta: "标准图像端点" },
  { id: "apimart", title: "APIMart 异步", meta: "task_id 异步轮询" },
  { id: "runninghub", title: "RunningHub", meta: "本地桥接，文生图 / 图生图" },
];

export const ANDROID_REQUEST_POLICY_OPTIONS: Array<{
  id: RequestPolicy;
  title: string;
  meta: string;
}> = [
  { id: "openai", title: "OpenAI 标准", meta: "只发送公开字段" },
  { id: "compat", title: "兼容中转扩展", meta: "允许中转扩展字段" },
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

  function loadKeyForProfile(profileId: string) {
    let cancelled = false;
    setDraftKey("");
    setShowKey(false);
    setSavedKeyLoaded(false);

    GetStoredAPIKey(keyringUserFor(profileId))
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
  }

  function selectProfileForEditing(profileId: string) {
    const nextProfile = useStudioStore.getState().profiles.find((profile) => profile.id === profileId) ?? null;
    setSelectedId(profileId);
    setDraft(nextProfile ? { ...nextProfile } : null);
    if (nextProfile) {
      loadKeyForProfile(nextProfile.id);
    } else {
      setDraftKey("");
      setShowKey(false);
      setSavedKeyLoaded(true);
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    const nextSelectedId = selectedId && profiles.some((profile) => profile.id === selectedId)
      ? selectedId
      : activeProfileId || profiles[0]?.id || "";

    if (nextSelectedId !== selectedId) {
      setSelectedId(nextSelectedId);
      return undefined;
    }

    const selected = profiles.find((profile) => profile.id === nextSelectedId) ?? null;
    setDraft(selected ? { ...selected } : null);
    setDraftKey("");
    setShowKey(false);
    setSavedKeyLoaded(false);

    if (!selected) {
      setSavedKeyLoaded(true);
      return undefined;
    }

    return loadKeyForProfile(selected.id);
  }, [activeProfileId, open, profiles, selectedId]);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [activeProfileId, profiles],
  );

  const baseURLError = useMemo(() => null, [draft]);

  const canSave = !!draft
    && !!draft.name.trim()
    && !!draft.baseURL.trim()
    && (draft.apiMode === "runninghub" || !!draftKey.trim())
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
    selectProfileForEditing(id);
  }

  async function handleUseExistingFHLAPI() {
    const id = await ensureFHLResponsesProfile(useStudioStore.getState());
    selectProfileForEditing(id);
    pushToast("FHL Responses profile ready. Paste your API key to test.", "success", 4200);
    focusFHLAPIKeyInput();
  }

  async function handleUseExistingAPIMartAPI() {
    const id = await ensureAPIMartAsyncProfile(useStudioStore.getState());
    selectProfileForEditing(id);
    pushToast("APIMart async profile ready. Paste your API key to test.", "success", 4600);
    focusAPIMartAPIKeyInput();
  }

  async function handleUseExistingRunningHubAPI() {
    const ids = await ensureRunningHubProfiles(useStudioStore.getState(), RUNNINGHUB_BASE_URL);
    selectProfileForEditing(ids.banana2Id);
    pushToast("RH bridge profiles ready. Emulator uses 10.0.2.2:8117 by default.", "success", 5200);
  }

  async function handleDuplicate() {
    if (!selectedId) return;
    const id = await duplicateProfile(selectedId);
    if (id) {
      selectProfileForEditing(id);
      pushToast("Profile duplicated.", "success");
    }
  }

  async function handleDelete() {
    if (!draft) return;
    if (!window.confirm(`Delete "${draft.name}" and its stored API key?`)) return;
    await deleteProfile(draft.id);
    const remaining = useStudioStore.getState().profiles;
    setSelectedId(remaining[0]?.id ?? "");
    pushToast("Profile deleted.", "success");
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
        imagesNewAPICompat: draft.apiMode === "images" && draft.imagesNewAPICompat === true,
        apiKey: draft.apiMode === "runninghub" ? "" : draftKey.trim(),
      });
      if (ok) pushToast("Profile saved.", "success");
      return ok;
    } finally {
      setSaving(false);
    }
  }

  async function handleSetActive() {
    if (!draft) return;
    await setActiveProfile(draft.id);
    pushToast("Active profile switched.", "success");
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
    handleUseExistingAPIMartAPI,
    handleUseExistingFHLAPI,
    handleUseExistingRunningHubAPI,
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
