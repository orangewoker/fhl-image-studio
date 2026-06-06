import type { Dispatch, SetStateAction } from "react";
import {
  type AspectPreset,
  type ResolutionPreset,
} from "../../../components/panel/sizeCapabilities";
import { Modal } from "../../../components/common/Modal";
import { vibrateForPlatform } from "../bridge";
import {
  AndroidParameterSummary,
  buildAndroidParameterSummaryItems,
} from "./AndroidParameterPrimitives";
import { AndroidParameterEditor } from "./AndroidParameterEditor";

export function AndroidPhoneParameterSection({
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
  parametersOpen,
  quality,
  requestPolicy,
  setField,
  setParametersOpen,
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
  parametersOpen: boolean;
  quality: string;
  requestPolicy: "openai" | "compat";
  setField: (key: "quality" | "styleTag" | "batchCount", value: any) => void;
  setParametersOpen: Dispatch<SetStateAction<boolean>>;
  styleTag: string;
}) {
  const toggleParameters = () => {
    vibrateForPlatform(8);
    setParametersOpen((current) => !current);
  };
  const summaryItems = buildAndroidParameterSummaryItems({
    activeAspectLabel,
    activeResolutionLabel,
    activeQualityLabel,
    batchCount,
  });

  return (
    <section className="platform-card android-parameter-card android-phone-parameter-card">
      <AndroidParameterSummary
        batchCount={batchCount}
        items={summaryItems}
        onClick={toggleParameters}
        open={parametersOpen}
        title={styleTag ? activeStyleLabel : "默认风格"}
      />

      <Modal
        open={parametersOpen}
        onClose={() => setParametersOpen(false)}
        title="创作参数"
        width={720}
      >
        <AndroidParameterEditor
          activeAspect={activeAspect}
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
          onSave={() => setParametersOpen(false)}
          setField={setField}
          styleTag={styleTag}
        />
      </Modal>
    </section>
  );
}
