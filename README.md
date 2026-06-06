# FHL Image Studio 方汤圆版

> 基于 [RoseKhlifa/Image-Studio](https://github.com/RoseKhlifa/Image-Studio) 的独立深度改造发行版。本项目不隶属于、不代表、也不由上游项目维护。

当前仓库发布 **Android V2.0.1 源码与 Android APK**。上一个桌面版发行包继续保留在旧 Release/旧资产中，本次不会覆盖桌面版。

## Android V2.0.1

Android 版面向 FHL 生图工作流，默认使用用户在 App 中配置的 FHL API：

- FHL 一键配置：`Responses / openai / https://www.fhl.mom / gpt-5.5 / gpt-image-2`
- 文生图、图生图、多参考图输入
- 生成图自动保存到系统相册 `Pictures/ImageStudio`
- 支持保存原图、系统分享到微信/QQ/其他 App
- 支持提示词复制/清空快捷按钮
- 画布工具栏加入横向滑动提示
- 手机状态栏/底部手势区安全区适配

## 下载

请到本仓库 **Releases** 下载 Android 版：

```text
FHL-Image-Studio方汤圆版-V2.0.1-Android-Release-20260606.apk
FHL-Image-Studio方汤圆版-V2.0.1-Android-Release-20260606.zip
```

APK SHA256：

```text
F794064CD3704889A88FE59E5F914652E18B91C131BCE173DF3463A68619A1F6
```

## 首次使用

1. 安装 APK。
2. 打开 App，点击“一键配置”。
3. 输入你自己的 FHL API Key。
4. 用小图先测试一次文生图或图生图。
5. 生成成功后，图片会自动进入系统相册，也可以在历史/画布里手动“保存原图”或分享。

## 从源码构建 Android

需要 JDK 17、Node.js 20、Android SDK 34。

```bash
cd image-studio/frontend
npm ci
npm test
npm run build:android

cd ../../android-shell
./gradlew assembleRelease
```

Windows 可使用：

```bat
cd image-studio\frontend
npm.cmd ci
npm.cmd test
npm.cmd run build:android

cd ..\..\android-shell
gradlew.bat assembleRelease
```

默认 release 若未提供正式签名，会使用 fallback debug keystore，适合 GitHub Release 侧载安装。上架应用商店前请配置正式 keystore。

## 安全说明

- 本仓库和发布 APK 不内置 API Key。
- 用户需要在本机 App 内自行输入 API Key。
- 不提交 `cli.env.local`、`fhl-api.local.json`、浏览器缓存、生成历史、输入图、输出图、raw 日志或审计日志。
- Android 版与桌面版 Release 分开发布，避免覆盖已有桌面版资产。

## 与上游项目的关系

本项目基于 `RoseKhlifa/Image-Studio` 修改，原项目使用 MIT License。当前仓库是独立维护的修改发行版，不向上游提交 PR，也不声明为官方版本。

上游版权与 MIT License 保留在 [LICENSE](./LICENSE) 和 [NOTICE.md](./NOTICE.md)。
