# AGPL 合规说明

## 目标

这个目录用于按上游作者提醒公开 FHL Image Studio 方汤圆版已分发版本的对应源码。

覆盖版本：

- 桌面版 V2.0.0
- Android 版 V2.0.1.1

## 已做处理

- 根目录保留 AGPLv3 `LICENSE`。
- `NOTICE.md` 标注上游项目和原仓库链接。
- 每个版本都有独立源码目录和发布资产目录。
- 发布资产与源码分离，APK/ZIP 不进入 git 历史，只作为 GitHub Release 附件。
- 排除本机私有配置、API Key、运行日志、用户输入输出图片和构建缓存。

## 发布前检查

运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-compliance-package.ps1
```

检查通过后再提交源码、推送分支、创建 GitHub Release。

## 分发渠道文案

推荐在 GitHub、B站、QQ群文件说明、下载页中使用：

```text
本项目是基于 RoseKhlifa/Image-Studio 的独立修改发行版，遵循 GNU AGPLv3.0 协议公开源码。原项目地址：https://github.com/RoseKhlifa/Image-Studio。
```
