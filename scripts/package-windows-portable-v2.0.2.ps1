param(
  [string]$SourceRoot = "",
  [string]$OutputRoot = "",
  [switch]$SkipBuild,
  [switch]$SkipCliBuild
)

$ErrorActionPreference = "Stop"

$Version = "2.0.2"
$DisplayVersion = "V2.0.2"
$ExeName = "FHL Studio 方汤圆版 V2.0.2.exe"
$PackageName = "FHL-Image-Studio-Desktop-V2.0.2-Windows-Portable"

function Resolve-SourceRoot {
  param([string]$Value)
  if ($Value.Trim()) {
    return (Resolve-Path -LiteralPath $Value).Path
  }
  return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

function Ensure-Dir {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Copy-IfExists {
  param([string]$From, [string]$To)
  if (Test-Path -LiteralPath $From) {
    Copy-Item -LiteralPath $From -Destination $To -Force
  }
}

function Get-WailsCommand {
  $cmd = Get-Command wails -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $cmd = Get-Command wails.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  return ""
}

function Ensure-GoCompilerOnPath {
  $cmd = Get-Command go -ErrorAction SilentlyContinue
  if ($cmd) { return }
  if ($env:GOROOT) {
    $candidate = Join-Path $env:GOROOT "bin\go.exe"
    if (Test-Path -LiteralPath $candidate) {
      $env:PATH = "$(Split-Path -Parent $candidate);$env:PATH"
      return
    }
  }
  $knownCandidates = @(
    "I:\AI\Image-Studio\FHL-Image-Studio方汤圆版-桌面版整理\V1.0.0\方汤圆版-1.0.0\.tmp\go-sdk\go\bin\go.exe",
    "I:\AI\Image-Studio\待确认可删除-旧工作区与临时文件\.tmp\go-portable\go\bin\go.exe"
  )
  foreach ($candidate in $knownCandidates) {
    if (Test-Path -LiteralPath $candidate) {
      $env:GOROOT = (Resolve-Path -LiteralPath (Join-Path (Split-Path -Parent $candidate) "..")).Path
      $env:PATH = "$(Split-Path -Parent $candidate);$env:PATH"
      return
    }
  }
}

function Build-CliRuntime {
  param([string]$Root)
  Ensure-GoCompilerOnPath
  $cliDir = Join-Path $Root "go-cli"
  $outDir = Join-Path $Root "runtime\cli"
  $outExe = Join-Path $outDir "gptcodex-image.exe"
  Ensure-Dir $outDir
  Push-Location $cliDir
  try {
    $ldflags = "-s -w -X github.com/yuanhua/image-gptcodex/cmd/gptcodex-image.packageVersion=$DisplayVersion -X github.com/yuanhua/image-gptcodex/pkg/client.Version=$Version"
    go build -trimpath -ldflags $ldflags -o $outExe .\cmd\gptcodex-image
  } finally {
    Pop-Location
  }
  if (-not (Test-Path -LiteralPath $outExe)) {
    throw "CLI EXE 构建失败: $outExe"
  }
}

$Root = Resolve-SourceRoot $SourceRoot
$ImageStudioRoot = Join-Path $Root "image-studio"
if (-not (Test-Path -LiteralPath (Join-Path $ImageStudioRoot "wails.json"))) {
  throw "找不到 Wails 项目: $ImageStudioRoot"
}

if ($OutputRoot.Trim()) {
  $ReleaseAssets = $OutputRoot
} else {
  $ReleaseAssets = Join-Path (Resolve-Path -LiteralPath (Join-Path $Root "..")).Path "发布附件"
}
Ensure-Dir $ReleaseAssets

$PackageRoot = Join-Path $ReleaseAssets $PackageName
$ZipPath = Join-Path $ReleaseAssets "$PackageName.zip"
if (Test-Path -LiteralPath $PackageRoot) {
  Remove-Item -LiteralPath $PackageRoot -Recurse -Force
}
Ensure-Dir $PackageRoot

$BuiltExe = Join-Path $ImageStudioRoot "build\bin\$ExeName"
$LegacyBuiltExe = Join-Path $ImageStudioRoot "build\bin\fhl-studio.exe"

if (-not $SkipCliBuild) {
  Build-CliRuntime $Root
}

if (-not $SkipBuild) {
  $wails = Get-WailsCommand
  if (-not $wails) {
    throw "当前 PATH 找不到 wails。请先安装 Wails CLI，或手动构建 EXE 后用 -SkipBuild 打包。"
  }
  Ensure-GoCompilerOnPath
  Push-Location $ImageStudioRoot
  try {
    $env:IMAGE_STUDIO_PRODUCT_VERSION = $Version
    $env:IMAGE_STUDIO_FRONTEND_VERSION = $Version
    $env:VITE_APP_VERSION = $Version
    $env:IMAGE_STUDIO_STORAGE_NAMESPACE = "fhl-image-studio-v2.0.2-release"
    wails build -platform windows/amd64 -clean -ldflags "-X github.com/yuanhua/image-gptcodex/pkg/client.Version=$Version"
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $BuiltExe)) {
  if (Test-Path -LiteralPath $LegacyBuiltExe) {
    $BuiltExe = $LegacyBuiltExe
  } else {
    throw "找不到已构建 EXE: $BuiltExe"
  }
}

Copy-Item -LiteralPath $BuiltExe -Destination (Join-Path $PackageRoot $ExeName) -Force
Copy-Item -LiteralPath (Join-Path $Root "scripts\portable-windows-launcher-v2.0.2.cmd") -Destination (Join-Path $PackageRoot "一键启动FHL Studio V2.0.2.cmd") -Force
Copy-Item -LiteralPath (Join-Path $Root "scripts\portable-windows-launcher-v2.0.2.ps1") -Destination (Join-Path $PackageRoot "portable-windows-launcher-v2.0.2.ps1") -Force

foreach ($dir in @("input", "output", "output\images", "output\thumbs", "output\previews", "output\log", "intermediate", "config")) {
  Ensure-Dir (Join-Path $PackageRoot $dir)
}
Ensure-Dir (Join-Path $PackageRoot "runtime")
Ensure-Dir (Join-Path $PackageRoot "runtime\cli")
New-Item -ItemType File -Path (Join-Path $PackageRoot ".fhl-studio-portable") -Force | Out-Null

Copy-IfExists (Join-Path $Root "README.md") (Join-Path $PackageRoot "README.md")
Copy-IfExists (Join-Path $Root "NOTICE.md") (Join-Path $PackageRoot "NOTICE.md")
Copy-IfExists (Join-Path $Root "COMPLIANCE.md") (Join-Path $PackageRoot "COMPLIANCE.md")
Copy-IfExists (Join-Path $Root "LICENSE") (Join-Path $PackageRoot "LICENSE")
Copy-IfExists (Join-Path $Root "RELEASE_NOTES_DESKTOP_V2.0.2.md") (Join-Path $PackageRoot "RELEASE_NOTES_DESKTOP_V2.0.2.md")
Copy-IfExists (Join-Path $Root "config\cli.env.example") (Join-Path $PackageRoot "config\cli.env.example")
Copy-IfExists (Join-Path $Root "image-cli.cmd") (Join-Path $PackageRoot "image-cli.cmd")
Copy-IfExists (Join-Path $Root "AGENTS.md") (Join-Path $PackageRoot "AGENTS.md")
Copy-IfExists (Join-Path $Root "SKILL.md") (Join-Path $PackageRoot "SKILL.md")
$skillInstaller = Get-ChildItem -LiteralPath $Root -Filter "*CodexSkill.cmd" -File -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($skillInstaller) {
  Copy-Item -LiteralPath $skillInstaller.FullName -Destination (Join-Path $PackageRoot $skillInstaller.Name) -Force
}
Copy-IfExists (Join-Path $Root "runtime\cli\gptcodex-image.exe") (Join-Path $PackageRoot "runtime\cli\gptcodex-image.exe")

$Guide = @"
# FHL Studio 方汤圆版 $DisplayVersion Windows 便携版

## 启动方式

双击 `一键启动FHL Studio V2.0.2.cmd`。

这个启动器只负责创建包内目录、设置便携包根目录并启动 EXE，不需要 Node、npm、Vite 或 5173 端口。

## 包内目录

- `input/`：导入和拖入的图片。
- `output/images/`：生成的原图。
- `output/thumbs/`、`output/previews/`：缩略图和生成中预览。
- `output/log/`：启动日志和上游响应日志。
- `intermediate/`：中间处理文件。
- `config/`：本机配置目录。

## API Key

发布包不内置任何 API Key。首次使用请在应用顶部打开上游 API 配置，选择 FHL、APIMart 或 RH，并填入你自己的 Key 或桥接地址。
"@
Set-Content -LiteralPath (Join-Path $PackageRoot "使用说明.md") -Value $Guide -Encoding UTF8

if (Test-Path -LiteralPath $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}
Compress-Archive -LiteralPath $PackageRoot -DestinationPath $ZipPath -Force

Write-Host "[FHL package] Package: $PackageRoot"
Write-Host "[FHL package] Zip:     $ZipPath"


