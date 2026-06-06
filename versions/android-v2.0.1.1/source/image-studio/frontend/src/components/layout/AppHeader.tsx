import { type MouseEvent, useState } from "react";
import { Check, ChevronDown, ChevronUp, Clipboard, Github, KeyRound, Monitor, Moon, Plus, Settings, Star, Sun } from "lucide-react";
import { useStudioStore } from "../../state/studioStore";
import { OpenExternalURL } from "../../platform/runtime/host";
import { usePlatform } from "../../platform/context";
import { openExternalURLForPlatform } from "../../platform/android/bridge";
import { FHL_BASE_URL, FHL_IMAGE_MODEL_ID } from "../../lib/profiles";
import { copyText, ensureFHLResponsesProfile, focusFHLAPIKeyInput } from "../../lib/fhlAPI";
import { FHLAPIChoiceModal } from "../panel/FHLAPIChoiceModal";
import { AppHeaderBrand } from "./AppHeaderBrand";
import { HeaderIconBtn, HeaderToggleBtn } from "./headerPrimitives";

const REPO_URL = "https://github.com/RoseKhlifa/Image-Studio";
const FHL_QQ_GROUP_TEXT = "FHL官方QQ交流群：207550870";

export function AppHeader({ onOpenSettings }: { onOpenSettings: () => void }) {
  const {
    fullscreen, theme, setTheme, pushToast, workspaces, newWorkspace, openStarPrompt,
    apiKey, apiMode, baseURL, imageModelID,
  } = useStudioStore();
  const { isAndroid, isMac, usesFluentUI, usesAndroidUI, usesAppleUI } = usePlatform();
  const [fhlChoiceOpen, setFHLChoiceOpen] = useState(false);
  const [androidConfigRowOpen, setAndroidConfigRowOpen] = useState(false);
  const isFHLAPIConfigured = apiKey.trim().length > 0
    && apiMode === "responses"
    && baseURL.trim().replace(/\/+$/, "") === FHL_BASE_URL
    && imageModelID.trim() === FHL_IMAGE_MODEL_ID;
  const showAndroidConfigRow = usesAndroidUI && (!isFHLAPIConfigured || androidConfigRowOpen);

  const openFHLAPIConfig = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setFHLChoiceOpen(true);
  };

  const useExistingFHLAPI = async () => {
    setFHLChoiceOpen(false);
    const store = useStudioStore.getState();
    await ensureFHLResponsesProfile(store);
    useStudioStore.getState().openUpstreamConfig("app");
    focusFHLAPIKeyInput();
  };

  const copyFHLQQGroup = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await copyText(FHL_QQ_GROUP_TEXT);
      pushToast(`已复制：${FHL_QQ_GROUP_TEXT}`, "success", 2800);
    } catch {
      pushToast(`复制失败，请手动复制：${FHL_QQ_GROUP_TEXT}`, "error", 4600);
    }
  };

  if (fullscreen) return null;

  if (usesAndroidUI) {
    return (
      <header
        data-audit-area="header"
        className="drag-region app-header sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--toolbar)] backdrop-blur-2xl android-app-header"
      >
        <div className="min-w-0 flex-1 android-header-copy">
          <AppHeaderBrand />
        </div>

        <div className="no-drag android-header-top-actions">
          {isFHLAPIConfigured && (
            <button
              type="button"
              data-audit-id="toggle-fhl-config-row"
              className="android-header-config-toggle"
              title={androidConfigRowOpen ? "收起配置按钮" : "展开配置按钮"}
              aria-label={androidConfigRowOpen ? "收起配置按钮" : "展开配置按钮"}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setAndroidConfigRowOpen((value) => !value);
              }}
            >
              <KeyRound className="h-3.5 w-3.5" />
              {androidConfigRowOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
          <HeaderIconBtn
            onClick={onOpenSettings}
            title="设置"
            auditId="open-settings"
          >
            <Settings className="h-4 w-4" />
          </HeaderIconBtn>
        </div>

        {showAndroidConfigRow && (
          <div className="no-drag android-header-actions">
            <button
              type="button"
              data-audit-id="copy-qq"
              className="android-header-qq-btn"
              title={FHL_QQ_GROUP_TEXT}
              aria-label={`复制${FHL_QQ_GROUP_TEXT}`}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={copyFHLQQGroup}
            >
              <Clipboard className="h-3.5 w-3.5" />
              <span>QQ群</span>
            </button>
            <button
              type="button"
              data-audit-id="fhl-config"
              className={`android-header-fhl-config-btn ${isFHLAPIConfigured ? "is-configured" : "needs-config"}`}
              title={isFHLAPIConfigured ? "FHL API 已配置，点击可修改" : "一键配置 FHL API"}
              aria-label={isFHLAPIConfigured ? "FHL API 已配置，点击可修改" : "一键配置 FHL API"}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={openFHLAPIConfig}
            >
              {isFHLAPIConfigured ? <Check className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
              <span>{isFHLAPIConfigured ? "已配置" : "一键配置"}</span>
            </button>
          </div>
        )}

        <FHLAPIChoiceModal
          open={fhlChoiceOpen}
          onClose={() => setFHLChoiceOpen(false)}
          onUseExistingAPI={useExistingFHLAPI}
        />
      </header>
    );
  }

  return (
    <header
      data-audit-area="header"
      className={`drag-region app-header sticky top-0 z-40 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--toolbar)] backdrop-blur-2xl ${
        usesAppleUI ? "liquid-glass-bar" : ""
      } ${
        usesAndroidUI
          ? "android-app-header"
          :
        usesAppleUI
          ? `${isMac ? "mac-app-header" : ""} min-h-[64px] px-5 pb-2 pt-3`
          : usesFluentUI
            ? "min-h-[48px] px-3"
            : "min-h-12 px-4"
      }`}
    >
      <div className={`min-w-0 flex-1 ${usesAndroidUI ? "android-header-copy" : ""} ${isMac ? "mac-header-copy" : ""}`}>
        <AppHeaderBrand />
      </div>

      <div className={`no-drag ml-auto flex items-center shrink-0 ${usesAndroidUI ? "android-header-actions" : ""} ${isMac ? "mac-header-actions" : ""} ${usesFluentUI ? "gap-1" : isMac ? "gap-2" : "gap-1.5"}`}>
        {usesAndroidUI && (
          <button
            type="button"
            data-audit-id="copy-qq"
            className="android-header-qq-btn"
            title={FHL_QQ_GROUP_TEXT}
            aria-label={`复制${FHL_QQ_GROUP_TEXT}`}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={copyFHLQQGroup}
          >
            <Clipboard className="h-3.5 w-3.5" />
            <span>QQ群</span>
          </button>
        )}
        {usesAndroidUI && (
          <button
            type="button"
            data-audit-id="fhl-config"
            className={`android-header-fhl-config-btn ${isFHLAPIConfigured ? "is-configured" : "needs-config"}`}
            title={isFHLAPIConfigured ? "FHL API 已配置，点击可修改" : "一键配置 FHL API"}
            aria-label={isFHLAPIConfigured ? "FHL API 已配置，点击可修改" : "一键配置 FHL API"}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={openFHLAPIConfig}
          >
            {isFHLAPIConfigured ? <Check className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
            <span>{isFHLAPIConfigured ? "已配置" : "一键配置"}</span>
          </button>
        )}
        {!isAndroid && <HeaderIconBtn
          onClick={() => newWorkspace()}
          title={workspaces.length > 1 ? `${workspaces.length} 个标签 · 新建` : "新建标签"}
          auditId="new-workspace"
        >
          <Plus className="h-4 w-4" />
          {workspaces.length > 1 && (
            <span className="absolute right-0 top-0 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[var(--accent)] px-[3px] text-[8px] font-semibold leading-none text-white shadow-sm">
              {workspaces.length}
            </span>
          )}
        </HeaderIconBtn>}
        {!isAndroid && <div className={`platform-seg flex items-center p-0.5 ring-1 ${
          usesFluentUI
            ? "bg-white/66 ring-black/[0.08] dark:bg-white/[0.04] dark:ring-white/[0.08]"
            : "rounded-full bg-black/[0.04] ring-black/[0.05] dark:bg-white/[0.06] dark:ring-white/[0.06]"
        }`}>
          <HeaderToggleBtn
            active={theme === "system"}
            onClick={() => setTheme("system")}
            title="跟随系统"
          >
            <Monitor className="h-3.5 w-3.5" />
          </HeaderToggleBtn>
          <HeaderToggleBtn
            active={theme === "light"}
            onClick={() => setTheme("light")}
            title="浅色外观"
          >
            <Sun className="h-3.5 w-3.5" />
          </HeaderToggleBtn>
          <HeaderToggleBtn
            active={theme === "dark"}
            onClick={() => setTheme("dark")}
            title="深色外观"
          >
            <Moon className="h-3.5 w-3.5" />
          </HeaderToggleBtn>
        </div>}
        {!isAndroid && !isMac && <HeaderIconBtn
          onClick={() => openExternalURLForPlatform(REPO_URL, OpenExternalURL).catch(() => pushToast("无法打开浏览器", "error"))}
          title="GitHub"
        >
          <Github className="h-4 w-4" />
        </HeaderIconBtn>}
        {!isAndroid && !isMac && <HeaderIconBtn
          onClick={openStarPrompt}
          title="给项目点个 Star"
        >
          <Star className="h-4 w-4 text-amber-500 dark:text-amber-400" fill="currentColor" strokeWidth={1.5} />
        </HeaderIconBtn>}
        <HeaderIconBtn
          onClick={onOpenSettings}
          title="设置"
          auditId="open-settings"
        >
          <Settings className="h-4 w-4" />
        </HeaderIconBtn>
      </div>
      <FHLAPIChoiceModal
        open={fhlChoiceOpen}
        onClose={() => setFHLChoiceOpen(false)}
        onUseExistingAPI={useExistingFHLAPI}
      />
    </header>
  );
}
