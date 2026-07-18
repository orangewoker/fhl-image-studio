# FHL Image Studio iOS 迁移说明

## 架构

iOS 版以 Android `V2.0.2.1` 发布源码为功能基线：

- 复用 `image-studio/frontend` 中同一套手机/平板 React UI、状态管理、请求模型和远程内核。
- 使用 Flutter `WKWebView` 容器承载移动端 UI。
- 通过 `FlutterBridge` 模拟现有 `AndroidImageStudio.invoke` 协议，因此前端无需维护第二套宿主 API。
- 原生桥接实现在 `ios-shell/lib/src`，包括 HTTP/SSE、API Key Keychain 存储、图片导入、历史导入导出、相册保存、系统分享、外链与触觉反馈。
- FHL Responses、FHL Images、APIMart 与 RunningHub 请求仍由共享远程内核构造，尺寸/比例及 `gpt-image-2` 修复与 Android 保持一致。

## iOS 运行模型

iOS 不启动 Android 的前台 Service/后台任务管理器。生成任务在应用前台由共享远程内核运行，批量与并发设置仍生效；进入系统后台后是否继续联网由 iOS 决定。桥接通过 `supportsBackgroundJobs: false` 明确关闭 Android 后台 Job API，避免错误提交到不存在的 Android Service。

## 本地验证（Windows）

```powershell
cd image-studio/frontend
npm ci
npm test
npm run build:android
node ../../scripts/prepare-ios-frontend.mjs

cd ../../ios-shell
flutter pub get
flutter analyze --no-pub
flutter test --no-pub
```

Windows 不执行 `flutter build ios`。推送 `ios` 分支后，由 `.github/workflows/ios-build.yml` 在 GitHub Actions 的 macOS runner 上执行无签名构建。

## 版本与发布

- Flutter 版本在 `ios-shell/pubspec.yaml`。
- 每次发布前递增语义化 patch 版本并将 `+build` 加一。
- 工作流发布 tag：`ios-v<VERSION>`。
- Release asset：`AI-Runner-<VERSION>-unsigned.ipa`（沿用本地 `ios-unsigned-ipa` 下载工具的固定命名协议）。
- IPA 内不得包含 `embedded.mobileprovision`。
