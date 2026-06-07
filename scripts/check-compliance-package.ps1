param(
  [string]$Root = ""
)

$ErrorActionPreference = "Stop"

function Resolve-Root {
  param([string]$Value)
  if ($Value.Trim()) {
    return (Resolve-Path -LiteralPath $Value).Path
  }
  return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

function Test-SkippablePath {
  param([string]$Path)
  return $Path -match "\\.git\\|\\node_modules\\|\\frontend\\dist\\|\\build\\bin\\"
}

function Test-TextFile {
  param([System.IO.FileInfo]$File)
  if ($File.Length -gt 20MB) { return $false }
  $textExtensions = @(
    ".bat", ".cmd", ".cjs", ".css", ".env", ".example", ".go", ".html",
    ".js", ".json", ".jsonc", ".md", ".mjs", ".ps1", ".svg", ".toml",
    ".ts", ".tsx", ".txt", ".yaml", ".yml"
  )
  return $textExtensions -contains $File.Extension.ToLowerInvariant()
}

function Get-ForbiddenDirs {
  param([string]$ScanRoot)
  $forbiddenNames = @(
    "input", "output", "intermediate", "node_modules", "dist", "bin",
    ".local", ".gradle", ".gradle-wrapper", ".kotlin", ".cache", "ui-audit"
  )

  Get-ChildItem -LiteralPath $ScanRoot -Recurse -Force -Directory -ErrorAction SilentlyContinue |
    Where-Object {
      if ($_.FullName -match "\\.git(\\|$)") { return $false }
      if ($_.FullName -match "\\LICENSES(\\|$)") { return $false }
      if ($_.Name -eq "dist" -and $_.FullName -notmatch "\\frontend\\dist(\\|$)") { return $false }
      if ($_.Name -eq "bin" -and $_.FullName -notmatch "\\build\\bin(\\|$)") { return $false }
      return $forbiddenNames -contains $_.Name
    } |
    Select-Object -ExpandProperty FullName
}

function Get-ForbiddenFiles {
  param([string]$ScanRoot)
  $forbiddenNames = @(
    "cli.env.local", "fhl-api.local.json", "browser-jobs.v1.json"
  )

  Get-ChildItem -LiteralPath $ScanRoot -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object {
      if ($_.FullName -match "\\.git\\") { return $false }
      return
        ($forbiddenNames -contains $_.Name) -or
        ($_.Name -match "\.local(\.json)?$") -or
        ($_.Name -match "^\.codex-vite.*\.log$") -or
        ($_.Name -match "\.(log|tmp)$") -or
        ($_.FullName -match "\\output\\log\\")
    } |
    Select-Object -ExpandProperty FullName
}

function Get-KeyPatternFiles {
  param([string]$ScanRoot)
  $patterns = @(
    "sk-[A-Za-z0-9_-]{20,}",
    "sess-[A-Za-z0-9_-]{20,}",
    "ghp_[A-Za-z0-9_]{20,}",
    "github_pat_[A-Za-z0-9_]{20,}"
  )
  $hits = New-Object System.Collections.Generic.HashSet[string]

  Get-ChildItem -LiteralPath $ScanRoot -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object { -not (Test-SkippablePath $_.FullName) -and (Test-TextFile $_) } |
    ForEach-Object {
      foreach ($pattern in $patterns) {
        try {
          if (Select-String -LiteralPath $_.FullName -Pattern $pattern -Quiet -ErrorAction Stop) {
            [void]$hits.Add($_.FullName)
            break
          }
        } catch {}
      }
    }

  $hits
}

function Test-ExampleConfig {
  param([string]$ScanRoot)
  $errors = New-Object System.Collections.Generic.List[string]
  $example = Join-Path $ScanRoot "config\cli.env.example"
  if (-not (Test-Path -LiteralPath $example)) {
    [void]$errors.Add("MISSING_EXAMPLE_CONFIG: $example")
    return $errors
  }
  $raw = Get-Content -LiteralPath $example -Raw
  if ($raw -match "(?m)^IMAGE_STUDIO_API_KEY=.+$") {
    [void]$errors.Add("EXAMPLE_API_KEY_NOT_EMPTY: $example")
  }
  $errors
}

$scanRoot = Resolve-Root $Root
$issues = New-Object System.Collections.Generic.List[string]

foreach ($item in (Get-ForbiddenDirs $scanRoot)) { [void]$issues.Add("FORBIDDEN_DIR: $item") }
foreach ($item in (Get-ForbiddenFiles $scanRoot)) { [void]$issues.Add("FORBIDDEN_FILE: $item") }
foreach ($item in (Get-KeyPatternFiles $scanRoot)) { [void]$issues.Add("KEY_PATTERN_FILE: $item") }
foreach ($item in (Test-ExampleConfig $scanRoot)) { [void]$issues.Add($item) }

Write-Host "[FHL compliance] Root: $scanRoot"
Write-Host "[FHL compliance] Issues: $($issues.Count)"

if ($issues.Count -gt 0) {
  $issues | ForEach-Object { Write-Host $_ }
  exit 1
}

Write-Host "[FHL compliance] OK"
