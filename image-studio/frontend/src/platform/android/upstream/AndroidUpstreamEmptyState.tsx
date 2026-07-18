import { RadioTower } from "lucide-react";

export function AndroidUpstreamEmptyState() {
  return (
    <section className="android-upstream-empty">
      <div className="android-upstream-empty-icon">
        <RadioTower className="h-5 w-5" />
      </div>
      <div className="android-upstream-empty-copy">
        <h4>添加第一个上游</h4>
        <p>
          可选择 FHL、OpenAI 标准 v1、APIMart 或 RunningHub。
          自定义服务商请选择 OpenAI 标准 v1，再填写 Base URL、API Key 并拉取模型列表。
        </p>
      </div>
    </section>
  );
}
