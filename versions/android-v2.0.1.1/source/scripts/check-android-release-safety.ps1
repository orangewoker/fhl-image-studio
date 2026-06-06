param(
  [string]$Root = ".",
  [string]$ZipPath = ""
)

$ErrorActionPreference = "Stop"
$resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
$errors = New-Object System.Collections.Generic.List[string]

$forbiddenNames = @(
  "cli.env.local",
  "fhl-api.local.json",
  "browser-jobs.v1.json"
)

Get-ChildItem -LiteralPath $resolvedRoot -Recurse -Force -File -ErrorAction SilentlyContinue |
  Where-Object {
    $path = $_.FullName
    $name = $_.Name
    $isForbiddenName = $forbiddenNames -contains $name
    $isPrivatePath = $path -match "[\\/]\.local[\\/]" -or $path -match "[\\/]output[\\/]log[\\/]" -or $path -match "[\\/]input[\\/]" -or $path -match "[\\/]intermediate[\\/]"
    $isSessionLog = $name -match "^session-.*\.(jsonl|md)$"
    $isForbiddenName -or $isPrivatePath -or $isSessionLog
  } |
  ForEach-Object { [void]$errors.Add("FORBIDDEN_FILE: $($_.FullName)") }

$textExt = @(".bat", ".cmd", ".css", ".env", ".example", ".html", ".js", ".json", ".md", ".mjs", ".ps1", ".svg", ".ts", ".tsx", ".txt", ".xml", ".yml", ".yaml", ".kts", ".kt")
$pattern = "sk-[A-Za-z0-9_-]{20,}"
Get-ChildItem -LiteralPath $resolvedRoot -Recurse -Force -File -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Length -lt 20MB -and
    $_.FullName -notmatch "[\\/]node_modules[\\/]|[\\/]\.git[\\/]|[\\/]build[\\/]|[\\/]dist[\\/]" -and
    ($textExt -contains ([System.IO.Path]::GetExtension($_.FullName).ToLowerInvariant()))
  } |
  ForEach-Object {
    try {
      if (Select-String -LiteralPath $_.FullName -Pattern $pattern -Quiet -ErrorAction Stop) {
        [void]$errors.Add("KEY_PATTERN_FILE: $($_.FullName)")
      }
    } catch {}
  }

if ($ZipPath.Trim()) {
  if (-not (Test-Path -LiteralPath $ZipPath)) {
    [void]$errors.Add("ZIP_NOT_FOUND: $ZipPath")
  } else {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
      foreach ($entry in $zip.Entries) {
        if ($entry.FullName -match "(^|/)(cli\.env\.local|fhl-api\.local\.json|browser-jobs\.v1\.json)$|\.local/|output/log/|session-.*\.(jsonl|md)$") {
          [void]$errors.Add("ZIP_FORBIDDEN_ENTRY: $($entry.FullName)")
        }
      }
    } finally {
      $zip.Dispose()
    }
  }
}

Write-Host "[Android release safety] Root: $resolvedRoot"
Write-Host "[Android release safety] Issues: $($errors.Count)"
if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Host $_ }
  exit 1
}
Write-Host "[Android release safety] OK"
