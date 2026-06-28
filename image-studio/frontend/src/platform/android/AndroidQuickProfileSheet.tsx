import { CheckCircle2, Settings, Zap } from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { isAPIMartAsyncProfile } from "../../lib/apimartAPI";
import { isFHLBaseURL } from "../../lib/profiles";
import { useStudioStore } from "../../state/studioStore";
import type { UpstreamProfile } from "../../types/domain";
import { vibrateForPlatform } from "./bridge";

function profileModeLabel(profile: UpstreamProfile): string {
  if (isAPIMartAsyncProfile(profile)) return "APIMart";
  if (isFHLBaseURL(profile.baseURL)) return "FHL";
  if (profile.apiMode === "responses") return "FHL";
  return "Images";
}

function profileDetailLabel(profile: UpstreamProfile): string {
  const base = profile.baseURL.trim() || "未填写上游地址";
  const limit = `${Math.min(2, Math.max(1, Math.floor(Number(profile.concurrencyLimit) || 1)))} 并发`;
  return `${profileModeLabel(profile)} · ${limit} · ${base}`;
}

export function AndroidQuickProfileSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    activeProfileId,
    openUpstreamConfig,
    profiles,
    pushToast,
    setActiveProfile,
  } = useStudioStore();

  const handlePick = async (profile: UpstreamProfile) => {
    vibrateForPlatform(8);
    await setActiveProfile(profile.id);
    pushToast(`已切换到 ${profile.name || profileModeLabel(profile)}`, "success", 2600);
    onClose();
  };

  const handleManage = () => {
    vibrateForPlatform(8);
    onClose();
    openUpstreamConfig("app");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="选择当前 API"
      width={520}
      cardClassName="android-quick-profile-card"
      bodyClassName="android-quick-profile-body"
    >
      <div className="android-quick-profile-sheet">
        <div className="android-quick-profile-summary">
          点选后立即作为当前生图 API。FHL / APIMart 不需要进设置页反复确认。
        </div>
        <div className="android-quick-profile-list">
          {profiles.map((profile) => {
            const active = profile.id === activeProfileId;
            return (
              <button
                key={profile.id}
                type="button"
                className={`android-quick-profile-item ${active ? "active" : ""}`}
                onClick={() => { void handlePick(profile); }}
                aria-current={active ? "true" : undefined}
              >
                <span className="android-quick-profile-icon">
                  {active ? <CheckCircle2 className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
                </span>
                <span className="android-quick-profile-copy">
                  <strong>{profile.name || profileModeLabel(profile)}</strong>
                  <small>{profileDetailLabel(profile)}</small>
                </span>
                <span className="android-quick-profile-mode">{profileModeLabel(profile)}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="android-quick-profile-manage" onClick={handleManage}>
          <Settings className="h-4 w-4" />
          管理上游配置
        </button>
      </div>
    </Modal>
  );
}
