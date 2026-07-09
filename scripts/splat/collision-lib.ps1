# Shared splat-transform helpers for collision batch steps.
# Dot-sourced by batch-lod-from-temp.ps1 and generate-collision-glbs.ps1.

function Initialize-CollisionLibConfig {
    $script:CollisionSeedPos = if ($env:SPLAT_COLLISION_SEED_POS) { $env:SPLAT_COLLISION_SEED_POS } else { "0,0,0" }
    $script:VoxelParams = if ($env:SPLAT_VOXEL_PARAMS) { $env:SPLAT_VOXEL_PARAMS } else { "0.1,0.12" }
    $script:VoxelFloorFill = if ($env:SPLAT_VOXEL_FLOOR_FILL) { $env:SPLAT_VOXEL_FLOOR_FILL } else { "1.6" }
    $script:CollisionTimeoutMin = if ($env:SPLAT_COLLISION_TIMEOUT_MIN) {
        [int]$env:SPLAT_COLLISION_TIMEOUT_MIN
    } else { 90 }
    $script:CollisionFilterCluster = -not (
        $env:SPLAT_COLLISION_FILTER_CLUSTER -eq "0" -or
        $env:SPLAT_COLLISION_FILTER_CLUSTER -eq "skip" -or
        $env:SPLAT_COLLISION_FILTER_CLUSTER -eq "false" -or
        $env:SPLAT_COLLISION_FILTER_CLUSTER -eq "none"
    )
    $script:CollisionFilterFloaters = $env:SPLAT_COLLISION_FILTER_FLOATERS -eq "1"
    $script:CollisionSphereM = if ($env:SPLAT_COLLISION_SPHERE_M) {
        Get-OptionalPositiveDouble $env:SPLAT_COLLISION_SPHERE_M
    } else { 60.0 }
    $script:CollisionBoxHalfM = Get-OptionalPositiveDouble $env:SPLAT_COLLISION_BOX_HALF_M
    $script:CollisionBoxYMin = if ($env:SPLAT_COLLISION_BOX_Y_MIN) { [double]$env:SPLAT_COLLISION_BOX_Y_MIN } else { $null }
    $script:CollisionBoxYMax = if ($env:SPLAT_COLLISION_BOX_Y_MAX) { [double]$env:SPLAT_COLLISION_BOX_Y_MAX } else { $null }
}

function Get-OptionalPositiveDouble {
    param(
        [string]$Value,
        [double]$Default = 0
    )
    if (-not $Value -or $Value -eq "none" -or $Value -eq "0") { return 0.0 }
    if ($Value -eq "default") { return $Default }
    return [double]$Value
}

function Invoke-SplatTransform {
    param(
        [string[]]$SplatCliArgs,
        [switch]$StreamProgress
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    if ($StreamProgress) {
        & splat-transform @SplatCliArgs 2>&1 | ForEach-Object {
            $line = $_.ToString()
            if ($line.Trim()) {
                Write-Host "      $line"
            }
        }
    } else {
        $null = & splat-transform @SplatCliArgs 2>&1 | Out-String
    }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) {
        $cmd = "splat-transform $($SplatCliArgs -join ' ')"
        throw "splat-transform failed (exit $code): $cmd"
    }
}

function Get-SplatTransformExecutable {
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

    return $summary
}

function Get-GaussianCountM {
    param([string]$Path)
    return (Get-SplatSummary $Path).CountM
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

function Get-VoxelParamsForBundle {
    param(
        [string]$CollisionJsonPath,
        [string]$DefaultParams
    )
    if (-not (Test-Path -LiteralPath $CollisionJsonPath)) {
        return $DefaultParams
    }

    try {
        $header = Get-Content -LiteralPath $CollisionJsonPath -Raw | ConvertFrom-Json
        if ($null -eq $header.voxelResolution) {
            return $DefaultParams
        }
        $parts = $DefaultParams -split ","
        $opacity = if ($parts.Count -gt 1) { $parts[1] } else { "0.12" }
        return ("{0},{1}" -f [double]$header.voxelResolution, $opacity)
    } catch {
        return $DefaultParams
    }
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

    Write-Host "      collision prep -> collision-src.ply"
    Write-Host ("      input={0} ({1}M gaussians); filters={2}; seed={3}" -f $InputLabel, $inputCountM, $prepLabel, $CollisionSeedPos)

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
    }

    if ($CollisionFilterFloaters) {
        $prepArgs += "-G"
    }

    $prepArgs += $OutputPath
    Invoke-SplatTransform -SplatCliArgs $prepArgs

    if (-not (Test-Path -LiteralPath $OutputPath)) {
        throw "collision prep missing output: $OutputPath"
    }

    $summary = Get-SplatSummary $OutputPath
    $extentM = Get-SceneExtentM $summary
    Write-Host ("      prep result: {0}M gaussians, extent={1:N1}m" -f $summary.CountM, $extentM)
    return $summary
}

function Build-CollisionVoxelWithMesh {
    param(
        [string]$SourcePath,
        [string]$CollisionJsonPath,
        [string]$CollisionMeshMode,
        [string]$VoxelParamsForScene
    )

    $sourceCountM = Get-GaussianCountM $SourcePath
    Write-Host "      voxel + mesh (-K $CollisionMeshMode) -> $CollisionJsonPath"
    Write-Host ("      source=collision-src.ply ({0}M gaussians); params={1}" -f $sourceCountM, $VoxelParamsForScene)

    $voxelArgs = @(
        "-w", $SourcePath,
        "--voxel-params", $VoxelParamsForScene,
        "--seed-pos", $CollisionSeedPos,
        "-K", $CollisionMeshMode
    )

    if ($VoxelFloorFill -and $VoxelFloorFill -ne "none" -and $VoxelFloorFill -ne "0") {
        $voxelArgs += @("--voxel-floor-fill", $VoxelFloorFill)
    }

    $voxelArgs += $CollisionJsonPath
    Invoke-SplatTransformTimed -SplatCliArgs $voxelArgs -TimeoutMinutes $CollisionTimeoutMin -StreamProgress

    $binPath = $CollisionJsonPath -replace '\.voxel\.json$', '.voxel.bin'
    $glbPath = $CollisionJsonPath -replace '\.voxel\.json$', '.collision.glb'

    if (-not (Test-Path -LiteralPath $CollisionJsonPath)) {
        throw "missing $CollisionJsonPath after voxel step"
    }
    if (-not (Test-Path -LiteralPath $binPath)) {
        throw "missing $binPath after voxel step"
    }
    if (-not (Test-Path -LiteralPath $glbPath)) {
        throw "missing $glbPath after voxel step (expected beside collision.voxel.json)"
    }

    return @{
        Json = $CollisionJsonPath
        Bin = $binPath
        Glb = $glbPath
    }
}
