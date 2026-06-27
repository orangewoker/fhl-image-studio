import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apimartAPISource = await readFile(new URL("../src/lib/apimartAPI.ts", import.meta.url), "utf8");
const choiceModalSource = await readFile(new URL("../src/components/panel/APIMartAPIChoiceModal.tsx", import.meta.url), "utf8");
const settingsPanelSource = await readFile(new URL("../src/components/panel/SettingsPanel.tsx", import.meta.url), "utf8");
const upstreamModalSource = await readFile(new URL("../src/components/panel/UpstreamConfigModal.tsx", import.meta.url), "utf8");

test("APIMart one-click choice opens the official key page", () => {
  assert.match(
    apimartAPISource,
    /APIMART_REGISTER_URL\s*=\s*"https:\/\/apimart\.ai\/keys"/,
  );
  assert.match(
    choiceModalSource,
    /openExternalURLForPlatform\(APIMART_REGISTER_URL,\s*OpenExternalURL\)/,
  );
  assert.match(choiceModalSource, /copyText\(APIMART_REGISTER_URL\)/);
  assert.match(choiceModalSource, /data-apimart-api-choice="existing"/);
  assert.match(choiceModalSource, /data-apimart-api-choice="get"/);
});

test("APIMart one-click buttons open the choice modal before configuring", () => {
  assert.match(settingsPanelSource, /import \{ APIMartAPIChoiceModal \} from "\.\/APIMartAPIChoiceModal"/);
  assert.match(settingsPanelSource, /const \[apimartChoiceOpen, setAPIMartChoiceOpen\] = useState\(false\)/);
  assert.match(settingsPanelSource, /onClick=\{\(\) => setAPIMartChoiceOpen\(true\)\}/);
  assert.match(settingsPanelSource, /<APIMartAPIChoiceModal[\s\S]*onUseExistingAPI=\{configureAPIMartFromSettings\}/);

  assert.match(upstreamModalSource, /import \{ APIMartAPIChoiceModal \} from "\.\/APIMartAPIChoiceModal"/);
  assert.match(upstreamModalSource, /const \[apimartChoiceOpen, setAPIMartChoiceOpen\] = useState\(false\)/);
  assert.match(upstreamModalSource, /onClick=\{\(\) => setAPIMartChoiceOpen\(true\)\}/);
  assert.match(upstreamModalSource, /<APIMartAPIChoiceModal[\s\S]*onUseExistingAPI=\{handleConfigureAPIMart\}/);
});
