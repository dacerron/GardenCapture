# Build streamed LOD bundles for every splat in repo temp/
# Usage & prerequisites: batch-lod-from-temp.md (same folder)
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/splat/batch-lod-from-temp.ps1
#
# Optional env overrides (meters):
#   SPLAT_POSITION_OUTLIER_M=200   trigger position crop when |coord| exceeds this
#   SPLAT_POSITION_BOX_HALF_M=150  half-extent of symmetric crop box (-N..N per axis)
#   SPLAT_ROTATION=180,0,0         optional Euler degrees for -r (not applied by default)
#   SPLAT_DECIMATE_DEVICE=cpu      decimate device: auto (GPU+CPU fallback, default)|cpu|<gpu idx>
#   SPLAT_COLLISION=skip           skip collision.voxel.json generation (default: on)
#   SPLAT_VOXEL_PARAMS=0.1,0.12    voxel size + opacity threshold (coarser = faster)
#   SPLAT_VOXEL_FLOOR_FILL=1.6     floor-fill patch size (m); use "none" to skip
#   SPLAT_COLLISION_SEED_POS=0,0,0 seed for voxel floor-fill
#   SPLAT_COLLISION_SOURCE=coarse  voxelize coarsest lod PLY (default); use lod0 for max detail
#   SPLAT_COLLISION_MESH=faces     also emit collision.collision.glb (optional debug mesh)
#   SPLAT_COLLISION_STRICT=1       stop batch on collision failure (default: warn and continue)
#   SPLAT_COLLISION_MAX_EXTENT_M=120  skip voxel when post-prep scene span exceeds this (meters)
#   SPLAT_COLLISION_TIMEOUT_MIN=90    per-scene collision time limit (0 = no limit)
#   SPLAT_COLLISION_FILTER_CLUSTER=1  keep connected cluster at seed before voxel (GPU; default on)
#   SPLAT_COLLISION_SPHERE_M=60       radial cull at seed (0/none = skip sphere filter)
#   SPLAT_COLLISION_BOX_HALF_M=0      optional box half-size centered on seed (0/none = skip)
#   SPLAT_COLLISION_BOX_Y_MIN=        optional box min Y (absolute); default seedY - box half
#   SPLAT_COLLISION_BOX_Y_MAX=        optional box max Y (absolute); default seedY + box half
#   SPLAT_COLLISION_FILTER_FLOATERS=1 optional GPU floater cull before voxel (default off)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$TempDir = Join-Path $RepoRoot "temp"
$WorkLod = Join-Path $RepoRoot "work/lod"
$WorkOut = Join-Path $RepoRoot "work/out"
$BatchLog = Join-Path $RepoRoot "work/batch-lod.log"

$TargetCoarseM = 1.05
$MaxDecimateSteps = 3

# PlayCanvas-safe cleanup thresholds (override via env vars above).
$PositionOutlierThresholdM = if ($env:SPLAT_POSITION_OUTLIER_M) {
    [double]$env:SPLAT_POSITION_OUTLIER_M
} else { 200.0 }
$PositionBoxHalfExtentM = if ($env:SPLAT_POSITION_BOX_HALF_M) {
    [double]$env:SPLAT_POSITION_BOX_HALF_M
} else { 150.0 }

# Rotation is applied at viewer load (e.g. /viewer ?orientation=), not baked into LOD by default.
$SplatRotation = if ($env:SPLAT_ROTATION -and $env:SPLAT_ROTATION -ne "none" -and $env:SPLAT_ROTATION -ne "0") {
    $env:SPLAT_ROTATION
} else {
    $null
}

# Device for the --decimate KNN pass. The GPU path (WebGPU/D3D12) can hang the driver on
# large inputs (DXGI_ERROR_DEVICE_HUNG / "WebGPU device lost"). "auto" (default) tries the
# GPU and falls back to CPU on such failures; "cpu" forces the CPU KD-tree path from the
# start (slower but avoids the GPU hang entirely); a GPU index (e.g. "0") pins an adapter.
$DecimateDevice = if ($env:SPLAT_DECIMATE_DEVICE) {
    $env:SPLAT_DECIMATE_DEVICE.ToLowerInvariant()
} else {
    "auto"
}

# Remove Gaussians with -Infinity log-scale (PlayCanvas renders these as screen-filling blobs).
# --filter-nan intentionally keeps -Inf in scale_*; use raw scale filters instead.
$ScaleInfFilters = @(
    "-V", "scale_0_raw,gt,-100",
    "-V", "scale_1_raw,gt,-100",
    "-V", "scale_2_raw,gt,-100"
)

# Ground collision for PlayCanvas viewer camera clamp (collision.voxel.json + .voxel.bin).
$CollisionEnabled = -not (
    $env:SPLAT_COLLISION -eq "skip" -or
    $env:SPLAT_COLLISION -eq "none" -or
    $env:SPLAT_COLLISION -eq "0" -or
    $env:SPLAT_COLLISION -eq "false"
)
$VoxelParams = if ($env:SPLAT_VOXEL_PARAMS) { $env:SPLAT_VOXEL_PARAMS } else { "0.1,0.12" }
$VoxelFloorFill = if ($env:SPLAT_VOXEL_FLOOR_FILL) { $env:SPLAT_VOXEL_FLOOR_FILL } else { "1.6" }
$CollisionSeedPos = if ($env:SPLAT_COLLISION_SEED_POS) { $env:SPLAT_COLLISION_SEED_POS } else { "0,0,0" }
$CollisionSourceMode = if ($env:SPLAT_COLLISION_SOURCE) { $env:SPLAT_COLLISION_SOURCE.ToLowerInvariant() } else { "coarse" }
$CollisionMesh = if ($env:SPLAT_COLLISION_MESH -and $env:SPLAT_COLLISION_MESH -ne "none") {
    $env:SPLAT_COLLISION_MESH
} else {
    $null
}
$CollisionStrict = $env:SPLAT_COLLISION_STRICT -eq "1"
$HeightmapEnabled = -not (
    $env:SPLAT_HEIGHTMAP -eq "skip" -or
    $env:SPLAT_HEIGHTMAP -eq "none" -or
    $env:SPLAT_HEIGHTMAP -eq "0" -or
    $env:SPLAT_HEIGHTMAP -eq "false"
)
$CollisionMaxExtentM = if ($env:SPLAT_COLLISION_MAX_EXTENT_M) {
    [double]$env:SPLAT_COLLISION_MAX_EXTENT_M
} else { 120.0 }
$CollisionTimeoutMin = if ($env:SPLAT_COLLISION_TIMEOUT_MIN) {
    [int]$env:SPLAT_COLLISION_TIMEOUT_MIN
} else { 90 }
$VoxelParamsUserSet = [bool]$env:SPLAT_VOXEL_PARAMS

function Get-OptionalPositiveDouble {
    param(
        [string]$Value,
        [double]$Default = 0
    )
    if (-not $Value -or $Value -eq "none" -or $Value -eq "0") { return 0.0 }
    if ($Value -eq "default") { return $Default }
    return [double]$Value
}

$CollisionFilterCluster = -not (
    $env:SPLAT_COLLISION_FILTER_CLUSTER -eq "0" -or
    $env:SPLAT_COLLISION_FILTER_CLUSTER -eq "skip" -or
    $env:SPLAT_COLLISION_FILTER_CLUSTER -eq "false" -or
    $env:SPLAT_COLLISION_FILTER_CLUSTER -eq "none"
)
$CollisionFilterFloaters = $env:SPLAT_COLLISION_FILTER_FLOATERS -eq "1"
$CollisionSphereM = if ($env:SPLAT_COLLISION_SPHERE_M) {
    Get-OptionalPositiveDouble $env:SPLAT_COLLISION_SPHERE_M
} else { 60.0 }
$CollisionBoxHalfM = Get-OptionalPositiveDouble $env:SPLAT_COLLISION_BOX_HALF_M
$CollisionBoxYMin = if ($env:SPLAT_COLLISION_BOX_Y_MIN) { [double]$env:SPLAT_COLLISION_BOX_Y_MIN } else { $null }
$CollisionBoxYMax = if ($env:SPLAT_COLLISION_BOX_Y_MAX) { [double]$env:SPLAT_COLLISION_BOX_Y_MAX } else { $null }

function Write-BatchLog {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Add-Content -Path $BatchLog -Value $line -Encoding utf8
    Write-Host $Message
}

# splat-transform logs progress to stderr; avoid PowerShell treating that as a terminating error.
function Invoke-SplatTransform {
    param(
        [string[]]$SplatCliArgs,
        [switch]$StreamProgress
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = ""
    if ($StreamProgress) {
        & splat-transform @SplatCliArgs 2>&1 | ForEach-Object {
            $line = $_.ToString()
            if ($line.Trim()) {
                Write-Host "      $line"
            }
        }
    } else {
        $output = & splat-transform @SplatCliArgs 2>&1 | Out-String
    }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) {
        $cmd = "splat-transform $($SplatCliArgs -join ' ')"
        $detail = $output.Trim()
        if ($detail) {
            throw "splat-transform failed (exit $code): $cmd`n$detail"
        }
        throw "splat-transform failed (exit $code): $cmd"
    }
}

function Invoke-Decimate {
    param(
        [string]$InputPath,
        [string]$OutputPath
    )
    $baseArgs = @("-w", $InputPath, "--decimate", "50%", $OutputPath)

    # Explicit override (cpu / GPU index): run once, honour the user's choice, no fallback.
    if ($DecimateDevice -ne "auto") {
        Write-Host "      device=$DecimateDevice (SPLAT_DECIMATE_DEVICE)"
        Invoke-SplatTransform -SplatCliArgs (@("-g", $DecimateDevice) + $baseArgs) -StreamProgress
        return
    }

    # Default: try GPU, then fall back to the CPU KD-tree path if the GPU KNN hangs the
    # driver. Capture output (no -StreamProgress) so we can inspect the failure message.
    try {
        Invoke-SplatTransform -SplatCliArgs $baseArgs
    } catch {
        $msg = $_.Exception.Message
        if ($msg -match "device lost|DEVICE_HUNG|DEVICE_REMOVED|copyBufferToBuffer|WebGPU|GetDeviceRemovedReason") {
            $firstLine = ($msg -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 1)
            Write-BatchLog "  decimate GPU pass failed ($firstLine); retrying on CPU (-g cpu)"
            Write-Host "      GPU decimate failed (device hang) - retrying on CPU (-g cpu, slower)"
            Remove-Item $OutputPath -Force -ErrorAction SilentlyContinue
            Invoke-SplatTransform -SplatCliArgs (@("-g", "cpu") + $baseArgs) -StreamProgress
        } else {
            throw
        }
    }
}

function Get-CollisionSeedCoords {
    $parts = $CollisionSeedPos -split ","
    if ($parts.Count -lt 3) { return @(0.0, 0.0, 0.0) }
    return @(
        [double]$parts[0].Trim(),
        [double]$parts[1].Trim(),
        [double]$parts[2].Trim()
    )
}

function Get-SceneExtentM {
    param($Summary)
    $extent = 0.0
    foreach ($axis in @("x", "y", "z")) {
        $row = $Summary.Axes[$axis]
        if (-not $row) { continue }
        $span = $row.Max - $row.Min
        if ($span -gt $extent) { $extent = $span }
    }
    return $extent
}

function Resolve-CollisionVoxelParams {
    param(
        [double]$ExtentM,
        [string]$BaseParams
    )
    if ($VoxelParamsUserSet) { return $BaseParams }

    $parts = $BaseParams -split ","
    $size = [double]$parts[0]
    $opacity = if ($parts.Count -gt 1) { $parts[1] } else { "0.12" }

    # Auto-coarsen on medium/large scenes when the user did not set SPLAT_VOXEL_PARAMS.
    if ($ExtentM -gt 50) {
        $minSize = [math]::Ceiling(($ExtentM / 100) * 20) / 20
        if ($minSize -gt $size) { $size = $minSize }
    }

    return ("{0},{1}" -f $size, $opacity)
}

function Stop-SplatTransformForOutput {
    param([string]$OutputPath)
    $leaf = Split-Path $OutputPath -Leaf
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -and
        $_.CommandLine -like "*splat-transform*" -and
        $_.CommandLine -like "*$leaf*"
    } | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Get-SplatTransformExecutable {
    # Start-Process requires a real Win32 executable. npm's bare "splat-transform" name
    # resolves to a .ps1 shim that works with & splat-transform but not Start-Process.
    $cmdShim = Get-Command splat-transform.cmd -ErrorAction SilentlyContinue
    if ($cmdShim) { return $cmdShim.Source }

    $cmd = Get-Command splat-transform -ErrorAction Stop
    if ($cmd.CommandType -eq 'Application') { return $cmd.Source }

    if ($cmd.CommandType -eq 'ExternalScript') {
        $cmdPath = [System.IO.Path]::ChangeExtension($cmd.Source, '.cmd')
        if (Test-Path -LiteralPath $cmdPath) { return $cmdPath }
        throw "Cannot resolve splat-transform for Start-Process (install @playcanvas/splat-transform globally)"
    }

    return $cmd.Source
}

function Invoke-SplatTransformTimed {
    param(
        [string[]]$SplatCliArgs,
        [int]$TimeoutMinutes = 0,
        [switch]$StreamProgress
    )

    if ($TimeoutMinutes -le 0) {
        Invoke-SplatTransform -SplatCliArgs $SplatCliArgs -StreamProgress:$StreamProgress
        return
    }

    $stderrFile = Join-Path $env:TEMP ("splat-transform-{0}.err.log" -f [guid]::NewGuid().ToString("n"))
    $stdoutFile = Join-Path $env:TEMP ("splat-transform-{0}.out.log" -f [guid]::NewGuid().ToString("n"))
    $outputPath = $SplatCliArgs[-1]

    try {
        $splatExe = Get-SplatTransformExecutable
        $proc = Start-Process -FilePath $splatExe `
            -ArgumentList $SplatCliArgs `
            -NoNewWindow -PassThru `
            -RedirectStandardError $stderrFile `
            -RedirectStandardOutput $stdoutFile

        $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
        $lastLen = 0L

        while (-not $proc.HasExited) {
            if ((Get-Date) -gt $deadline) {
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                if ($outputPath -like "*.voxel.json") {
                    Stop-SplatTransformForOutput -OutputPath $outputPath
                }
                throw "splat-transform timed out after $TimeoutMinutes minutes"
            }

            if ($StreamProgress -and (Test-Path -LiteralPath $stderrFile)) {
                try {
                    $stream = [System.IO.File]::Open(
                        $stderrFile,
                        [System.IO.FileMode]::Open,
                        [System.IO.FileAccess]::Read,
                        [System.IO.FileShare]::ReadWrite
                    )
                    $reader = New-Object System.IO.StreamReader($stream)
                    $null = $stream.Seek($lastLen, [System.IO.SeekOrigin]::Begin)
                    while (-not $reader.EndOfStream) {
                        $line = $reader.ReadLine()
                        if ($line -and $line.Trim()) {
                            Write-Host "      $line"
                        }
                    }
                    $lastLen = $stream.Position
                    $reader.Close()
                    $stream.Close()
                } catch {
                    # File may be locked briefly while splat-transform writes.
                }
            }

            Start-Sleep -Seconds 2
        }

        # npm .cmd wrappers often leave ExitCode unset ($null); treat that as success.
        $exitCode = $proc.ExitCode
        if ($null -ne $exitCode -and $exitCode -ne 0) {
            $detail = ""
            if (Test-Path $stderrFile) {
                $detail = (Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue)
            }
            throw "splat-transform failed (exit $exitCode)`n$detail"
        }
    } finally {
        Remove-Item $stderrFile, $stdoutFile -Force -ErrorAction SilentlyContinue
    }
}

function Get-SplatTransformSummaryText {
    param([string]$Path)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $out = (splat-transform $Path -m null 2>&1) | Out-String
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "splat-transform summary failed for $Path" }
    return $out
}

function Parse-SummaryTableRow {
    param([string]$Line)
    $parts = ($Line -split '\|').ForEach({ $_.Trim() }) | Where-Object { $_ -ne '' }
    if ($parts.Count -lt 8) { return $null }
    return @{
        Column = $parts[0]
        Min    = [double]$parts[1]
        Max    = [double]$parts[2]
        Infs   = [int]$parts[7]
    }
}

function Get-SplatSummary {
    param([string]$Path)
    $out = Get-SplatTransformSummaryText $Path
    $summary = @{
        Path          = $Path
        CountM        = $null
        MaxAbsCoord   = 0.0
        ScaleInfTotal = 0
        Axes          = @{}
        SkyHint       = $false
    }

    if ($out -match "([\d.]+)M gaussians") {
        $summary.CountM = [double]$Matches[1]
    } elseif ($out -match "([\d.]+)K gaussians") {
        $summary.CountM = [double]$Matches[1] / 1000
    }

    foreach ($line in ($out -split "`n")) {
        if ($line -notmatch '^\| (x|y|z|scale_0|scale_1|scale_2)\s+\|') { continue }
        $row = Parse-SummaryTableRow $line
        if (-not $row) { continue }
        $summary.Axes[$row.Column] = $row
        if ($row.Column -match '^scale_') {
            $summary.ScaleInfTotal += $row.Infs
        } else {
            $axisMax = [math]::Max([math]::Abs($row.Min), [math]::Abs($row.Max))
            if ($axisMax -gt $summary.MaxAbsCoord) {
                $summary.MaxAbsCoord = $axisMax
            }
        }
    }

    $y = $summary.Axes['y']
    if ($y -and $y.Max -gt 15 -and $summary.MaxAbsCoord -gt $PositionOutlierThresholdM) {
        $summary.SkyHint = $true
    }

    return $summary
}

function Get-GaussianCountM {
    param([string]$Path)
    return (Get-SplatSummary $Path).CountM
}

function Repair-PlayCanvasSplatData {
    param(
        [string]$InputPath,
        [string]$Lod0Path,
        [string]$BaseName
    )

    Write-Host "[1/4] ksplat/splat -> lod0.ply (PlayCanvas cleanup)"
    $importArgs = @("-w", $InputPath)
    if ($SplatRotation) {
        Write-Host "      rotation -r $SplatRotation (SPLAT_ROTATION)"
        $importArgs += @("-r", $SplatRotation)
    }
    # Parentheses required — without them PowerShell only passes the first @(...) array.
    Invoke-SplatTransform -SplatCliArgs ($importArgs + $ScaleInfFilters + @($Lod0Path))

    $summary = Get-SplatSummary $Lod0Path
    Write-BatchLog "  $BaseName after scale-inf filter: $($summary.CountM)M gaussians, max |coord|=$($summary.MaxAbsCoord)m, scale infs=$($summary.ScaleInfTotal)"

    if ($summary.ScaleInfTotal -gt 0) {
        Write-BatchLog "  WARNING $BaseName : scale_* still has $($summary.ScaleInfTotal) Inf values after filter"
    }

    if ($summary.MaxAbsCoord -gt $PositionOutlierThresholdM) {
        $half = $PositionBoxHalfExtentM
        $box = "-$half,-$half,-$half,$half,$half,$half"
        $lod0Cropped = "$Lod0Path.tmp.ply"

        Write-Host "      position outliers detected (max |coord|=$([math]::Round($summary.MaxAbsCoord,1))m > ${PositionOutlierThresholdM}m)"
        Write-Host "      cropping to box [$box] (distant sky/outlier shell)"
        if ($summary.SkyHint) {
            Write-BatchLog "  NOTE $BaseName : large extent + upper y - likely cloudy-sky / distant shell gaussians"
        }

        Invoke-SplatTransform -SplatCliArgs @("-w", $Lod0Path, "-B", $box, $lod0Cropped)
        Move-Item -Force $lod0Cropped $Lod0Path

        $summary = Get-SplatSummary $Lod0Path
        Write-BatchLog "  $BaseName after position crop: $($summary.CountM)M gaussians, max |coord|=$($summary.MaxAbsCoord)m"
        Write-Host "      after crop: $($summary.CountM)M gaussians, max |coord|=$([math]::Round($summary.MaxAbsCoord,1))m"
    }

    if ($summary.MaxAbsCoord -gt $PositionOutlierThresholdM) {
        Write-BatchLog "  WARNING $BaseName : still exceeds position threshold after crop - inspect manually"
    }

    return $summary
}

function Ensure-Dir {
    param([string]$Path)
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Prepare-CollisionSourcePly {
    param(
        [string]$InputPath,
        [string]$OutputPath,
        [string]$BaseName,
        [string]$InputLabel
    )

    $inputCountM = Get-GaussianCountM $InputPath
    $seedX, $seedY, $seedZ = Get-CollisionSeedCoords

    $prepParts = @()
    if ($CollisionFilterCluster) { $prepParts += "cluster" }
    if ($CollisionSphereM -gt 0) { $prepParts += ("sphere={0}m" -f $CollisionSphereM) }
    if ($CollisionBoxHalfM -gt 0) { $prepParts += ("boxHalf={0}m" -f $CollisionBoxHalfM) }
    if ($CollisionFilterFloaters) { $prepParts += "floaters" }
    $prepLabel = if ($prepParts.Count -gt 0) { $prepParts -join ", " } else { "none" }

    Write-Host "[4a/4] collision prep -> collision-src.ply"
    Write-Host ("      input={0} ({1}M gaussians)" -f $InputLabel, $inputCountM)
    Write-Host ("      filters: {0}; seed={1}" -f $prepLabel, $CollisionSeedPos)

    $prepArgs = @("-w", $InputPath)

    if ($CollisionFilterCluster) {
        $prepArgs += @("--filter-cluster", "--seed-pos", $CollisionSeedPos)
    }

    if ($CollisionSphereM -gt 0) {
        $prepArgs += @(
            "-S",
            ("{0},{1},{2},{3}" -f $seedX, $seedY, $seedZ, $CollisionSphereM)
        )
    }

    if ($CollisionBoxHalfM -gt 0) {
        $yMin = if ($null -ne $CollisionBoxYMin) { $CollisionBoxYMin } else { $seedY - $CollisionBoxHalfM }
        $yMax = if ($null -ne $CollisionBoxYMax) { $CollisionBoxYMax } else { $seedY + $CollisionBoxHalfM }
        $box = ("{0},{1},{2},{3},{4},{5}" -f `
            ($seedX - $CollisionBoxHalfM), $yMin, ($seedZ - $CollisionBoxHalfM), `
            ($seedX + $CollisionBoxHalfM), $yMax, ($seedZ + $CollisionBoxHalfM))
        $prepArgs += @("-B", $box)
        Write-Host ("      box=[{0}]" -f $box)
    }

    if ($CollisionFilterFloaters) {
        $prepArgs += "-G"
    }

    $prepArgs += $OutputPath

    try {
        Invoke-SplatTransform -SplatCliArgs $prepArgs
    } catch {
        $msg = $_.Exception.Message
        Write-BatchLog "  WARNING $BaseName : collision prep failed - $msg"
        Write-Host "      WARNING: collision prep failed (LOD bundle is still valid)"
        if ($CollisionStrict) { throw }
        return $null
    }

    if (-not (Test-Path $OutputPath)) {
        Write-BatchLog "  WARNING $BaseName : collision prep produced no output file"
        if ($CollisionStrict) { throw "collision prep missing output: $OutputPath" }
        return $null
    }

    $summary = Get-SplatSummary $OutputPath
    $extentM = Get-SceneExtentM $summary
    Write-Host ("      prep result: {0}M gaussians, extent={1:N1}m" -f $summary.CountM, $extentM)
    Write-BatchLog ("  {0} collision prep: {1} -> collision-src.ply ({2}M, extent={3:N1}m, filters={4})" -f `
        $BaseName, $InputLabel, $summary.CountM, $extentM, $prepLabel)
    return $summary
}

function Build-CollisionVoxel {
    param(
        [string]$SourcePath,
        [string]$CollisionJsonPath,
        [string]$BaseName,
        [string]$SourceLabel,
        [double]$SceneExtentM,
        [string]$VoxelParamsForScene = $VoxelParams
    )

    $sourceCountM = Get-GaussianCountM $SourcePath
    Write-Host "[4b/4] voxel collision -> $CollisionJsonPath"
    Write-Host ("      source={0} ({1}M gaussians)" -f $SourceLabel, $sourceCountM)
    Write-Host ("      extent={0:N1}m params={1} seed={2} floor-fill={3}" -f $SceneExtentM, $VoxelParamsForScene, $CollisionSeedPos, $VoxelFloorFill)
    if ($CollisionTimeoutMin -gt 0) {
        Write-Host "      timeout=${CollisionTimeoutMin}m"
    }
    Write-Host '      (slow step - splat-transform progress streams below)'
    Write-BatchLog ("  {0} collision start: source={1} ({2}M), extent={3:N1}m, voxel={4}, timeout={5}m" -f `
        $BaseName, $SourceLabel, $sourceCountM, $SceneExtentM, $VoxelParamsForScene, $CollisionTimeoutMin)

    $voxelArgs = @(
        "-w", $SourcePath,
        "--voxel-params", $VoxelParamsForScene,
        "--seed-pos", $CollisionSeedPos
    )

    if ($VoxelFloorFill -and $VoxelFloorFill -ne "none" -and $VoxelFloorFill -ne "0") {
        $voxelArgs += @("--voxel-floor-fill", $VoxelFloorFill)
    }

    if ($CollisionMesh) {
        $voxelArgs += @("-K", $CollisionMesh)
    }

    $voxelArgs += $CollisionJsonPath

    try {
        Invoke-SplatTransformTimed -SplatCliArgs $voxelArgs -TimeoutMinutes $CollisionTimeoutMin -StreamProgress
    } catch {
        $msg = $_.Exception.Message
        Write-BatchLog "  WARNING $BaseName : collision voxel failed - $msg"
        Write-Host "      WARNING: collision voxel failed (LOD bundle is still valid)"
        if ($CollisionStrict) { throw }
        return $false
    }

    $binPath = $CollisionJsonPath -replace '\.voxel\.json$', '.voxel.bin'
    if (-not (Test-Path $CollisionJsonPath)) {
        Write-BatchLog "  WARNING $BaseName : missing $CollisionJsonPath after voxel step"
        if ($CollisionStrict) { throw "collision output missing: $CollisionJsonPath" }
        return $false
    }
    if (-not (Test-Path $binPath)) {
        Write-BatchLog "  WARNING $BaseName : missing $binPath after voxel step"
        if ($CollisionStrict) { throw "collision output missing: $binPath" }
        return $false
    }

    Write-BatchLog "  $BaseName collision voxel -> $CollisionJsonPath"
    return $true
}

function Build-HeightmapFromVoxel {
    param(
        [string]$CollisionJsonPath,
        [string]$BaseName
    )

    if (-not $HeightmapEnabled) {
        Write-Host "[4c/4] heightmap skipped (SPLAT_HEIGHTMAP=skip)"
        Write-BatchLog "  $BaseName heightmap skipped (SPLAT_HEIGHTMAP)"
        return $false
    }

    $heightmapJson = Join-Path (Split-Path $CollisionJsonPath) "heightmap.json"
    $extractScript = Join-Path $RepoRoot "scripts/splat/extract-heightmap.mjs"
    $cellArgs = @()
    if ($env:SPLAT_HEIGHTMAP_CELL) {
        $cellArgs = @("--cell", $env:SPLAT_HEIGHTMAP_CELL)
    }

    Write-Host "[4c/4] heightmap -> $heightmapJson"
    Write-BatchLog "  $BaseName heightmap start -> $heightmapJson"

    try {
        & node $extractScript --voxel $CollisionJsonPath --out $heightmapJson @cellArgs
        if ($LASTEXITCODE -ne 0) {
            throw "extract-heightmap exited with code $LASTEXITCODE"
        }
    } catch {
        $msg = $_.Exception.Message
        Write-BatchLog "  WARNING $BaseName : heightmap failed - $msg"
        Write-Host "      WARNING: heightmap extraction failed"
        if ($env:SPLAT_HEIGHTMAP_STRICT -eq "1") { throw }
        return $false
    }

    Write-BatchLog "  $BaseName heightmap -> $heightmapJson"
    return $true
}

Ensure-Dir (Join-Path $RepoRoot "work")
$rotationLog = if ($SplatRotation) { $SplatRotation } else { "none" }
$collisionLog = if ($CollisionEnabled) {
    $prep = @()
    if ($CollisionFilterCluster) { $prep += "cluster" }
    if ($CollisionSphereM -gt 0) { $prep += "sphere${CollisionSphereM}m" }
    if ($CollisionBoxHalfM -gt 0) { $prep += "box${CollisionBoxHalfM}m" }
    if ($CollisionFilterFloaters) { $prep += "floaters" }
    $prepText = if ($prep.Count -gt 0) { $prep -join "+" } else { "none" }
    "on (source=$CollisionSourceMode, prep=$prepText, voxel=$VoxelParams, floor=$VoxelFloorFill, maxExtent=${CollisionMaxExtentM}m post-prep, timeout=${CollisionTimeoutMin}m)"
} else {
    "skip"
}
Write-BatchLog "=== batch-lod-from-temp start (outlier>${PositionOutlierThresholdM}m -> box +/-${PositionBoxHalfExtentM}m, rotation=$rotationLog, collision=$collisionLog) ==="

$inputs = Get-ChildItem -Path $TempDir -File |
    Where-Object { $_.Extension -match '^\.(ksplat|splat|ply|sog)$' } |
    Sort-Object Name

if ($inputs.Count -eq 0) {
    Write-Error "No .ksplat/.splat/.ply/.sog files in $TempDir"
}

Write-Host "Processing $($inputs.Count) splat(s) from $TempDir"
Write-Host ""

foreach ($input in $inputs) {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($input.Name)
    $lodDir = Join-Path $WorkLod $base
    $outDir = Join-Path $WorkOut $base
    Ensure-Dir $lodDir
    Ensure-Dir $outDir

    Write-Host "========================================"
    Write-Host " $base ($($input.Name))"
    Write-Host "========================================"
    Write-BatchLog "Processing $base ($($input.Name))"

    $lod0 = Join-Path $lodDir "lod0.ply"
    $lod0Summary = Repair-PlayCanvasSplatData -InputPath $input.FullName -Lod0Path $lod0 -BaseName $base

    $lodFiles = @($lod0)
    $countM = Get-GaussianCountM $lod0
    Write-Host "      lod0: ${countM}M gaussians"

    $step = 0
    while ($countM -gt $TargetCoarseM -and $step -lt $MaxDecimateSteps) {
        $step++
        $prev = $lodFiles[-1]
        $next = Join-Path $lodDir "lod$step.ply"
        Write-Host "[2/4] decimate -> lod$step.ply"
        Invoke-Decimate -InputPath $prev -OutputPath $next
        $lodFiles += $next
        $countM = Get-GaussianCountM $next
        Write-Host "      lod$step : ${countM}M gaussians"
    }

    $manifest = Join-Path $outDir "lod-meta.json"
    $transformArgs = @("-w")
    for ($i = 0; $i -lt $lodFiles.Count; $i++) {
        $transformArgs += $lodFiles[$i]
        $transformArgs += "--lod"
        $transformArgs += "$i"
    }
    $transformArgs += $manifest

    Write-Host "[3/4] bundle streamed LOD -> $manifest"
    Write-Host "      levels: $($lodFiles.Count) (lod0..lod$($lodFiles.Count - 1))"
    Invoke-SplatTransform -SplatCliArgs $transformArgs

    if ($CollisionEnabled) {
        $collisionJson = Join-Path $outDir "collision.voxel.json"
        $collisionInput = if ($CollisionSourceMode -eq "lod0" -or $CollisionSourceMode -eq "fine") {
            $lod0
        } else {
            $lodFiles[-1]
        }
        $collisionInputLabel = [System.IO.Path]::GetFileName($collisionInput)
        $collisionSrc = Join-Path $lodDir "collision-src.ply"

        $prepSummary = Prepare-CollisionSourcePly `
            -InputPath $collisionInput `
            -OutputPath $collisionSrc `
            -BaseName $base `
            -InputLabel $collisionInputLabel

        if ($prepSummary) {
            if (-not $prepSummary.CountM -or $prepSummary.CountM -le 0) {
                Write-Host "[4b/4] collision skipped (prep produced 0 gaussians)"
                Write-BatchLog "  $base collision skipped: prep produced 0 gaussians"
            } else {
                $prepExtentM = Get-SceneExtentM $prepSummary
                if ($prepExtentM -gt $CollisionMaxExtentM) {
                    Write-Host "[4b/4] collision skipped (prep extent $([math]::Round($prepExtentM,1))m > max ${CollisionMaxExtentM}m)"
                    Write-BatchLog ("  {0} collision skipped: prep extent {1:N1}m > SPLAT_COLLISION_MAX_EXTENT_M ({2}m)" -f `
                        $base, $prepExtentM, $CollisionMaxExtentM)
                } else {
                    $voxelParamsForScene = Resolve-CollisionVoxelParams -ExtentM $prepExtentM -BaseParams $VoxelParams
                    if ($voxelParamsForScene -ne $VoxelParams) {
                        Write-Host ("      auto voxel params -> {0} (prep extent {1:N1}m)" -f $voxelParamsForScene, $prepExtentM)
                    }
                    $voxelOk = Build-CollisionVoxel `
                        -SourcePath $collisionSrc `
                        -CollisionJsonPath $collisionJson `
                        -BaseName $base `
                        -SourceLabel "collision-src.ply" `
                        -SceneExtentM $prepExtentM `
                        -VoxelParamsForScene $voxelParamsForScene
                    if ($voxelOk) {
                        $null = Build-HeightmapFromVoxel `
                            -CollisionJsonPath $collisionJson `
                            -BaseName $base
                    }
                }
            }
        }
    } else {
        Write-Host "[4/4] collision voxel skipped (SPLAT_COLLISION=skip)"
        Write-BatchLog "  $base collision skipped (SPLAT_COLLISION)"
    }

    Write-BatchLog "Done $base -> $outDir"
    Write-Host "Done: $outDir"
    Write-Host ""
}

Write-BatchLog "=== batch-lod-from-temp complete ==="
Write-Host "All complete. Output under: $WorkOut"
Write-Host "Log: $BatchLog"
