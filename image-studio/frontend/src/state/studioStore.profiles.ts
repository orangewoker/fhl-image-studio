import {
  DeleteStoredAPIKey,
  GetStoredAPIKey,
  SetStoredAPIKey,
} from "../platform/runtime/host";
import type { APIMode, RequestPolicy, UpstreamProfile } from "../types/domain";
import type { StudioState } from "./studioStore.types";
import {
  defaultProfileValuesForAPIMode,
  duplicateProfile as cloneProfile,
  genProfileId,
  keyringUserFor,
  nextDefaultProfileName,
  normalizeFHLImageModelID,
  pickActiveProfile,
} from "../lib/profiles";
import { normalizeAPIKeyInput } from "../lib/apiKey";
import { cleanBaseURL } from "../lib/security";
import { normalizeConcurrencyLimit } from "./workspaceRuntime";
import { persistActiveProfileId, persistProfiles } from "./studioStore.shared";

type StateAdapter = {
  getState: () => StudioState;
  setState: (patch: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void;
};

export function createProfileActions(store: StateAdapter) {
  return {
    async createProfile(input: {
      name?: string;
      providerName?: string;
      apiMode: APIMode;
      baseURL?: string;
      requestPolicy?: RequestPolicy;
      textModelID?: string;
      imageModelID?: string;
      concurrencyLimit?: number;
      imagesNewAPICompat?: boolean;
      apiKey?: string;
      setActive?: boolean;
    }) {
      const list = store.getState().profiles;
      const id = genProfileId();
      const defaults = defaultProfileValuesForAPIMode(input.apiMode);
      const baseURL = cleanBaseURL(input.baseURL ?? defaults.baseURL);
      const profile: UpstreamProfile = {
        id,
        name: input.name?.trim() || nextDefaultProfileName(list),
        providerName: input.providerName?.trim() || "",
        apiMode: input.apiMode,
        requestPolicy: input.requestPolicy ?? defaults.requestPolicy,
        baseURL,
        textModelID: (input.textModelID ?? defaults.textModelID).trim(),
        imageModelID: normalizeFHLImageModelID(baseURL, input.imageModelID ?? defaults.imageModelID),
        concurrencyLimit: normalizeConcurrencyLimit(input.concurrencyLimit ?? 0),
        imagesNewAPICompat: input.apiMode === "images" && input.imagesNewAPICompat === true,
        createdAt: Date.now(),
      };
      const inputAPIKey = normalizeAPIKeyInput(input.apiKey ?? "");
      if (inputAPIKey) {
        try { await SetStoredAPIKey(keyringUserFor(id), inputAPIKey); }
        catch (e: any) {
          if (typeof console !== "undefined") console.error("写 keyring 失败", e);
        }
      }
      const next = [...list, profile];
      persistProfiles(next);
      store.setState({ profiles: next });
      if (input.setActive ?? true) {
        await this.setActiveProfile(id);
      }
      return id;
    },

    async updateProfile(id: string, patch: Partial<Omit<UpstreamProfile, "id" | "createdAt">> & { apiKey?: string }) {
      const list = store.getState().profiles;
      const index = list.findIndex((profile) => profile.id === id);
      if (index < 0) return false;
      const current = list[index];
      const nextAPIMode = patch.apiMode ?? current.apiMode;
      const defaults = defaultProfileValuesForAPIMode(nextAPIMode);
      const shouldApplyModeDefaults = patch.apiMode !== undefined && patch.apiMode !== current.apiMode;
      const nextBaseURL = patch.baseURL !== undefined
        ? cleanBaseURL(patch.baseURL)
        : shouldApplyModeDefaults ? current.baseURL || defaults.baseURL : current.baseURL;
      const requestedImageModelID = patch.imageModelID !== undefined
        ? patch.imageModelID.trim()
        : shouldApplyModeDefaults ? current.imageModelID || defaults.imageModelID : current.imageModelID;
      const next: UpstreamProfile = {
        ...current,
        name: patch.name !== undefined ? patch.name.trim() : current.name,
        providerName: patch.providerName !== undefined ? patch.providerName.trim() : current.providerName,
        apiMode: nextAPIMode,
        requestPolicy: patch.requestPolicy ?? current.requestPolicy,
        baseURL: nextBaseURL,
        textModelID: patch.textModelID !== undefined
          ? patch.textModelID.trim()
          : shouldApplyModeDefaults ? current.textModelID || defaults.textModelID : current.textModelID,
        imageModelID: normalizeFHLImageModelID(nextBaseURL, requestedImageModelID),
        concurrencyLimit: patch.concurrencyLimit !== undefined
          ? normalizeConcurrencyLimit(patch.concurrencyLimit) : current.concurrencyLimit,
        imagesNewAPICompat: (patch.apiMode ?? current.apiMode) === "images"
          ? patch.imagesNewAPICompat ?? current.imagesNewAPICompat ?? false
          : false,
        lastUsedAt: patch.lastUsedAt ?? current.lastUsedAt,
      };
      const nextList = list.map((profile, idx) => (idx === index ? next : profile));
      persistProfiles(nextList);
      store.setState({ profiles: nextList });
      if (patch.apiKey !== undefined) {
        try { await SetStoredAPIKey(keyringUserFor(id), normalizeAPIKeyInput(patch.apiKey)); }
        catch (e: any) {
          if (typeof console !== "undefined") console.error("写 keyring 失败", e);
        }
      }
      if (id === store.getState().activeProfileId) {
        const apiKey = patch.apiKey !== undefined ? normalizeAPIKeyInput(patch.apiKey) : store.getState().apiKey;
        store.setState({
          apiMode: next.apiMode,
          requestPolicy: next.requestPolicy,
          baseURL: next.baseURL,
          textModelID: next.textModelID,
          imageModelID: next.imageModelID,
          imagesNewAPICompat: next.imagesNewAPICompat ?? false,
          apiKey,
        });
      }
      return true;
    },

    async deleteProfile(id: string) {
      const list = store.getState().profiles;
      const index = list.findIndex((profile) => profile.id === id);
      if (index < 0) return;
      const nextList = list.filter((_, i) => i !== index);
      persistProfiles(nextList);
      try { await DeleteStoredAPIKey(keyringUserFor(id)); }
      catch (e: any) {
        if (typeof console !== "undefined") console.warn("删 keyring 项失败(继续)", e);
      }
      store.setState({ profiles: nextList });
      if (store.getState().activeProfileId === id) {
        const fallback = pickActiveProfile(nextList, "");
        if (fallback) {
          await this.setActiveProfile(fallback.id);
        } else {
          persistActiveProfileId("");
          store.setState({
            profiles: nextList,
            activeProfileId: "",
            apiKey: "",
            baseURL: "",
            textModelID: "",
            imageModelID: "",
            apiMode: "responses",
            requestPolicy: "openai",
            imagesNewAPICompat: false,
            upstreamModalOpen: false,
            settingsOpen: true,
            upstreamReturnTarget: "settings",
          });
        }
      }
    },

    async duplicateProfile(id: string) {
      const current = store.getState().profiles.find((profile) => profile.id === id);
      if (!current) return null;
      const cloned = cloneProfile(current);
      try {
        const existingKey = await GetStoredAPIKey(keyringUserFor(id)).catch(() => "");
        if (existingKey) {
          await SetStoredAPIKey(keyringUserFor(cloned.id), existingKey);
        }
      } catch {}
      const next = [...store.getState().profiles, cloned];
      persistProfiles(next);
      store.setState({ profiles: next });
      return cloned.id;
    },

    async setActiveProfile(id: string) {
      const profile = store.getState().profiles.find((p) => p.id === id);
      if (!profile) return;
      persistActiveProfileId(id);
      const apiKey = await GetStoredAPIKey(keyringUserFor(id)).catch(() => "");
      const refreshed: UpstreamProfile = { ...profile, lastUsedAt: Date.now() };
      const nextProfiles = store.getState().profiles.map((p) => p.id === id ? refreshed : p);
      persistProfiles(nextProfiles);
      store.setState({
        profiles: nextProfiles,
        activeProfileId: id,
        apiMode: profile.apiMode,
        requestPolicy: profile.requestPolicy,
        baseURL: profile.baseURL,
        textModelID: profile.textModelID,
        imageModelID: profile.imageModelID,
        imagesNewAPICompat: profile.apiMode === "images" && profile.imagesNewAPICompat === true,
        apiKey,
      });
    },
  };
}
