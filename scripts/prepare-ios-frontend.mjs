import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const distDir = path.join(repoRoot, "image-studio", "frontend", "dist");
const targetDir = path.join(repoRoot, "ios-shell", "assets", "web");

const indexPath = path.join(distDir, "index.html");
try {
  await fs.access(indexPath);
} catch {
  throw new Error("Frontend dist is missing. Run npm run build:android in image-studio/frontend first.");
}

await fs.rm(targetDir, { recursive: true, force: true });
await fs.mkdir(targetDir, { recursive: true });
await fs.cp(distDir, targetDir, { recursive: true });

const pubspec = await fs.readFile(path.join(repoRoot, "ios-shell", "pubspec.yaml"), "utf8");
const versionMatch = pubspec.match(/^version:\s*([^+\s]+)(?:\+\d+)?\s*$/m);
if (!versionMatch) throw new Error("Unable to read iOS version from ios-shell/pubspec.yaml.");
const bridgePath = path.join(targetDir, "ios-bridge.js");
const bridge = await fs.readFile(bridgePath, "utf8");
await fs.writeFile(
  bridgePath,
  bridge.replace(/appVersion:\s*"V[^"]*"/, `appVersion: "V${versionMatch[1]}"`),
  "utf8",
);

const copiedIndex = await fs.readFile(path.join(targetDir, "index.html"), "utf8");
if (!copiedIndex.includes("ios-bridge.js")) {
  throw new Error("Copied frontend does not include the iOS bridge bootstrap.");
}

console.log(`Prepared iOS web assets: ${targetDir}`);
