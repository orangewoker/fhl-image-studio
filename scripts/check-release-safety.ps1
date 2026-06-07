param(
  [string]$ReleaseRoot = "",
  [string]$ZipPath = ""
)

$ErrorActionPreference = "Stop"

function Resolve-ReleaseRoot {
  param([string]$Value)
  if ($Value.Trim()) {
    return (Resolve-Path -LiteralPath $Value).Path
  }
  return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
}

function Test-SkippableTextPath {
  param([string]$Path)
  if ($Path -match "\\node_modules\\|\\.git\\") { return $true }
  $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  $textExt = @(
    ".bat", ".cmd", ".cjs", ".css", ".env", ".example", ".html", ".js",
    ".json", ".jsonc", ".map", ".md", ".mjs", ".ps1", ".svg", ".toml",
    ".ts", ".tsx", ".txt", ".yaml", ".yml"
  )
  return -not ($textExt -contains $ext)
}

function Get-ForbiddenFiles {
  param([string]$Root)
  $forbiddenNames = @("cli.env.local", "fhl-api.local.json", "browser-jobs.v1.json")
  Get-ChildItem -LiteralPath $Root -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object {
      $full = $_.FullName
      ($forbiddenNames -contains $_.Name) -or
      ($full -match "\\.local(\\|$)") -or
      ($full -match "\\ui-audit\\") -or
      ($_.Name -match "^session-.*\.(jsonl|md)$")
    } |
    Select-Object -ExpandProperty FullName
}

function Get-KeyPatternFiles {
  param([string]$Root)
  $pattern = "sk-[A-Za-z0-9_-]{20,}"
  $hits = New-Object System.Collections.Generic.HashSet[string]
  Get-ChildItem -LiteralPath $Root -Recurse -Force -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -lt 20MB -and -not (Test-SkippableTextPath $_.FullName) } |
    ForEach-Object {
      try {
        $match = Select-String -LiteralPath $_.FullName -Pattern $pattern -Quiet -ErrorAction Stop
        if ($match) { [void]$hits.Add($_.FullName) }
      } catch {}
    }
  $hits
}

function Test-CliEnvExample {
  param([string]$Root)
  $programRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
  $example = Join-Path $programRoot.Path "config\cli.env.example"
  if (-not (Test-Path -LiteralPath $example)) {
    return @("MISSING: $example")
  }
  $raw = Get-Content -LiteralPath $example -Raw
  if ($raw -match "(?m)^IMAGE_STUDIO_API_KEY=.+$") {
    return @("API_KEY_NOT_EMPTY: $example")
  }
  @()
}

function Test-EmptyUserDirs {
  param([string]$Root)
  $errors = New-Object System.Collections.Generic.List[string]
  foreach ($dir in @("input", "intermediate")) {
    $path = Join-Path $Root $dir
    if (-not (Test-Path -LiteralPath $path)) {
      [void]$errors.Add("MISSING_DIR: $path")
      continue
    }
    $files = Get-ChildItem -LiteralPath $path -Force -File -Recurse -ErrorAction SilentlyContinue
    if ($files) { [void]$errors.Add("DIR_NOT_EMPTY: $path") }
  }
  $output = Join-Path $Root "output"
  if (-not (Test-Path -LiteralPath $output)) {
    [void]$errors.Add("MISSING_DIR: $output")
  } else {
    $files = Get-ChildItem -LiteralPath $output -Force -File -Recurse -ErrorAction SilentlyContinue
    if ($files) { [void]$errors.Add("OUTPUT_HAS_FILES: $output") }
  }
  $errors
}

function Get-ZipTextEntryNames {
  param($Zip)
  $textExt = @(
    ".bat", ".cmd", ".cjs", ".css", ".env", ".example", ".html", ".js",
    ".json", ".jsonc", ".map", ".md", ".mjs", ".ps1", ".svg", ".toml",
    ".ts", ".tsx", ".txt", ".yaml", ".yml"
  )
  $Zip.Entries | Where-Object {
    $_.Length -lt 20MB -and
    $_.FullName -notmatch "[\\/]node_modules[\\/]|[\\/]\.git[\\/]" -and
    ($textExt -contains ([System.IO.Path]::GetExtension($_.FullName).ToLowerInvariant()))
  }
}

function Test-ZipSafety {
  param([string]$Path)
  if (-not $Path.Trim()) { return @() }
  if (-not (Test-Path -LiteralPath $Path)) { return @("ZIP_NOT_FOUND: $Path") }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $errors = New-Object System.Collections.Generic.List[string]
    $badEntries = $zip.Entries | Where-Object {
      $_.FullName -match "(^|/)(cli\.env\.local|fhl-api\.local\.json|browser-jobs\.v1\.json)$|\.local/|ui-audit/|session-.*\.(jsonl|md)$"
    }
    foreach ($entry in $badEntries) {
      [void]$errors.Add("ZIP_FORBIDDEN_ENTRY: $($entry.FullName)")
    }

    $pattern = "sk-[A-Za-z0-9_-]{20,}"
    foreach ($entry in (Get-ZipTextEntryNames $zip)) {
      try {
        $reader = New-Object System.IO.StreamReader($entry.Open())
        try {
          $text = $reader.ReadToEnd()
          if ($text -match $pattern) {
            [void]$errors.Add("ZIP_KEY_PATTERN: $($entry.FullName)")
          }
        } finally {
          $reader.Dispose()
        }
      } catch {}
    }
    $errors
  } finally {
    $zip.Dispose()
  }
}

$root = Resolve-ReleaseRoot $ReleaseRoot
$allErrors = New-Object System.Collections.Generic.List[string]

foreach ($item in (Get-ForbiddenFiles $root)) { [void]$allErrors.Add("FORBIDDEN_FILE: $item") }
foreach ($item in (Get-KeyPatternFiles $root)) { [void]$allErrors.Add("KEY_PATTERN_FILE: $item") }
foreach ($item in (Test-CliEnvExample $root)) { [void]$allErrors.Add($item) }
foreach ($item in (Test-EmptyUserDirs $root)) { [void]$allErrors.Add($item) }

if (-not $ZipPath.Trim()) {
  $parent = Split-Path -Parent $root
  $name = Split-Path -Leaf $root
  $candidate = Get-ChildItem -LiteralPath $parent -Filter "$name*.zip" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($candidate) { $ZipPath = $candidate.FullName }
}
foreach ($item in (Test-ZipSafety $ZipPath)) { [void]$allErrors.Add($item) }

Write-Host "[FHL release safety] Root: $root"
if ($ZipPath.Trim()) { Write-Host "[FHL release safety] Zip:  $ZipPath" }
Write-Host "[FHL release safety] Issues: $($allErrors.Count)"

if ($allErrors.Count -gt 0) {
  $allErrors | ForEach-Object { Write-Host $_ }
  exit 1
}

Write-Host "[FHL release safety] OK"
