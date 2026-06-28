import { useState } from "react";
import { Modal } from "../../../components/common/Modal";
import { APIMartAPIChoiceModal } from "../../../components/panel/APIMartAPIChoiceModal";
import { FHLAPIChoiceModal } from "../../../components/panel/FHLAPIChoiceModal";
import { AndroidUpstreamEmptyState } from "./AndroidUpstreamEmptyState";
import { AndroidUpstreamHeader } from "./AndroidUpstreamHeader";
import { AndroidUpstreamProfileForm } from "./AndroidUpstreamProfileForm";
import { AndroidUpstreamProfileRail } from "./AndroidUpstreamProfileRail";
import { useAndroidUpstreamConfig } from "./useAndroidUpstreamConfig";

export function AndroidUpstreamConfigModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const upstream = useAndroidUpstreamConfig(open);
  const [fhlChoiceOpen, setFHLChoiceOpen] = useState(false);
  const [apimartChoiceOpen, setAPIMartChoiceOpen] = useState(false);

  async function handleUseExistingFHLAPI() {
    setFHLChoiceOpen(false);
    await upstream.handleUseExistingFHLAPI();
  }

  async function handleUseExistingAPIMartAPI() {
    setAPIMartChoiceOpen(false);
    await upstream.handleUseExistingAPIMartAPI();
  }

  async function handleUseExistingRunningHubAPI() {
    await upstream.handleUseExistingRunningHubAPI();
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="上游配置" width={880}>
        <div className="android-upstream-panel">
          <AndroidUpstreamHeader
            activeProfile={upstream.activeProfile}
            profileCount={upstream.profiles.length}
            onConfigureAPIMart={() => setAPIMartChoiceOpen(true)}
            onConfigureFHL={() => setFHLChoiceOpen(true)}
            onConfigureRunningHub={handleUseExistingRunningHubAPI}
          />

          {upstream.profiles.length === 0 ? (
            <AndroidUpstreamEmptyState />
          ) : (
            <div className="android-upstream-workspace">
              <AndroidUpstreamProfileRail
                profiles={upstream.profiles}
                selectedId={upstream.selectedId}
                activeProfileId={upstream.activeProfileId}
                onCreate={() => upstream.handleNew()}
                onDuplicate={upstream.handleDuplicate}
                onDelete={upstream.handleDelete}
                onSelect={upstream.setSelectedId}
              />

              {upstream.draft ? (
                <AndroidUpstreamProfileForm
                  activeProfileId={upstream.activeProfileId}
                  baseURLError={upstream.baseURLError}
                  canSave={upstream.canSave}
                  draft={upstream.draft}
                  draftKey={upstream.draftKey}
                  isTestingKey={upstream.isTestingKey}
                  onChangeDraftKey={upstream.setDraftKey}
                  onPatchDraft={upstream.patchDraft}
                  onSave={async () => {
                    const saved = await upstream.handleSave();
                    if (saved) onClose();
                  }}
                  onSaveAndSetActive={() => upstream.handleSaveAndSetActive(onClose)}
                  onSaveAndTest={() => upstream.handleSaveAndTest(onClose)}
                  onSetActive={upstream.handleSetActive}
                  savedKeyLoaded={upstream.savedKeyLoaded}
                  saving={upstream.saving}
                  showKey={upstream.showKey}
                  onToggleShowKey={() => upstream.setShowKey((value) => !value)}
                />
              ) : null}
            </div>
          )}
        </div>
      </Modal>

      <FHLAPIChoiceModal
        open={fhlChoiceOpen}
        onClose={() => setFHLChoiceOpen(false)}
        onUseExistingAPI={handleUseExistingFHLAPI}
      />
      <APIMartAPIChoiceModal
        open={apimartChoiceOpen}
        onClose={() => setAPIMartChoiceOpen(false)}
        onUseExistingAPI={handleUseExistingAPIMartAPI}
      />
    </>
  );
}
