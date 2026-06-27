import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const errorNoticeSource = readFileSync(new URL("../src/components/panel/ErrorNotice.tsx", import.meta.url), "utf8");
const controlPanelSource = readFileSync(new URL("../src/components/panel/ControlPanel.tsx", import.meta.url), "utf8");

test("busy upstream errors recommend switching API configuration", () => {
  assert.match(errorNoticeSource, /function shouldRecommendAPISwitch/);
  assert.match(errorNoticeSource, /账号池\|繁忙\|稍后重试\|自动重试\|超时\|耗时\|排队\|未返回/);
  assert.match(errorNoticeSource, /recommendAPISwitch/);
  assert.match(errorNoticeSource, /const recommendAPIMart = recommendAPISwitch && apiMode !== "apimart"/);
  assert.match(errorNoticeSource, /优先试试 APIMart 异步 API/);
  assert.match(errorNoticeSource, /切换 API 配置/);
  assert.match(errorNoticeSource, /onOpenUpstreamConfig\?: \(\) => void/);
  assert.match(errorNoticeSource, /apiMode\?: APIMode/);
  assert.match(controlPanelSource, /onOpenUpstreamConfig=\{\(\) => openUpstreamConfig\("app"\)\}/);
  assert.match(controlPanelSource, /apiMode=\{apiMode\}/);
});

test("error notice wraps long upstream URLs and JSON inside the panel", () => {
  assert.match(errorNoticeSource, /min-w-0 max-w-full shrink-0/);
  assert.match(errorNoticeSource, /whitespace-pre-wrap break-words leading-relaxed \[overflow-wrap:anywhere\]/);
  assert.match(errorNoticeSource, /shrink-0 p-1 text-red-400/);
});

test("ordinary validation errors do not match the API switch hint keywords", () => {
  const keywordPatternSource = errorNoticeSource.match(/return \/(.+)\/\.test\(message\)/)?.[1] ?? "";
  assert.doesNotMatch("主提示词未输入", new RegExp(keywordPatternSource));
  assert.doesNotMatch("请先填写 API Key", new RegExp(keywordPatternSource));
});
