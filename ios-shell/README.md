# FHL Image Studio iOS Shell

Flutter/WKWebView iOS 容器。应用资源由 Android 移动端 React 前端构建结果生成，不直接提交 `assets/web` 的产物。

```powershell
cd ..\image-studio\frontend
npm ci
npm run build:android
node ..\..\scripts\prepare-ios-frontend.mjs

cd ..\..\ios-shell
flutter pub get
flutter analyze --no-pub
flutter test --no-pub
```

iOS 二进制由仓库根目录 `.github/workflows/ios-build.yml` 在 macOS runner 上使用 `flutter build ios --release --no-codesign` 构建。
