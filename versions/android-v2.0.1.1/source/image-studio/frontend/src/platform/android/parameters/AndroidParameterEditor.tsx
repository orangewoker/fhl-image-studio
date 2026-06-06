import type { QualityValue } from "../../../types/domain";
import { QUALITY_TIERS } from "../../../components/panel/panelOptions";
import { vibrateForPlatform } from "../bridge";
import {
  RESOLUTION_PRESETS,
  sizeCapabilityHint,
  type AspectPreset,
  type ResolutionPreset,
} from "../../../components/panel/sizeCapabilities";
import { ANDROID_BATCH_COUNT_OPTIONS } from "./parameterOptions";
import {
  AndroidAspectGrid,
  AndroidDiscreteSlider,
  AndroidParameterBlock,
  AndroidParameterEditorShell,
  AndroidParameterSummary,
  AndroidSegmentedChoices,
  AndroidStyleChips,
  buildAndroidParameterSummaryItems,
} from "./AndroidParameterPrimitives";

export function AndroidParameterEditor({
  activeAspect,
  activeAspectLabel,
  activeResolution,
  activeResolutionLabel,
  activeQualityLabel,
  activeStyleLabel,
  availableResolutions,
  apiMode,
  batchCount,
  handleAspectSelect,
  handleResolutionSelect,
  imageModelID,
  quality,
  requestPolicy,
  onSave,
  setField,
  styleTag,
}: {
  activeAspect: AspectPreset;
  activeAspectLabel: string;
  activeResolution: ResolutionPreset;
  activeResolutionLabel: string;
  activeQualityLabel: string;
  activeStyleLabel: string;
  availableResolutions: ResolutionPreset[];
  apiMode: "responses" | "images";
  batchCount: number;
  handleAspectSelect: (aspect: AspectPreset) => void;
  handleResolutionSelect: (resolution: ResolutionPreset) => void;
  imageModelID: string;
  quality: string;
  requestPolicy: "openai" | "compat";
  onSave: () => void;
  setField: (key: "quality" | "styleTag" | "batchCount", value: any) => void;
  styleTag: string;
}) {
  const resolutionHint = sizeCapabilityHint({ apiMode, requestPolicy, imageModelID });
  const summaryItems = buildAndroidParameterSummaryItems({
    activeAspectLabel,
    activeResolutionLabel,
    activeQualityLabel,
    batchCount,
  });

  return (
    <AndroidParameterEditorShell
      summary={(
        <AndroidParameterSummary
          batchCount={batchCount}
          items={summaryItems}
          title={styleTag ? activeStyleLabel : "默认风格"}
        />
      )}
    >
      <AndroidParameterBlock
        title="风格"
        trailing={styleTag ? (
          <button type="button" onClick={() => setField("styleTag", "")}>清除</button>
        ) : null}
      >
        <AndroidStyleChips
          value={styleTag}
          onChange={(next) => setField("styleTag", next)}
        />
      </AndroidParameterBlock>

      <AndroidParameterBlock title="画幅比例">
        <AndroidAspectGrid value={activeAspect} onChange={handleAspectSelect} />
      </AndroidParameterBlock>

      <AndroidDiscreteSlider
        label="分辨率"
        value={activeResolution}
        options={RESOLUTION_PRESETS.filter((item) => availableResolutions.includes(item.value))}
        onChange={handleResolutionSelect}
        note={resolutionHint}
      />

      <AndroidParameterBlock title="画面质量">
        <AndroidSegmentedChoices
          columns={2}
          options={QUALITY_TIERS.map((item) => ({ ...item, hint: qualityHint(item.value) }))}
          value={quality as QualityValue}
          onChange={(next) => setField("quality", next)}
        />
      </AndroidParameterBlock>

      <AndroidDiscreteSlider
        label="出图张数"
        value={batchCount}
        options={ANDROID_BATCH_COUNT_OPTIONS}
        onChange={(next) => setField("batchCount", next)}
        valueSuffix="张"
      />

      <div className="android-parameter-save-bar">
        <button
          type="button"
          className="android-parameter-save-button"
          onClick={() => {
            vibrateForPlatform(8);
            onSave();
          }}
        >
          保存设置
        </button>
      </div>
    </AndroidParameterEditorShell>
  );
}

function qualityHint(value: QualityValue) {
  switch (value) {
    case "low":
      return "更快";
    case "medium":
      return "均衡";
    case "high":
      return "细节";
    default:
      return "上游";
  }
}
