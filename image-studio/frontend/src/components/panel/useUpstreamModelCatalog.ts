import { useEffect, useState } from "react";
import { probeCurrentUpstream } from "../../platform/runtime/host";
import { useStudioStore } from "../../state/studioStore";
import type { APIMode } from "../../types/domain";
import { upstreamErrorMessage } from "../../lib/upstreamErrors";

export function useUpstreamModelCatalog(input: {
  profileId: string;
  baseURL: string;
  apiKey: string;
  apiMode: APIMode;
}) {
  const proxyMode = useStudioStore((state) => state.proxyMode);
  const proxyURL = useStudioStore((state) => state.proxyURL);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setModels([]);
    setMessage("");
  }, [input.profileId, input.baseURL, input.apiKey, input.apiMode]);

  const supported = input.apiMode === "responses" || input.apiMode === "images";
  const canFetch = supported && !!input.baseURL.trim() && !!input.apiKey.trim() && !loading;

  async function refresh() {
    if (!supported) {
      setMessage("当前服务类型不提供 OpenAI 兼容的 /v1/models 列表。");
      return [];
    }
    if (!input.baseURL.trim() || !input.apiKey.trim()) {
      setMessage("请先填写 Base URL 和 API Key。");
      return [];
    }
    setLoading(true);
    setMessage("正在读取 /v1/models…");
    try {
      const result = await probeCurrentUpstream(
        input.baseURL,
        input.apiKey,
        proxyMode,
        proxyURL,
        input.apiMode,
      );
      const next = Array.from(new Set((result.models ?? []).map((id) => String(id).trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b))
        .slice(0, 1000);
      setModels(next);
      setMessage(next.length > 0
        ? `已读取 ${next.length} 个模型，可在下方选择或继续手动输入。`
        : "连接成功，但服务商没有返回可选择的模型 ID；仍可手动填写。");
      return next;
    } catch (error: any) {
      setModels([]);
      setMessage(`读取失败：${upstreamErrorMessage(error)}`);
      return [];
    } finally {
      setLoading(false);
    }
  }

  return { canFetch, loading, message, models, refresh, supported };
}
