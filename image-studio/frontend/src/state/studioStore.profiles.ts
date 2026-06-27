import {
  DeleteStoredAPIKey,
  GetStoredAPIKey,
  SetStoredAPIKey,
} from "../platform/runtime/host";
import type { APIMode, RequestPolicy, UpstreamProfile } from "../types/domain";
import type { StudioState } from "./studioStore.types";
import {
  DEFAULT_CONCURRENCY_LIMIT,
  duplicateProfile as cloneProfile,
  FHL_BASE_URL,
  FHL_IMAGE_MODEL_ID,
  genProfileId,
  keyringUserFor,
  nextDefaultProfileName,
  normalizeAPIMartBaseURL,
  pickActiveProfile,
} from "../lib/profiles";
import { normalizeAPIKeyInput } from "../lib/apiKey";
import { syncCLIConfigQuietly, type CLIConfigSyncInput } from "../lib/cliConfigSync";
import { cleanBaseURL } from "../lib/security";
import { normalizeConcurrencyLimit } from "./workspaceRuntime";
import { persistActiveProfileId, persistProfiles } from "./studioStore.shared";

type StateAdapter = {
  getState: () => StudioState;
  setState: (patch: Partial<StudioState> | ((state: StudioState) => Partial<StudioState>)) => void;
};

function cleanProfileBaseURL(apiMode: APIMode, value: string): string {
  const cleaned = cleanBaseURL(value);
  return apiMode === "apimart" ? normalizeAPIMartBaseURL(cleaned) : cleaned;
}

function isFHLProfileConfig(profile: Pick<UpstreamProfile, "baseURL" | "imageModelID">): boolean {
  return cleanBaseURL(profile.baseURL) === FHL_BASE_URL && profile.imageModelID.trim() === FHL_IMAGE_MODEL_ID;
}

function cliConfigFromProfileState(
  state: StudioState,
  profile: UpstreamProfile,
  apiKey: string,
): CLIConfigSyncInput {
  return {
    apiKey,
    baseURL: profile.baseURL,
    apiMode: profile.apiMode,
    requestPolicy: profile.requestPolicy,
    imagesNewAPICompat: profile.apiMode === "images" && (profile.imagesNewAPICompat ?? false) === true,
    textModelID: profile.textModelID,
    imageModelID: profile.imageModelID,
    outputFormat: state.outputFormat,
    quality: state.quality,
    size: state.size,
    partialImages: 1,
  };
}
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
      imagesNewAPICompat?: boolean;
      apiKey?: string;
      setActive?: boolean;
    }) {
      const list = store.getState().profiles;
      const id = genProfileId();
      const rawProfile: UpstreamProfile = {
        id,
        name: input.name?.trim() || nextDefaultProfileName(list),
        apiMode: input.apiMode,
        requestPolicy: input.requestPolicy ?? "openai",
        baseURL: cleanProfileBaseURL(input.apiMode, input.baseURL ?? ""),
        textModelID: (input.textModelID ?? "").trim(),
        imageModelID: (input.imageModelID ?? "").trim(),
        concurrencyLimit: normalizeConcurrencyLimit(input.concurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT),
        imagesNewAPICompat: input.apiMode === "images" && input.imagesNewAPICompat === true,
        createdAt: Date.now(),
      };
      const profile: UpstreamProfile = isFHLProfileConfig(rawProfile)
        ? {
            ...rawProfile,
            requestPolicy: "openai",
            imagesNewAPICompat: rawProfile.apiMode === "images" && rawProfile.imagesNewAPICompat === true,
          }
        : rawProfile;
      const inputAPIKey = normalizeAPIKeyInput(input.apiKey ?? "");
      if (inputAPIKey) {
        try { await SetStoredAPIKey(keyringUserFor(id), inputAPIKey); }
        catch (e: any) {
          if (typeof console !== "undefined") console.error("鍐?keyring 澶辫触", e);
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
      const nextApiMode = patch.apiMode ?? current.apiMode;
      const rawNext: UpstreamProfile = {
        ...current,
        name: patch.name !== undefined ? patch.name.trim() : current.name,
        apiMode: nextApiMode,
        requestPolicy: patch.requestPolicy ?? current.requestPolicy,
        baseURL: patch.baseURL !== undefined ? cleanProfileBaseURL(nextApiMode, patch.baseURL) : cleanProfileBaseURL(nextApiMode, current.baseURL),
        textModelID: patch.textModelID !== undefined ? patch.textModelID.trim() : current.textModelID,
        imageModelID: patch.imageModelID !== undefined ? patch.imageModelID.trim() : current.imageModelID,
        concurrencyLimit: patch.concurrencyLimit !== undefined
          ? normalizeConcurrencyLimit(patch.concurrencyLimit) : current.concurrencyLimit,
        imagesNewAPICompat: nextApiMode === "images"
          ? patch.imagesNewAPICompat ?? current.imagesNewAPICompat ?? false
          : false,
        lastUsedAt: patch.lastUsedAt ?? current.lastUsedAt,
      };
      const next: UpstreamProfile = isFHLProfileConfig(rawNext)
        ? {
            ...rawNext,
            requestPolicy: "openai",
            imagesNewAPICompat: rawNext.apiMode === "images" && rawNext.imagesNewAPICompat === true,
          }
        : rawNext;
      const nextList = list.map((profile, idx) => (idx === index ? next : profile));
      persistProfiles(nextList);
      store.setState({ profiles: nextList });
      if (patch.apiKey !== undefined) {
        try { await SetStoredAPIKey(keyringUserFor(id), normalizeAPIKeyInput(patch.apiKey)); }
        catch (e: any) {
          if (typeof console !== "undefined") console.error("鍐?keyring 澶辫触", e);
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
        syncCLIConfigQuietly(cliConfigFromProfileState(store.getState(), next, apiKey));
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
        if (typeof console !== "undefined") console.warn("鍒?keyring 椤瑰け璐?缁х画)", e);
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
      const before = store.getState();
      const profile = before.profiles.find((p) => p.id === id);
      if (!profile) return;
      persistActiveProfileId(id);
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
        imagesNewAPICompat: profile.imagesNewAPICompat ?? false,
        apiKey: "",
      });
      const apiKey = await GetStoredAPIKey(keyringUserFor(id)).catch(() => "");
      if (store.getState().activeProfileId === id) {
        store.setState({ apiKey });
        syncCLIConfigQuietly(cliConfigFromProfileState(store.getState(), refreshed, apiKey));
      }
    },
  };
}


