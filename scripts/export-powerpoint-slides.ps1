param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputDir,

  [int]$Width = 1600,
  [int]$Height = 900
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $InputPath)) {
  throw "Input file not found: $InputPath"
}

if (-not (Test-Path -LiteralPath $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$powerPoint = $null
$presentation = $null

try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $presentation = $powerPoint.Presentations.Open($InputPath, $false, $false, $false)

  $presentation.Export($OutputDir, "PNG", $Width, $Height)
  $slideCount = $presentation.Slides.Count

  Write-Output "{""slideCount"":$slideCount,""outputDir"":""$($OutputDir.Replace('\', '\\'))""}"
}
finally {
  if ($presentation -ne $null) {
    $presentation.Close()
  }
  if ($powerPoint -ne $null) {
    $powerPoint.Quit()
  }

  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
