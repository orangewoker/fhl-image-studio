import { Check, Eye, EyeOff, Minus, Plug, Plus, Save } from "lucide-react";
import type { ReactNode } from "react";
import type { UpstreamProfile } from "../../../types/domain";
import {
  ANDROID_API_MODE_OPTIONS,
  ANDROID_REQUEST_POLICY_OPTIONS,
} from "./useAndroidUpstreamConfig";

export function AndroidUpstreamProfileForm({
  activeProfileId,
  baseURLError,
  canSave,
  draft,
  draftKey,
  isTestingKey,
  onChangeDraftKey,
  onPatchDraft,
  onSave,
  onSaveAndSetActive,
  onSaveAndTest,
  onSetActive,
  savedKeyLoaded,
  saving,
  showKey,
  onToggleShowKey,
}: {
  activeProfileId: string;
  baseURLError: string | null;
  canSave: boolean;
  draft: UpstreamProfile;
  draftKey: string;
  isTestingKey: boolean;
  onChangeDraftKey: (value: string) => void;
  onPatchDraft: (patch: Partial<UpstreamProfile>) => void;
  onSave: () => void | Promise<void>;
  onSaveAndSetActive: () => void | Promise<void>;
  onSaveAndTest: () => void | Promise<void>;
  onSetActive: () => void | Promise<void>;
  savedKeyLoaded: boolean;
  saving: boolean;
  showKey: boolean;
  onToggleShowKey: () => void;
}) {
  const isActive = draft.id === activeProfileId;
  const busy = saving || isTestingKey;

  return (
    <section className="android-upstream-form" aria-label="编辑上游配置">
      <div className="android-upstream-section-head">
        <span>编辑</span>
        {isActive ? <strong>当前启用</strong> : <button type="button" onClick={onSetActive}>设为当前</button>}
      </div>

      <AndroidField label="名称" required>
        <input
          type="text"
          value={draft.name}
          onChange={(event) => onPatchDraft({ name: event.target.value })}
          className="focus-ring android-upstream-input"
          spellCheck={false}
        />
      </AndroidField>

      <AndroidField label="API 形态">
        <div className="android-upstream-option-grid two">
          {ANDROID_API_MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={draft.apiMode === option.id ? "active" : ""}
              onClick={() => onPatchDraft({ apiMode: option.id })}
            >
              <strong>{option.title}</strong>
              <small>{option.meta}</small>
            </button>
          ))}
        </div>
      </AndroidField>

      <AndroidField label="参数策略">
        <div className="android-upstream-option-grid two">
          {ANDROID_REQUEST_POLICY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={draft.requestPolicy === option.id ? "active" : ""}
              onClick={() => onPatchDraft({ requestPolicy: option.id })}
            >
              <strong>{option.title}</strong>
              <small>{option.meta}</small>
            </button>
          ))}
        </div>
      </AndroidField>

      <AndroidField label="上游 BASE_URL" required hint="填写站点根地址，应用会按 API 形态自动拼接 /v1 路径。">
        <input
          type="text"
          value={draft.baseURL}
          onChange={(event) => onPatchDraft({ baseURL: event.target.value })}
          placeholder="https://your-relay.example.com"
          className="focus-ring android-upstream-input font-mono-token"
          spellCheck={false}
        />
        {baseURLError ? <p className="android-upstream-error">{baseURLError}</p> : null}
      </AndroidField>

      <AndroidField label="API Key" required hint="密钥写入系统凭据存储，不进入 localStorage。">
        <div className="android-upstream-secret">
          <input
            type={showKey ? "text" : "password"}
            data-fhl-api-key-input="true"
            value={draftKey}
            onChange={(event) => onChangeDraftKey(event.target.value)}
            placeholder={savedKeyLoaded ? "sk-..." : "加载中..."}
            autoComplete="off"
            className="focus-ring android-upstream-input font-mono-token"
            spellCheck={false}
          />
          <button type="button" onClick={onToggleShowKey} title={showKey ? "隐藏密钥" : "显示密钥"}>
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </AndroidField>

      {draft.apiMode === "responses" ? (
        <AndroidField label="文本模型 ID">
          <input
            type="text"
            value={draft.textModelID}
            onChange={(event) => onPatchDraft({ textModelID: event.target.value })}
            placeholder="留空 = 默认 gpt-5.5"
            className="focus-ring android-upstream-input font-mono-token"
            spellCheck={false}
          />
        </AndroidField>
      ) : null}

      <AndroidField label="图像模型 ID">
        <input
          type="text"
          value={draft.imageModelID}
          onChange={(event) => onPatchDraft({ imageModelID: event.target.value })}
          placeholder="留空 = 默认 gpt-image-2"
          className="focus-ring android-upstream-input font-mono-token"
          spellCheck={false}
        />
      </AndroidField>

      <AndroidField label="并发数量限制" hint="0 表示不限制；正整数会限制同一配置跨标签页的并发任务。">
        <div className="android-upstream-stepper">
          <button
            type="button"
            onClick={() => onPatchDraft({ concurrencyLimit: Math.max(0, draft.concurrencyLimit - 1) })}
            title="减少"
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            type="number"
            value={draft.concurrencyLimit || ""}
            min={0}
            step={1}
            placeholder="不限"
            onChange={(event) => onPatchDraft({ concurrencyLimit: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
            className="focus-ring android-upstream-input font-mono-token"
          />
          <button
            type="button"
            onClick={() => onPatchDraft({ concurrencyLimit: Math.max(0, draft.concurrencyLimit) + 1 })}
            title="增加"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </AndroidField>

      <div className="android-upstream-actions">
        <button type="button" onClick={() => void onSave()} disabled={!canSave || busy}>
          <Save className="h-4 w-4" />
          {saving ? "保存中" : "保存"}
        </button>
        <button type="button" onClick={() => void onSaveAndSetActive()} disabled={!canSave || busy}>
          <Check className="h-4 w-4" />
          保存并启用
        </button>
        <button type="button" className="primary" onClick={() => void onSaveAndTest()} disabled={!canSave || busy}>
          <Plug className={`h-4 w-4 ${isTestingKey ? "animate-spin" : ""}`} />
          {isTestingKey ? "测试中" : "保存并测试"}
        </button>
      </div>

      {!canSave ? <p className="android-upstream-save-hint">名称、BASE_URL 和 API Key 填齐后才能保存。</p> : null}
    </section>
  );
}

function AndroidField({
  children,
  hint,
  label,
  required,
}: {
  children: ReactNode;
  hint?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="android-upstream-field">
      <span className="android-upstream-label">
        {label}
        {required ? <em>*</em> : null}
      </span>
      {children}
      {hint ? <span className="android-upstream-hint">{hint}</span> : null}
    </div>
  );
}
