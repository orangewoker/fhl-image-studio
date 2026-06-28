import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runningHubAPISource = await readFile(new URL("../src/lib/runninghubAPI.ts", import.meta.url), "utf8");
const choiceModalSource = await readFile(new URL("../src/components/panel/RunningHubAPIChoiceModal.tsx", import.meta.url), "utf8");
const settingsPanelSource = await readFile(new URL("../src/components/panel/SettingsPanel.tsx", import.meta.url), "utf8");
const upstreamModalSource = await readFile(new URL("../src/components/panel/UpstreamConfigModal.tsx", import.meta.url), "utf8");

function nthIndexOf(source, needle, count) {
  let from = 0;
  let index = -1;
  for (let i = 0; i < count; i += 1) {
    index = source.indexOf(needle, from);
    if (index < 0) return -1;
    from = index + needle.length;
  }
  return index;
}

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

test("RunningHub quick config stays above APIMart in desktop config surfaces", () => {
  const settingsRh = settingsPanelSource.indexOf("border border-violet-300/70");
  const settingsApimart = settingsPanelSource.indexOf("border border-sky-300/70");
  assert.ok(settingsRh >= 0, "Settings panel should render RH quick config");
  assert.ok(settingsApimart >= 0, "Settings panel should render APIMart quick config");
  assert.ok(settingsRh < settingsApimart, "Settings panel should keep RH above APIMart");

  const firstUpstreamApimart = upstreamModalSource.indexOf("border border-sky-300/70");
  const secondUpstreamRh = nthIndexOf(upstreamModalSource, "border border-violet-300/70", 2);
  assert.ok(secondUpstreamRh >= 0, "Upstream modal should render RH quick config in the editor panel");
  assert.ok(firstUpstreamApimart >= 0, "Upstream modal should render APIMart quick config");
  assert.ok(secondUpstreamRh < firstUpstreamApimart, "Upstream modal should keep RH above APIMart");

  assert.ok(
    upstreamModalSource.indexOf('id: "runninghub" as APIMode') < upstreamModalSource.indexOf('id: "apimart" as APIMode'),
    "New API type cards should offer RH before APIMart",
  );
});
