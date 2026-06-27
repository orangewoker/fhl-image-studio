import type { APIMode, UpstreamProfile } from "../types/domain";

export type PromptTextProvider = "apimart" | "responses" | "current" | "none";

export interface PromptTextCapability {
  available: boolean;
  provider: PromptTextProvider;
  label: string;
  reason: string;
  profile?: UpstreamProfile;
}

export interface PromptTextCapabilityInput {
  apiMode: APIMode;
  apiKey: string;
  baseURL: string;
  textModelID: string;
  profiles: UpstreamProfile[];
}

const UNAVAILABLE_TEXT_MODEL_REASON = "未配置可用文本模型；APIMart 可填写文本模型 ID，或借用 Responses/FHL 配置";

function clean(value: string | undefined): string {
  return String(value || "").trim();
}

function textModelLabel(modelID: string): string {
  return clean(modelID) || "默认文本模型";
}

function firstResponsesProfile(profiles: UpstreamProfile[]): UpstreamProfile | undefined {
  return profiles.find((profile) => profile.apiMode === "responses" && clean(profile.baseURL));
}

function responsesCapability(profile: UpstreamProfile): PromptTextCapability {
  return {
    available: true,
    provider: "responses",
    label: `借用 Responses/FHL 文本配置：${textModelLabel(profile.textModelID)}`,
    reason: "",
    profile,
  };
}

export function resolvePromptTextCapability(input: PromptTextCapabilityInput): PromptTextCapability {
  const apiKey = clean(input.apiKey);
  const baseURL = clean(input.baseURL);
  const textModelID = clean(input.textModelID);
  const fallbackResponses = firstResponsesProfile(input.profiles);

  if (input.apiMode === "runninghub") {
    if (fallbackResponses) return responsesCapability(fallbackResponses);
    return {
      available: false,
      provider: "none",
      label: "未配置可用文本模型",
      reason: "RunningHub 当前只负责图像生成；提示词优化和反推会借用 Responses/FHL 文本配置。",
    };
  }

  if (input.apiMode === "apimart") {
    if (apiKey && baseURL && textModelID) {
      return {
        available: true,
        provider: "apimart",
        label: `APIMart 文本模型：${textModelID}`,
        reason: "",
      };
    }
    if (fallbackResponses) return responsesCapability(fallbackResponses);
    return {
      available: false,
      provider: "none",
      label: "未配置可用文本模型",
      reason: UNAVAILABLE_TEXT_MODEL_REASON,
    };
  }

  if (input.apiMode === "responses" && apiKey && baseURL) {
    return {
      available: true,
      provider: "current",
      label: `Responses 文本模型：${textModelLabel(textModelID)}`,
      reason: "",
    };
  }

  if (fallbackResponses) return responsesCapability(fallbackResponses);

  if (apiKey && baseURL) {
    return {
      available: true,
      provider: "current",
      label: `当前配置文本模型：${textModelLabel(textModelID)}`,
      reason: "",
    };
  }

  return {
    available: false,
    provider: "none",
    label: "未配置可用文本模型",
    reason: UNAVAILABLE_TEXT_MODEL_REASON,
  };
}
