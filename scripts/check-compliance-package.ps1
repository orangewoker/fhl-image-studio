param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$rootPath = (Resolve-Path $Root).Path
$failures = New-Object System.Collections.Generic.List[string]
$textExtensions = @(
  '.bat','.cmd','.css','.env','.example','.go','.gradle','.html','.java',
  '.js','.json','.kt','.kts','.md','.mjs','.properties','.ps1','.toml',
  '.ts','.tsx','.txt','.xml','.yaml','.yml'
)
$secretPattern = 'sk-[A-Za-z0-9_-]{40,}'
$forbiddenNames = @(
  'cli.env.local',
  'fhl-api.local.json',
  'browser-jobs.v1.json'
)

function Add-Failure([string]$Message) {
  $script:failures.Add($Message) | Out-Null
}

function Test-PathName([string]$DisplayPath) {
  $normalized = $DisplayPath.Replace('/', '\').ToLowerInvariant()
  $name = [System.IO.Path]::GetFileName($normalized)
  if ($forbiddenNames -contains $name) {
    Add-Failure "forbidden file: $DisplayPath"
  }
  if ($normalized -match '\\.local\\') {
    Add-Failure "forbidden .local path: $DisplayPath"
  }
  if ($normalized -match '\\.gradle-wrapper\\') {
    Add-Failure "forbidden Gradle download cache path: $DisplayPath"
  }
  if ($normalized -match '\\ui-audit\\') {
    Add-Failure "forbidden audit log path: $DisplayPath"
  }
  if ($normalized -match '\\output\\log\\.+') {
    Add-Failure "forbidden output log file: $DisplayPath"
  }
  if ($normalized -match '\\release-assets\\.+\\(input|output|intermediate)\\.+') {
    Add-Failure "forbidden runtime image/state file: $DisplayPath"
  }
  if ($normalized -match 'session-[^\\]+\\.(jsonl|md)$') {
    Add-Failure "forbidden session log: $DisplayPath"
  }
}

function Test-TextContent([string]$DisplayPath, [string]$Text) {
  if ($Text -match $secretPattern) {
    Add-Failure "possible API key pattern in: $DisplayPath"
  }
}

function Test-FileContent([System.IO.FileInfo]$File) {
  if ($textExtensions -notcontains $File.Extension.ToLowerInvariant()) {
    return
  }
  if ($File.Length -gt 5MB) {
    return
  }
  $text = Get-Content -LiteralPath $File.FullName -Raw -ErrorAction SilentlyContinue
  if ($null -ne $text) {
    Test-TextContent $File.FullName $text
  }
}

Write-Host "Scanning package root: $rootPath"

$files = Get-ChildItem -LiteralPath $rootPath -Recurse -File -Force
foreach ($file in $files) {
  Test-PathName $file.FullName
  Test-FileContent $file
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archives = $files | Where-Object { $_.Extension.ToLowerInvariant() -in @('.zip','.apk') }
foreach ($archive in $archives) {
  Write-Host "Inspecting archive: $($archive.FullName)"
  $zip = [System.IO.Compression.ZipFile]::OpenRead($archive.FullName)
  try {
    foreach ($entry in $zip.Entries) {
      if ([string]::IsNullOrEmpty($entry.Name)) { continue }
      $entryPath = "$($archive.FullName)!$($entry.FullName)"
      Test-PathName $entryPath
      $ext = [System.IO.Path]::GetExtension($entry.Name).ToLowerInvariant()
      if ($textExtensions -contains $ext -and $entry.Length -le 2MB) {
        $stream = $entry.Open()
        try {
          $reader = New-Object System.IO.StreamReader($stream)
          try {
            Test-TextContent $entryPath $reader.ReadToEnd()
          } finally {
            $reader.Dispose()
          }
        } finally {
          $stream.Dispose()
        }
      }
    }
  } finally {
    $zip.Dispose()
  }
}

if ($failures.Count -gt 0) {
  Write-Host ''
  Write-Host 'Compliance scan failed:' -ForegroundColor Red
  $failures | Sort-Object -Unique | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host 'Compliance scan passed.' -ForegroundColor Green
