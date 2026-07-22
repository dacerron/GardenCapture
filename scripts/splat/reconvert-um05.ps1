# Re-convert UM05_HighQuality_0SH into comparison bundles for PlayCanvas quality testing.
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/splat/reconvert-um05.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/splat/reconvert-um05.ps1 -CheckOnly
#   powershell -ExecutionPolicy Bypass -File scripts/splat/reconvert-um05.ps1 -Variant lod0-only,single-sog
#   powershell -ExecutionPolicy Bypass -File scripts/splat/reconvert-um05.ps1 -Force
#
# Prerequisites:
#   @playcanvas/splat-transform on PATH (v2.4+)
#   ASSETS_CDN_URL — HTTPS origin for splats (required unless -SkipDownload and the
#                    source file already exists under temp/)
#
# Outputs under work/out/ (served at /work-out/… during npm run dev:viewer):
#   UM05_compare_lod0-only/       streamed LOD, finest level only (no decimation)
#   UM05_compare_single-sog/      single .sog from cleaned lod0
#   UM05_compare_lod-standard/    production-style 3-level streamed LOD
#   UM05_compare_nocrop-lod0/     lod0-only without ±150 m position crop
#   UM05_compare_rotation-baked/  lod0-only with -r 180,0,0 baked (test ?orientation=0)
#
# After build, open the printed localhost URLs with &budget=0&lod=0 to isolate runtime caps.

param(
    [string[]]$Variant = @(
        "lod0-only",
        "single-sog",
        "lod-standard",
        "nocrop-lod0",
        "rotation-baked"
    ),
    [switch]$SkipDownload,
    [switch]$Force,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

$BundleBase = "UM05_HighQuality_0SH"
$SourceName = "$BundleBase.splat"
$AssetsCdnUrl = $env:ASSETS_CDN_URL
if ([string]::IsNullOrWhiteSpace($AssetsCdnUrl)) {
    if (-not $SkipDownload) {
        throw "error: missing ASSETS_CDN_URL. Export your assets CDN origin (e.g. https://YOUR_ASSETS_CLOUDFRONT_DOMAIN) or use -SkipDownload with a local temp/$SourceName file."
    }
    $SourceUrl = $null
} else {
    $SourceUrl = "$($AssetsCdnUrl.TrimEnd('/'))/splats/$SourceName"
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$TempDir = Join-Path $RepoRoot "temp"
$WorkLod = Join-Path $RepoRoot "work/lod/$BundleBase-compare"
$WorkOut = Join-Path $RepoRoot "work/out"
$LogPath = Join-Path $RepoRoot "work/reconvert-um05.log"

$TargetCoarseM = 1.05
$MaxDecimateSteps = 3
$DefaultOutlierM = 200.0
$DefaultBoxHalfM = 150.0

$ScaleInfFilters = @(
    "-V", "scale_0_raw,gt,-100",
    "-V", "scale_1_raw,gt,-100",
    "-V", "scale_2_raw,gt,-100"
)

$VariantDefs = @{
    "lod0-only" = @{
        Folder = "UM05_compare_lod0-only"
        Note = "Streamed LOD, LOD0 only (no decimation)."
        Orientation = 180
    }
    "single-sog" = @{
        Folder = "UM05_compare_single-sog"
        Note = "Single .sog file from cleaned lod0."
        Orientation = 180
    }
    "lod-standard" = @{
        Folder = "UM05_compare_lod-standard"
        Note = "Production-style 3-level streamed LOD (decimate 50% x2)."
        Orientation = 180
    }
    "nocrop-lod0" = @{
        Folder = "UM05_compare_nocrop-lod0"
        Note = "LOD0 streamed; position crop disabled (outlier threshold 9999 m)."
        Orientation = 180
        OutlierM = 9999.0
    }
    "rotation-baked" = @{
        Folder = "UM05_compare_rotation-baked"
        Note = "LOD0 streamed; rotation baked at convert (-r 180,0,0). Test with ?orientation=0."
        Orientation = 0
        BakeRotation = "180,0,0"
    }
}

function Write-ReconvertLog {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    New-Item -ItemType Directory -Force -Path (Split-Path $LogPath) | Out-Null
    Add-Content -Path $LogPath -Value $line -Encoding utf8
    Write-Host $Message
}

function Invoke-SplatTransform {
    param([string[]]$SplatCliArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & splat-transform @SplatCliArgs 2>&1 | Out-String
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) {
        $cmd = "splat-transform $($SplatCliArgs -join ' ')"
        $detail = $output.Trim()
        if ($detail) { throw "splat-transform failed (exit $code): $cmd`n$detail" }
        throw "splat-transform failed (exit $code): $cmd"
    }
}

function Get-SplatSummary {
    param([string]$Path)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = (splat-transform $Path -m null 2>&1) | Out-String
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "splat-transform summary failed for $Path" }

    $summary = @{
        Path = $Path
        CountM = $null
        MaxAbsCoord = 0.0
        ScaleInfTotal = 0
    }

    if ($out -match "([\d.]+)M gaussians") {
        $summary.CountM = [double]$Matches[1]
    } elseif ($out -match "([\d.]+)K gaussians") {
        $summary.CountM = [double]$Matches[1] / 1000
    }

    foreach ($line in ($out -split "`n")) {
        if ($line -notmatch '^\| (x|y|z|scale_0|scale_1|scale_2)\s+\|') { continue }
        $parts = ($line -split '\|').ForEach({ $_.Trim() }) | Where-Object { $_ -ne "" }
        if ($parts.Count -lt 8) { continue }
        $col = $parts[0]
        $min = [double]$parts[1]
        $max = [double]$parts[2]
        $infs = [int]$parts[7]
        if ($col -match '^scale_') {
            $summary.ScaleInfTotal += $infs
        } else {
            $axisMax = [math]::Max([math]::Abs($min), [math]::Abs($max))
            if ($axisMax -gt $summary.MaxAbsCoord) { $summary.MaxAbsCoord = $axisMax }
        }
    }

    return $summary
}

function Import-Lod0Ply {
    param(
        [string]$InputPath,
        [string]$Lod0Path,
        [string]$Label,
        [double]$OutlierM = $DefaultOutlierM,
        [double]$BoxHalfM = $DefaultBoxHalfM,
        [string]$BakeRotation
    )

    Write-ReconvertLog "  [$Label] import -> lod0.ply"
    $importArgs = @("-w", $InputPath)
    if ($BakeRotation) {
        Write-ReconvertLog "  [$Label] baking rotation -r $BakeRotation"
        $importArgs += @("-r", $BakeRotation)
    }
    Invoke-SplatTransform -SplatCliArgs ($importArgs + $ScaleInfFilters + @($Lod0Path))

    $summary = Get-SplatSummary $Lod0Path
    Write-ReconvertLog ("  [$Label] after scale filter: {0}M gaussians, max |coord|={1}m" -f `
        $summary.CountM, [math]::Round($summary.MaxAbsCoord, 1))

    if ($summary.MaxAbsCoord -gt $OutlierM) {
        $box = "-$BoxHalfM,-$BoxHalfM,-$BoxHalfM,$BoxHalfM,$BoxHalfM,$BoxHalfM"
        $tmp = "$Lod0Path.tmp.ply"
        Write-ReconvertLog ("  [$Label] cropping to [{0}] (outlier > {1}m)" -f $box, $OutlierM)
        Invoke-SplatTransform -SplatCliArgs @("-w", $Lod0Path, "-B", $box, $tmp)
        Move-Item -Force $tmp $Lod0Path
        $summary = Get-SplatSummary $Lod0Path
        Write-ReconvertLog ("  [$Label] after crop: {0}M gaussians, max |coord|={1}m" -f `
            $summary.CountM, [math]::Round($summary.MaxAbsCoord, 1))
    }

    return $summary
}

function Build-LodChain {
    param(
        [string]$Lod0Path,
        [string]$LodDir
    )

    $lodFiles = @($Lod0Path)
    $countM = (Get-SplatSummary $Lod0Path).CountM
    $step = 0

    while ($countM -gt $TargetCoarseM -and $step -lt $MaxDecimateSteps) {
        $step++
        $prev = $lodFiles[-1]
        $next = Join-Path $LodDir "lod$step.ply"
        Write-ReconvertLog "  decimate -> lod$step.ply"
        Invoke-SplatTransform -SplatCliArgs @("-w", $prev, "--decimate", "50%", $next)
        $lodFiles += $next
        $countM = (Get-SplatSummary $next).CountM
        Write-ReconvertLog ("      lod{0}: {1}M gaussians" -f $step, $countM)
    }

    return ,$lodFiles
}

function Bundle-StreamedLod {
    param(
        [string[]]$LodFiles,
        [string]$ManifestPath
    )

    $args = @("-w")
    for ($i = 0; $i -lt $LodFiles.Count; $i++) {
        $args += $LodFiles[$i]
        $args += "--lod"
        $args += "$i"
    }
    $args += $ManifestPath
    Write-ReconvertLog "  bundle streamed LOD -> $ManifestPath ($($LodFiles.Count) level(s))"
    Invoke-SplatTransform -SplatCliArgs $args
}

function Get-VariantStatus {
    param([string]$Name)

    $def = $VariantDefs[$Name]
    if (-not $def) { return $null }

    $folder = Join-Path $WorkOut $def.Folder
    $lodMeta = Join-Path $folder "lod-meta.json"
    $sog = Join-Path $folder "$BundleBase.sog"

    $ready = $false
    $artifact = ""
    if ($Name -eq "single-sog") {
        $ready = Test-Path -LiteralPath $sog
        $artifact = $sog
    } else {
        $ready = Test-Path -LiteralPath $lodMeta
        $artifact = $lodMeta
    }

    [PSCustomObject]@{
        Variant = $Name
        Folder = $def.Folder
        Ready = $ready
        Artifact = $artifact
        Note = $def.Note
        ViewerOrientation = $def.Orientation
    }
}

function Get-ViewerUrl {
    param(
        [string]$Name,
        [string]$StatusArtifact
    )

    $def = $VariantDefs[$Name]
    $orientation = $def.Orientation
    if ($Name -eq "single-sog") {
        $rel = "/work-out/$($def.Folder)/$BundleBase.sog"
    } else {
        $rel = "/work-out/$($def.Folder)/lod-meta.json"
    }
    $query = "url=$([uri]::EscapeDataString($rel))&budget=0&lod=0&orientation=$orientation&groundClamp=0"
    return "http://localhost:5173/viewer/?$query"
}

function Build-Variant {
    param([string]$Name)

    $def = $VariantDefs[$Name]
    if (-not $def) { throw "Unknown variant: $Name" }

    $outDir = Join-Path $WorkOut $def.Folder
    $lodDir = Join-Path $WorkLod $Name
    New-Item -ItemType Directory -Force -Path $outDir, $lodDir | Out-Null

    $lod0 = Join-Path $lodDir "lod0.ply"
    $sourcePath = Join-Path $TempDir $SourceName

    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Missing source: $sourcePath (run without -SkipDownload)"
    }

    $outlierM = if ($null -ne $def.OutlierM) { [double]$def.OutlierM } else { $DefaultOutlierM }
    $summary = Import-Lod0Ply `
        -InputPath $sourcePath `
        -Lod0Path $lod0 `
        -Label $Name `
        -OutlierM $outlierM `
        -BakeRotation $def.BakeRotation

    switch ($Name) {
        "single-sog" {
            $sogOut = Join-Path $outDir "$BundleBase.sog"
            Write-ReconvertLog "  [$Name] export SOG -> $sogOut"
            Invoke-SplatTransform -SplatCliArgs @("-w", $lod0, $sogOut)
        }
        "lod-standard" {
            $lodFiles = Build-LodChain -Lod0Path $lod0 -LodDir $lodDir
            Bundle-StreamedLod -LodFiles $lodFiles -ManifestPath (Join-Path $outDir "lod-meta.json")
        }
        default {
            Bundle-StreamedLod -LodFiles @($lod0) -ManifestPath (Join-Path $outDir "lod-meta.json")
        }
    }

    return [PSCustomObject]@{
        Variant = $Name
        GaussiansM = $summary.CountM
        MaxAbsCoordM = $summary.MaxAbsCoord
        Output = $outDir
    }
}

# --- main ---

$requested = @()
foreach ($v in $Variant) {
    foreach ($part in ($v -split ',')) {
        $trimmed = $part.Trim()
        if ($trimmed) { $requested += $trimmed }
    }
}
$requested = $requested | Select-Object -Unique

foreach ($name in $requested) {
    if (-not $VariantDefs.ContainsKey($name)) {
        throw "Unknown variant '$name'. Valid: $($VariantDefs.Keys -join ', ')"
    }
}

Write-ReconvertLog "=== reconvert-um05 ($($requested -join ', ')) ==="

if ($CheckOnly) {
    Write-Host ""
    Write-Host "UM05 comparison bundles:" -ForegroundColor Cyan
    foreach ($name in $VariantDefs.Keys) {
        $status = Get-VariantStatus $name
        $flag = if ($status.Ready) { "READY" } else { "missing" }
        Write-Host ("  [{0}] {1} - {2}" -f $flag, $status.Folder, $status.Note)
        if ($status.Ready) {
            Write-Host ("         {0}" -f (Get-ViewerUrl $name $status.Artifact))
        }
    }
    Write-Host ""
    Write-Host 'Legacy reference: http://localhost:5173/viewer/?m=UM_05&renderer=legacy' -ForegroundColor DarkGray
    exit 0
}

New-Item -ItemType Directory -Force -Path $TempDir, $WorkLod, $WorkOut | Out-Null
$sourcePath = Join-Path $TempDir $SourceName

if (-not $SkipDownload -and -not (Test-Path -LiteralPath $sourcePath)) {
    Write-ReconvertLog "Downloading $SourceUrl -> $sourcePath"
    Invoke-WebRequest -Uri $SourceUrl -OutFile $sourcePath -UseBasicParsing
} elseif (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Source not found: $sourcePath. Remove -SkipDownload or place the .splat file there."
}

$results = @()
foreach ($name in $requested) {
    $status = Get-VariantStatus $name
    if ($status.Ready -and -not $Force) {
        Write-ReconvertLog "Skipping $name (already built; use -Force to rebuild)"
        continue
    }

    Write-Host ""
    Write-Host "Building $name ..." -ForegroundColor Cyan
    Write-ReconvertLog "--- build $name ---"
    $results += Build-Variant $name
}

Write-Host ""
Write-Host 'Done. Local viewer URLs (budget=0, lod=0, groundClamp=0):' -ForegroundColor Green
foreach ($name in $requested) {
    $status = Get-VariantStatus $name
    if ($status.Ready) {
        Write-Host ""
        Write-Host $status.Note -ForegroundColor DarkGray
        Write-Host (Get-ViewerUrl $name $status.Artifact)
    }
}

if ($results.Count -gt 0) {
    Write-Host ""
    Write-Host "Build summary:" -ForegroundColor Cyan
    $results | Format-Table Variant, GaussiansM, MaxAbsCoordM, Output -AutoSize
}

Write-Host ""
Write-Host 'Legacy reference: http://localhost:5173/viewer/?m=UM_05&renderer=legacy' -ForegroundColor DarkGray
Write-Host "Log: $LogPath" -ForegroundColor DarkGray
