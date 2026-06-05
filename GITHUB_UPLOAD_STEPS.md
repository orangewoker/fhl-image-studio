# GitHub 上架步骤

## 1. 新建仓库

建议仓库名：

```text
fhl-image-studio
```

建议描述：

```text
FHL Image Studio 方汤圆 CLI 魔改版，基于 RoseKhlifa/Image-Studio 的独立修改发行版。
```

仓库可设为 Public。不要勾选自动生成 README / LICENSE / .gitignore，因为本目录已经准备好了。

## 2. 推送本地仓库

在本目录执行：

```bat
git remote add origin https://github.com/你的用户名/fhl-image-studio.git
git branch -M main
git push -u origin main
```

## 3. 创建 Release

GitHub 仓库页面进入：

```text
Releases -> Draft a new release
```

建议填写：

```text
Tag: v2.0.0
Title: FHL Image Studio 方汤圆 CLI 魔改版 V2.0.0
```

Release notes 复制 `RELEASE_NOTES_V2.0.0.md` 的内容。

上传文件：

```text
release-assets\FHL-Image-Studio方汤圆CLI魔改版V2.0.0-发行版-20260605-152640.zip
```

## 4. 发布前确认

- README 顶部已声明这是 independent modified distribution。
- LICENSE 保留上游 MIT License。
- NOTICE.md 保留上游项目来源和修改版声明。
- Release zip 已经过安全检查，不包含 API Key、本机配置、日志或历史图片。
