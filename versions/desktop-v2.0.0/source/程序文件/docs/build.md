# 安装与构建

## 下载预编译版本

稳定版本到 [Releases](https://github.com/RoseKhlifa/Image-Studio/releases) 下载。

| 平台 | 产物 | 说明 |
|---|---|---|
| Windows x64 | `image-studio-windows-amd64.exe` | 需要 WebView2 Runtime；Windows 10+ 通常已预装。 |
| Windows ARM64 | `image-studio-windows-arm64.exe` | 面向 Windows on Arm 设备，release workflow 使用 GitHub ARM64 runner 原生编译。 |
| macOS universal | `image-studio-macos-universal.zip` | 解压后如被 Gatekeeper 拦截，可执行 `xattr -dr com.apple.quarantine "Image Studio.app"`，或右键打开。 |
| Linux x64 | `image-studio-linux-amd64.tar.gz` | Ubuntu 24.04 / Debian 新版本使用 WebKitGTK 4.1 依赖。 |
| Linux ARM64 | `image-studio-linux-arm64.tar.gz` | 面向 ARM64 Linux 桌面环境，依赖同 Linux x64。 |
| Android | `image-studio-android-release.apk` | 单 APK，运行时自适应 phone/pad 布局。 |

main 分支抢先测试包可从 [DR-lin-eng/Image-Studio Actions](https://github.com/DR-lin-eng/Image-Studio/actions) 下载最近成功 workflow 的 artifact。

## 环境要求

- Go 1.25.x。当前 `go.mod` 使用 `go 1.25.5` 与 `toolchain go1.26.3`。
- Node.js 20 或更新版本。
- Wails CLI v2.12.0。非 macOS release workflow 使用 `go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0`。
- Android 构建需要 JDK 17、Android SDK 34、Build Tools 34.0.0、Gradle 8.7。

## 克隆源码

```bash
git clone https://github.com/RoseKhlifa/Image-Studio.git
cd Image-Studio
```

## 桌面开发模式

```bash
cd image-studio
wails dev
```

`image-studio/wails.json` 会执行:

- `frontend:install`: `npm ci`
- `frontend:build`: `npm run build`
- `frontend:dev:watcher`: `npm run dev`

前端脚本会按宿主平台自动选择 `macos` / `windows` / `linux` 主题。

## 前端独立预览

```bash
cd image-studio/frontend
npm ci

npm run dev
npm run dev:macos
npm run dev:windows
npm run dev:linux
npm run dev:android
npm run dev:android-pad
```

打包静态资源:

```bash
npm run build
npm run build:macos
npm run build:windows
npm run build:linux
npm run build:android
npm run build:android-pad
```

这些命令只切换 `VITE_TARGET_PLATFORM` 对应的主题和壳层，不改变主业务逻辑。

## macOS 本地发布包

```bash
bash scripts/package-local-macos-app.sh
```

产物位于:

```text
image-studio/build/bin/Image Studio.app
```

脚本会构建 arm64 与 amd64，再用 `lipo` 合成 universal 二进制，并执行本地自签。

## Windows / Linux Wails 构建

Wails v2 桌面端需要在目标平台原生构建。

Windows:

```bash
cd image-studio
wails build -platform windows/amd64 -clean
```

Linux Ubuntu 24.04 / Debian 新版本:

```bash
sudo apt-get update
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev

cd image-studio
wails build -platform linux/amd64 -clean -tags webkit2_41
```

Ubuntu 22.04 系通常使用 `libwebkit2gtk-4.0-dev`，构建时不加 `webkit2_41` tag。

## Android APK

```bash
cd android-shell
./gradlew assembleRelease
```

Gradle 会执行 `image-studio/frontend` 的 `npm run build:android`，然后把 `dist/` 拷贝进 APK assets。APK 内部运行同一个 Android 前端目标，phone/pad 布局由运行时窗口尺寸和方向决定。

可选环境变量:

| 变量 | 用途 |
|---|---|
| `IMAGE_STUDIO_ANDROID_VERSION_NAME` | Android `versionName`。 |
| `IMAGE_STUDIO_ANDROID_VERSION_CODE` | Android `versionCode`。 |
| `IMAGE_STUDIO_KEYSTORE_PATH` | release 签名 keystore。未提供时使用自动生成的 debug keystore。 |
| `IMAGE_STUDIO_KEYSTORE_PASSWORD` | keystore 密码。 |
| `IMAGE_STUDIO_KEY_ALIAS` | key alias。 |
| `IMAGE_STUDIO_KEY_PASSWORD` | key 密码。 |
| `IMAGE_STUDIO_ANDROID_USE_PREBUILT_FRONTEND` | 设为 `1` / `true` 时复用已有 `frontend/dist`。 |

MuMu 模拟器调试流程见 [mumu-android-debug.md](./mumu-android-debug.md)。

## 版本元数据

Release workflow 先执行:

```bash
./scripts/compute-version.sh
```

它会从 tag 或 `image-studio/wails.json` 计算桌面版本、前端版本、Android versionName/versionCode。随后 `scripts/sync-version-metadata.mjs` 同步:

- `image-studio/wails.json`
- `image-studio/frontend/package.json`
- `image-studio/frontend/package-lock.json`

本地不要手动维护多份版本号，除非明确要改基准版本。

## 验证入口

常用验证:

```bash
cd image-studio/frontend
npm run test
npm run build

cd ../..
cd image-studio
GOPATH="../.gopath" GOMODCACHE="../.gomodcache" GOCACHE="../.gocache" go test ./...

cd ../go-cli
GOPATH="../.gopath" GOMODCACHE="../.gomodcache" GOCACHE="../.gocache" go test ./...
```

跨平台内核本地全量验证:

```bash
node scripts/verify-local-platform-kernel.mjs
```

该脚本会跑前端测试/构建、Worker 测试、本地 smoke、Android debug assemble、Go 测试和 macOS 发布包验证。它依赖本机 Android SDK/JDK 与 macOS 构建工具是否齐全。

其他入口:

```bash
node scripts/verify-local-macos-release.mjs
node scripts/local-smoke-check.mjs
node scripts/live-verify.mjs
```

真实上游对比验证需要先按 `scripts/live-verify.env.example` 准备 `.env.live` 或 `.env.local`。

## CI

当前 release workflow 在 `.github/workflows/release.yml`:

- 并行构建 Windows、macOS、Linux 桌面产物。
- 单独构建一个 Android release APK。
- tag 为 `v*` 时将所有产物附加到 GitHub Release。

平台内核验证 workflow:

- `.github/workflows/verify-platform-kernel.yml`
- `.github/workflows/live-verify-platform-kernel.yml`
