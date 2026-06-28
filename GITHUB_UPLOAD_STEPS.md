# GitHub 发布与合规步骤

## 仓库信息

推荐仓库名：

```text
fhl-image-studio
```

推荐仓库描述：

```text
FHL Image Studio 方汤圆版，基于 RoseKhlifa/Image-Studio 的独立修改发行版，按 AGPLv3 公开源码。
```

原项目地址必须保留：

```text
https://github.com/RoseKhlifa/Image-Studio
```

当前远端：

```text
https://github.com/supart/fhl-image-studio.git
```

## Android V2.0.2 Release

使用独立 tag：

```text
Tag: v2.0.2-android
Title: FHL Image Studio 方汤圆版 V2.0.2 Android
```

Release notes 使用：

```text
RELEASE_NOTES_V2.0.2_ANDROID.md
```

上传资产命名：

```text
FHL-Image-Studio-方汤圆版-V2.0.2-Android-Release-YYYYMMDD.apk
FHL-Image-Studio-方汤圆版-V2.0.2-Android-Release-YYYYMMDD.zip
```

APK/ZIP 作为 GitHub Release 资产上传，不提交进 Git 仓库。

## 签名证书

- 正式 Android release keystore 保存在本机 `.local/android-release/`。
- keystore、密码文件和构建产物不能上传 GitHub。
- 后续 Android 升级必须继续使用同一个 release keystore，否则旧用户无法覆盖安装升级。

构建正式 APK 时使用环境变量传入：

```powershell
$env:IMAGE_STUDIO_KEYSTORE_PATH='.local/android-release/fhl-image-studio-release.jks'
$env:IMAGE_STUDIO_KEY_ALIAS='fhl-image-studio-release'
$env:IMAGE_STUDIO_ANDROID_VERSION_NAME='V2.0.2'
$env:IMAGE_STUDIO_ANDROID_VERSION_CODE='1050001'
```

密码变量从 `.local/android-release/release-signing.env.ps1` 加载，不写入文档。

## 发布前确认

- README 顶部说明这是独立修改发行版。
- README / NOTICE / Release notes 都包含上游原仓库链接。
- LICENSE 为 GNU AGPLv3.0。
- 每个 APK/ZIP 都能找到对应源码 tag/source archive。
- 源码和发布包扫描不到 API Key、本机配置、输出图、raw 日志、审计日志、keystore 或密码文件。
- Android 首次启动没有预置 API Key。
- Android 应用显示名为 `FHL Image Studio 方汤圆版 V2.0.2`。
- 包名为 `top.fangtangyuan.fhlstudio.android`，版本名为 `V2.0.2`，版本号为 `1050001`。

## 外部分发文案

```text
本项目是基于 RoseKhlifa/Image-Studio 的独立修改发行版，遵循 GNU AGPLv3.0 协议公开源码。原项目地址：https://github.com/RoseKhlifa/Image-Studio。
```
