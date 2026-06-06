import {
  DeleteStoredAPIKey,
  GetStoredAPIKey,
  SetStoredAPIKey,
} from "../platform/runtime/host";
import type { APIMode, RequestPolicy, UpstreamProfile } from "../types/domain";
import type { StudioState } from "./studioStore.types";
import {
  duplicateProfile as cloneProfile,
  genProfileId,
  keyringUserFor,
  nextDefaultProfileName,
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
      apiMode: APIMode;
      baseURL?: string;
      requestPolicy?: RequestPolicy;
      textModelID?: string;
      imageModelID?: string;
      concurrencyLimit?: number;
      apiKey?: string;
      setActive?: boolean;
    }) {
      const list = store.getState().profiles;
      const id = genProfileId();
      const profile: UpstreamProfile = {
        id,
        name: input.name?.trim() || nextDefaultProfileName(list),
        apiMode: input.apiMode,
        requestPolicy: input.requestPolicy ?? "openai",
        baseURL: cleanBaseURL(input.baseURL ?? ""),
        textModelID: (input.textModelID ?? "").trim(),
        imageModelID: (input.imageModelID ?? "").trim(),
        concurrencyLimit: normalizeConcurrencyLimit(input.concurrencyLimit ?? 0),
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
      const next: UpstreamProfile = {
        ...current,
        name: patch.name !== undefined ? patch.name.trim() : current.name,
        apiMode: patch.apiMode ?? current.apiMode,
        requestPolicy: patch.requestPolicy ?? current.requestPolicy,
        baseURL: patch.baseURL !== undefined ? cleanBaseURL(patch.baseURL) : current.baseURL,
        textModelID: patch.textModelID !== undefined ? patch.textModelID.trim() : current.textModelID,
        imageModelID: patch.imageModelID !== undefined ? patch.imageModelID.trim() : current.imageModelID,
        concurrencyLimit: patch.concurrencyLimit !== undefined
          ? normalizeConcurrencyLimit(patch.concurrencyLimit) : current.concurrencyLimit,
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
        apiKey,
      });
    },
  };
}
