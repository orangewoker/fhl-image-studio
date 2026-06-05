# FHL Image Studio 方汤圆 CLI 魔改版 V2.0.0

> Independent modified distribution based on [RoseKhlifa/Image-Studio](https://github.com/RoseKhlifa/Image-Studio). This project is not affiliated with, endorsed by, or maintained by the upstream project.

FHL Image Studio 方汤圆 CLI 魔改版是一个面向 Windows 的便携式图像生成工具包，基于上游 MIT 开源项目 `Image-Studio` 深度改造。当前发行版聚焦：

- FHL Responses API 一键配置：`https://www.fhl.mom`
- 文生图、图生图、多参考图输入
- Codex Skill 调用本地 CLI，并把生成图回传到 Codex 对话框预览
- 浏览器模式后台任务、结果流、审计日志
- 发行包隔离：不携带 API Key、历史、输入图、输出图或本机日志

## 下载

请到本仓库的 **Releases** 页面下载：

```text
FHL-Image-Studio方汤圆CLI魔改版V2.0.0-发行版-20260605-152640.zip
```

## 快速开始

1. 解压 zip。
2. 双击 `一键启动FHL桌面版.cmd`。
3. 在 UI 中点击「一键配置 FHL API」。
4. 输入你自己的 FHL API Key。
5. 先在 UI 中测试或生成一次，跑通后 CLI 配置会自动同步。
6. 需要让 Codex 使用 CLI 时，运行根目录的 `安装CodexSkill.cmd` 安装 Skill。

## 安全说明

- 发行包不内置 API Key。
- 发行包不携带历史图像、输入图像、输出图像、raw 日志或审计日志。
- API Key 由用户在本机 UI 中输入，并保存到本机私有配置。
- 浏览器缓存和密码自动填充已做隔离处理，避免旧版本配置混入新发行包。

## 与上游项目的关系

本项目基于 [RoseKhlifa/Image-Studio](https://github.com/RoseKhlifa/Image-Studio) 修改，原项目使用 MIT License。当前仓库是独立修改发行版，不是上游官方版本，也不向上游提交 PR。

保留上游版权声明和 MIT License；本项目新增改动由当前维护者维护。

## License

Upstream project is licensed under the MIT License. See [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md).
