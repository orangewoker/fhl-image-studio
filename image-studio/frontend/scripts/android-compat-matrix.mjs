import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendDir, "../..");
const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
const matrixMode = process.env.ANDROID_COMPAT_FULL === "1" || process.argv.includes("--full") ? "full" : "quick";
const outRoot = path.resolve(repoRoot, "compat-screenshots", `android-v2.0.2.1-${matrixMode}-${runStamp}`);
const reportOutRoot = outRoot.replaceAll("\\", "/");

const fullViewports = [
  [360, 780],
  [375, 812],
  [390, 844],
  [393, 873],
  [412, 915],
  [430, 932],
  [480, 960],
];
const quickViewports = [
  [390, 844],
  [430, 932],
];
const fullSafeTops = [24, 32, 44, 52];
const quickSafeTops = [24, 44];
const fullSafeBottoms = [0, 16, 24, 34];
const quickSafeBottoms = [0, 34];
const defaultViews = ["compose", "canvas", "history"];

function parseViewportList(value, fallback) {
  if (!value) return fallback;
  const parsed = value.split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(\d+)x(\d+)$/i);
      return match ? [Number(match[1]), Number(match[2])] : null;
    })
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

function parseNumberList(value, fallback) {
  if (!value) return fallback;
  const parsed = value.split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0);
  return parsed.length ? parsed : fallback;
}

function parseViewList(value, fallback) {
  if (!value) return fallback;
  const allowed = new Set(defaultViews);
  const parsed = value.split(",")
    .map((item) => item.trim())
    .filter((item) => allowed.has(item));
  return parsed.length ? parsed : fallback;
}

const viewports = parseViewportList(
  process.env.ANDROID_COMPAT_VIEWPORTS,
  matrixMode === "full" ? fullViewports : quickViewports,
);
const safeTops = parseNumberList(
  process.env.ANDROID_COMPAT_SAFE_TOPS,
  matrixMode === "full" ? fullSafeTops : quickSafeTops,
);
const safeBottoms = parseNumberList(
  process.env.ANDROID_COMPAT_SAFE_BOTTOMS,
  matrixMode === "full" ? fullSafeBottoms : quickSafeBottoms,
);
const views = parseViewList(process.env.ANDROID_COMPAT_VIEWS, defaultViews);

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error("Playwright is required for the Android compat matrix.");
    console.error("Run this once in image-studio/frontend: npm i -D playwright");
    process.exit(1);
  }
}

function spawnServer() {
  const env = {
    ...process.env,
    VITE_TARGET_PLATFORM: "android",
    BROWSER: "none",
  };
  const child = spawn("npm", ["run", "dev:android", "--", "--host", "127.0.0.1"], {
    cwd: frontendDir,
    env,
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data.toString();
  });
  child.stderr.on("data", (data) => {
    output += data.toString();
  });
  return { child, getOutput: () => output };
}

function stopProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

async function waitForServer(server) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const match = stripAnsi(server.getOutput()).match(/http:\/\/(?:127\.0\.0\.1|localhost):(\d+)\//);
    if (match) return `http://127.0.0.1:${match[1]}/`;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite server did not start:\n${server.getOutput()}`);
}

async function run() {
  const { chromium } = await importPlaywright();
  await fs.mkdir(outRoot, { recursive: true });
  const server = spawnServer();
  let browser;
  const failures = [];
  try {
    const baseURL = await waitForServer(server);
    browser = await chromium.launch();
    console.log(`Android compat matrix mode: ${matrixMode}`);
    console.log(`Android compat cases: ${viewports.length * safeTops.length * safeBottoms.length * views.length}`);
    console.log(`Android compat target: ${baseURL}`);
    for (const [width, height] of viewports) {
      for (const safeTop of safeTops) {
        for (const safeBottom of safeBottoms) {
          const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: 3,
            isMobile: true,
            hasTouch: true,
            userAgent: "Mozilla/5.0 (Linux; Android 14; FHL Compat Matrix) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36",
          });
          const page = await context.newPage();
          const suffix = `${width}x${height}-top${safeTop}-bottom${safeBottom}`;
          for (const view of views) {
            const url = `${baseURL}?target=android&safeTop=${safeTop}&safeBottom=${safeBottom}&compatView=${view}`;
            await page.goto(url, { waitUntil: "domcontentloaded" });
            await page.evaluate((targetView) => {
              document.querySelector(".studio")?.setAttribute("data-android-view", targetView);
            }, view);
            await page.waitForTimeout(250);
            const metrics = await page.evaluate(() => {
              const header = document.querySelector(".app-header")?.getBoundingClientRect();
              const studio = document.querySelector(".studio")?.getBoundingClientRect();
              const firstCard = document.querySelector(".android-phone-hero, .android-canvas-shell, .history-rail, .canvas-shell")?.getBoundingClientRect();
              const nav = document.querySelector(".android-bottom-nav")?.getBoundingClientRect();
              const title = document.querySelector(".android-header-title")?.getBoundingClientRect();
              const actions = document.querySelector(".android-header-actions")?.getBoundingClientRect();
              const css = getComputedStyle(document.documentElement);
              return {
                header,
                studio,
                firstCard,
                nav,
                title,
                actions,
                headerSafeTop: css.getPropertyValue("--android-header-safe-top-value").trim(),
                headerHeight: css.getPropertyValue("--android-header-height").trim(),
                contentHeight: css.getPropertyValue("--android-content-height").trim(),
              };
            });
            const caseFailures = [];
            if (!metrics.header || metrics.header.top < -1) caseFailures.push("header missing or above viewport");
            if (metrics.header && metrics.header.height > 132) caseFailures.push(`header too tall: ${metrics.header.height}`);
            if (metrics.studio && metrics.header && metrics.studio.top - metrics.header.bottom > 20) {
              caseFailures.push(`large gap after header: ${metrics.studio.top - metrics.header.bottom}`);
            }
            if (metrics.nav && metrics.nav.bottom > height + 2) caseFailures.push("bottom nav overflows viewport");
            if (metrics.title && metrics.title.width < 110) caseFailures.push(`title too narrow: ${metrics.title.width}`);
            if (caseFailures.length) failures.push({ suffix, view, failures: caseFailures, metrics });
            await page.screenshot({ path: path.join(outRoot, `${suffix}-${view}.png`), fullPage: false });
          }
          await context.close();
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    stopProcessTree(server.child);
  }
  await fs.writeFile(path.join(outRoot, "matrix-report.json"), JSON.stringify({ outRoot: reportOutRoot, failures }, null, 2), "utf8");
  console.log(`Android compat screenshots: ${outRoot}`);
  if (failures.length) {
    console.error(`Compat matrix failures: ${failures.length}`);
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
