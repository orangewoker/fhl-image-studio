import { useState } from "react";
import { Settings } from "lucide-react";
import {
  type AspectPresetOption,
  type AspectPreset,
  type ResolutionPreset,
} from "../../../components/panel/sizeCapabilities";
import { Modal } from "../../../components/common/Modal";
import type { APIMode, RequestPolicy } from "../../../types/domain";
import { vibrateForPlatform } from "../bridge";
import {
  AndroidParameterSummary,
  buildAndroidParameterSummaryItems,
} from "./AndroidParameterPrimitives";
import { AndroidParameterEditor } from "./AndroidParameterEditor";

export function AndroidPadParameterSection({
  activeAspect,
  aspectPresets,
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
  isMediumPad,
  needsUpstreamSetup,
  onOpenUpstream,
  quality,
  requestPolicy,
  setField,
  styleTag,
}: {
  activeAspect: AspectPreset;
  aspectPresets: AspectPresetOption[];
  activeAspectLabel: string;
  activeResolution: ResolutionPreset;
  activeResolutionLabel: string;
  activeQualityLabel: string;
  activeStyleLabel: string;
  availableResolutions: ResolutionPreset[];
  apiMode: APIMode;
  batchCount: number;
  handleAspectSelect: (aspect: AspectPreset) => void;
  handleResolutionSelect: (resolution: ResolutionPreset) => void;
  imageModelID: string;
  isMediumPad: boolean;
  needsUpstreamSetup: boolean;
  onOpenUpstream: () => void;
  quality: string;
  requestPolicy: RequestPolicy;
  setField: (key: "quality" | "batchCount" | "styleTag", value: any) => void;
  styleTag: string;
}) {
  const [parametersOpen, setParametersOpen] = useState(false);

  const openParameters = () => {
    vibrateForPlatform(8);
    setParametersOpen(true);
  };
  const summaryItems = buildAndroidParameterSummaryItems({
    activeAspectLabel,
    activeResolutionLabel,
    activeQualityLabel,
    batchCount,
  });

  return (
    <section className={`platform-card android-parameter-card android-pad-parameter-card ${isMediumPad ? "medium" : "expanded"}`}>
      <div className="android-pad-parameter-head">
        <AndroidParameterSummary
          batchCount={batchCount}
          items={summaryItems}
          title={activeStyleLabel}
        />
        <div className="android-pad-parameter-actions">
          <button
            type="button"
            onClick={openParameters}
            className="android-parameter-upstream-button"
          >
            编辑参数
          </button>
          {needsUpstreamSetup ? (
          <button
            type="button"
            onClick={onOpenUpstream}
            className="android-parameter-upstream-button"
          >
            <Settings className="h-4 w-4" />
            打开设置
          </button>
          ) : null}
        </div>
      </div>

      <Modal
        open={parametersOpen}
        onClose={() => setParametersOpen(false)}
        title="创作参数"
        width={780}
      >
        <AndroidParameterEditor
          activeAspect={activeAspect}
          aspectPresets={aspectPresets}
          activeAspectLabel={activeAspectLabel}
          activeResolution={activeResolution}
          activeResolutionLabel={activeResolutionLabel}
          activeQualityLabel={activeQualityLabel}
          activeStyleLabel={activeStyleLabel}
          availableResolutions={availableResolutions}
          apiMode={apiMode}
          batchCount={batchCount}
          handleAspectSelect={handleAspectSelect}
          handleResolutionSelect={handleResolutionSelect}
          imageModelID={imageModelID}
          quality={quality}
          requestPolicy={requestPolicy}
          setField={setField}
          styleTag={styleTag}
        />
      </Modal>
    </section>
  );
}
