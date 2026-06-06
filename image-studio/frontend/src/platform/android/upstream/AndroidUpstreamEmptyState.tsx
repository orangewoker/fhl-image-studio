import { Boxes, Plus, RadioTower } from "lucide-react";
import type { APIMode } from "../../../types/domain";
import { ANDROID_API_MODE_OPTIONS } from "./useAndroidUpstreamConfig";

export function AndroidUpstreamEmptyState({
  onCreate,
}: {
  onCreate: (apiMode: APIMode) => void | Promise<void>;
}) {
  return (
    <section className="android-upstream-empty">
      <div className="android-upstream-empty-icon">
        <RadioTower className="h-5 w-5" />
      </div>
      <div className="android-upstream-empty-copy">
        <h4>添加第一个上游</h4>
        <p>保存中转站根地址和 API Key 后，生成、编辑和提示词优化都会走当前配置。</p>
      </div>
      <div className="android-upstream-create-grid">
        {ANDROID_API_MODE_OPTIONS.map((option) => (
          <button key={option.id} type="button" onClick={() => onCreate(option.id)}>
            <span className="android-upstream-create-icon">
              {option.id === "responses" ? <RadioTower className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
            </span>
            <span>
              <strong>{option.title}</strong>
              <small>{option.meta}</small>
            </span>
            <Plus className="h-4 w-4" />
          </button>
        ))}
      </div>
    </section>
  );
}
