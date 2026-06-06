# FHL Image Studio 方汤圆版 AGPL 合规源码包

本仓库目录用于公开 FHL Image Studio 方汤圆版的对应源码和发布说明，覆盖已经分发的两个版本：

| 版本 | 类型 | 对应源码 | 发布资产 |
| --- | --- | --- | --- |
| Desktop V2.0.0 | Windows 桌面便携版 | `versions/desktop-v2.0.0/source` | `versions/desktop-v2.0.0/release-assets` |
| Android V2.0.1.1 | Android APK | `versions/android-v2.0.1.1/source` | `versions/android-v2.0.1.1/release-assets` |

## 来源与协议

本项目是基于 [RoseKhlifa/Image-Studio](https://github.com/RoseKhlifa/Image-Studio) 的独立修改发行版，不是上游官方版本。

根据上游作者提醒和上游仓库当前协议声明，本合规包按 GNU Affero General Public License v3.0 公开对应源码。完整协议见 `LICENSE`，上游来源说明见 `NOTICE.md`。

## 安全说明

- 不内置任何 API Key。
- 用户首次使用需要自己配置 FHL API。
- 发布包不应包含 `cli.env.local`、`fhl-api.local.json`、浏览器任务日志、审计日志、输入图、输出图或中间图。
- 上传 GitHub 前请运行 `scripts/check-compliance-package.ps1`。

## GitHub Release 建议

建议分别创建两个 Release，避免覆盖旧版本资产：

- `desktop-v2.0.0-agpl`
- `android-v2.0.1.1-agpl`

Release notes 必须包含上游来源链接、AGPLv3 声明、对应源码路径和“无内置 API Key”说明。
