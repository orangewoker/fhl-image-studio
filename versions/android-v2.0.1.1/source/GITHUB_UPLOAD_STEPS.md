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

## 推送源码

确认 remote 指向你自己的仓库：

```bat
git remote -v
```

如果是首次推送：

```bat
git remote add origin https://github.com/supart/fhl-image-studio.git
git branch -M main
git push -u origin main
```

## 创建 Release

Android V2.0.1 使用独立 tag：

```text
Tag: v2.0.1-android
Title: FHL Image Studio 方汤圆版 V2.0.1 Android
```

Release notes 复制 `RELEASE_NOTES_V2.0.1_ANDROID.md`。

上传资产：

```text
FHL-Image-Studio方汤圆版-V2.0.1-Android-Release-20260606.apk
FHL-Image-Studio方汤圆版-V2.0.1-Android-Release-20260606.zip
```

## 发布前确认

- README 顶部说明这是独立修改发行版。
- README / NOTICE / Release notes 都包含上游原仓库链接。
- LICENSE 为 GNU AGPLv3.0。
- 每个 APK/ZIP 都能找到对应源码 tag/source archive。
- 发布包和源码扫描不到 API Key、本机配置、输出图、raw 日志或审计日志。

## 外部分发文案

B站、QQ群文件、下载页可使用：

```text
本项目是基于 RoseKhlifa/Image-Studio 的独立修改发行版，遵循 GNU AGPLv3.0 协议公开源码。原项目地址：https://github.com/RoseKhlifa/Image-Studio。
```
