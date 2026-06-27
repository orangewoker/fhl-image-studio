import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runningHubAPISource = await readFile(new URL("../src/lib/runninghubAPI.ts", import.meta.url), "utf8");
const choiceModalSource = await readFile(new URL("../src/components/panel/RunningHubAPIChoiceModal.tsx", import.meta.url), "utf8");
const settingsPanelSource = await readFile(new URL("../src/components/panel/SettingsPanel.tsx", import.meta.url), "utf8");
const upstreamModalSource = await readFile(new URL("../src/components/panel/UpstreamConfigModal.tsx", import.meta.url), "utf8");

test("RunningHub one-click choice opens and copies the full API page link", () => {
  assert.match(
    runningHubAPISource,
    /RUNNINGHUB_REGISTER_URL\s*=\s*"https:\/\/www\.runninghub\.cn\/call-api\/api-detail\/2046503667076751361\?inviteCode=rh-v1507"/,
  );
  assert.match(
    choiceModalSource,
    /openExternalURLForPlatform\(RUNNINGHUB_REGISTER_URL,\s*OpenExternalURL\)/,
  );
  assert.match(choiceModalSource, /copyText\(RUNNINGHUB_REGISTER_URL\)/);
  assert.match(choiceModalSource, /RUNNINGHUB_BASE_URL/);
  assert.match(choiceModalSource, /data-runninghub-api-choice="existing"/);
  assert.match(choiceModalSource, /data-runninghub-api-choice="get"/);
});

test("RunningHub one-click buttons open the choice modal before quick config", () => {
  assert.match(settingsPanelSource, /import \{ RunningHubAPIChoiceModal \} from "\.\/RunningHubAPIChoiceModal"/);
  assert.match(settingsPanelSource, /const \[runningHubChoiceOpen, setRunningHubChoiceOpen\] = useState\(false\)/);
  assert.match(settingsPanelSource, /function configureRunningHubFromSettings\(\) \{\s*setRunningHubChoiceOpen\(true\);/);
  assert.match(settingsPanelSource, /function useExistingRunningHubFromSettings\(\) \{[\s\S]*setRunningHubQuickConfigOpen\(true\);/);
  assert.match(settingsPanelSource, /<RunningHubAPIChoiceModal[\s\S]*onUseExistingAPI=\{useExistingRunningHubFromSettings\}/);

  assert.match(upstreamModalSource, /import \{ RunningHubAPIChoiceModal \} from "\.\/RunningHubAPIChoiceModal"/);
  assert.match(upstreamModalSource, /const \[runningHubChoiceOpen, setRunningHubChoiceOpen\] = useState\(false\)/);
  assert.match(upstreamModalSource, /function handleConfigureRunningHub\(\) \{\s*setRunningHubChoiceOpen\(true\);/);
  assert.match(upstreamModalSource, /function handleUseExistingRunningHubAPI\(\) \{[\s\S]*setRunningHubQuickConfigOpen\(true\);/);
  assert.match(upstreamModalSource, /<RunningHubAPIChoiceModal[\s\S]*onUseExistingAPI=\{handleUseExistingRunningHubAPI\}/);
});
