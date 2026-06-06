import type {
  JobGroupSnapshot,
  JobSlotSnapshot,
  Mode,
  OutputFormatValue,
  QualityValue,
  RequestPolicy,
  SizeValue,
} from "../../types/domain.ts";

export const BROWSER_JOB_PROXY_PREFIX = "/__image-studio-jobs";
export const BROWSER_JOB_REGISTRY_FILENAME = "browser-jobs.v1.json";
export const MAX_BROWSER_JOB_GROUPS = 50;

export type BrowserJobEvent =
  | { type: "snapshot"; slot: JobSlotSnapshot; group: JobGroupSnapshot }
  | { type: "terminal"; slot: JobSlotSnapshot; group: JobGroupSnapshot }
  | { type: "cancelled"; slot: JobSlotSnapshot; group: JobGroupSnapshot }
  | { type: "error"; slot: JobSlotSnapshot; group: JobGroupSnapshot };

export interface BrowserJobSubmitPayload {
  workspaceId: string;
  mode: Mode;
  prompt: string;
  size: SizeValue;
  quality: QualityValue;
  outputFormat: OutputFormatValue;
  batchCount: number;
  seed: number;
  negativePrompt: string;
  styleTag?: string;
  sourceImagePaths?: string[];
  maskB64?: string;
  apiKey: string;
  baseURL: string;
  apiMode: "responses" | "images";
  requestPolicy: RequestPolicy;
  textModelID: string;
  imageModelID: string;
}

export interface BrowserJobSubmitResponse {
  groupId: string;
  jobIds: string[];
  group: JobGroupSnapshot;
}

export interface BrowserJobListResponse {
  workspaceId: string;
  groups: JobGroupSnapshot[];
}

export interface BrowserJobCancelPayload {
  jobIds: string[];
}

export interface BrowserJobCancelResponse {
  cancelledJobIds: string[];
}

export interface BrowserJobRegistry {
  version: 1;
  updatedAt: number;
  groups: JobGroupSnapshot[];
}

export function emptyJobStatusSummary() {
  return {
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    interrupted: 0,
  };
}

export function summarizeJobStatuses(slots: JobSlotSnapshot[]) {
  const summary = emptyJobStatusSummary();
  for (const slot of slots) {
    summary[slot.status] += 1;
  }
  return summary;
}

export function sortJobGroupsNewestFirst(groups: JobGroupSnapshot[]) {
  return [...groups].sort((a, b) => b.createdAt - a.createdAt);
}
