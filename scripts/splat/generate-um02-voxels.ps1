# Generate ground collision voxels for UM02 (University Manitoba Embankment).
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-um02-voxels.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-um02-voxels.ps1 -CheckOnly
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-um02-voxels.ps1 -Force
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-um02-voxels.ps1 -WithMesh
#
# Prerequisites:
#   - @playcanvas/splat-transform on PATH (v2.4+)
#   - A prior LOD build for UM02:
#       work/out/UM02/lod-meta.json
#       work/lod/UM02/lod*.ply  (or collision-src.ply)
#     Run batch-lod-from-temp.ps1 with temp/UM02.{ksplat,splat,ply} if those are missing.
#
# Output:
#   work/out/UM02/collision.voxel.json
#   work/out/UM02/collision.voxel.bin
#   work/out/UM02/heightmap.json + heightmap.bin   (unless -SkipHeightmap)
#   work/out/UM02/collision.collision.glb          (only with -WithMesh)
#
# Optional env overrides (same names as batch-lod-from-temp.ps1):
#   SPLAT_VOXEL_PARAMS=0.1,0.12
#   SPLAT_VOXEL_FLOOR_FILL=1.6
#   SPLAT_COLLISION_SEED_POS=0,0,0
#   SPLAT_COLLISION_SPHERE_M=60
#   SPLAT_COLLISION_MAX_EXTENT_M=120
#   SPLAT_COLLISION_TIMEOUT_MIN=90
#   SPLAT_HEIGHTMAP_CELL=0.25

param(
    [switch]$CheckOnly,
    [switch]$Force,
    [switch]$WithMesh,
    [switch]$SkipHeightmap
)

$ErrorActionPreference = "Stop"

$Bundle = "UM02"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$WorkLod = Join-Path $RepoRoot "work/lod/$Bundle"
$WorkOut = Join-Path $RepoRoot "work/out/$Bundle"
$LogPath = Join-Path $RepoRoot "work/generate-um02-voxels.log"

# UM02 defaults (only when the caller did not set env vars).
$VoxelParamsUserSet = [bool]$env:SPLAT_VOXEL_PARAMS
if (-not $env:SPLAT_VOXEL_PARAMS) { $env:SPLAT_VOXEL_PARAMS = "0.1,0.12" }
if (-not $env:SPLAT_VOXEL_FLOOR_FILL) { $env:SPLAT_VOXEL_FLOOR_FILL = "1.6" }
if (-not $env:SPLAT_COLLISION_SEED_POS) { $env:SPLAT_COLLISION_SEED_POS = "0,0,0" }
if (-not $env:SPLAT_COLLISION_SPHERE_M) { $env:SPLAT_COLLISION_SPHERE_M = "60" }
if (-not $env:SPLAT_COLLISION_MAX_EXTENT_M) { $env:SPLAT_COLLISION_MAX_EXTENT_M = "120" }
if (-not $env:SPLAT_COLLISION_TIMEOUT_MIN) { $env:SPLAT_COLLISION_TIMEOUT_MIN = "90" }

. (Join-Path $PSScriptRoot "collision-lib.ps1")
Initialize-CollisionLibConfig
$CollisionMaxExtentM = [double]$env:SPLAT_COLLISION_MAX_EXTENT_M
$CollisionMeshMode = if ($env:SPLAT_COLLISION_MESH -and $env:SPLAT_COLLISION_MESH -ne "none") {
    $env:SPLAT_COLLISION_MESH
} else {
    "smooth"
}

function Write-Um02Log {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    New-Item -ItemType Directory -Force -Path (Split-Path $LogPath) | Out-Null
    Add-Content -Path $LogPath -Value $line -Encoding utf8
    Write-Host $Message
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

    if ($ExtentM -gt 50) {
        $minSize = [math]::Ceiling(($ExtentM / 100) * 20) / 20
        if ($minSize -gt $size) { $size = $minSize }
    }

    return ("{0},{1}" -f $size, $opacity)
}

function Get-Um02VoxelStatus {
    $lod = Join-Path $WorkOut "lod-meta.json"
    $json = Join-Path $WorkOut "collision.voxel.json"
    $bin = Join-Path $WorkOut "collision.voxel.bin"
    $heightmap = Join-Path $WorkOut "heightmap.json"
    $glb = Join-Path $WorkOut "collision.collision.glb"
    $collisionSrc = Join-Path $WorkLod "collision-src.ply"
    $lodPlyCount = if (Test-Path -LiteralPath $WorkLod) {
        (Get-ChildItem -LiteralPath $WorkLod -Filter "lod*.ply" -ErrorAction SilentlyContinue).Count
    } else { 0 }

    $hasLod = Test-Path -LiteralPath $lod
    $hasJson = Test-Path -LiteralPath $json
    $hasBin = Test-Path -LiteralPath $bin
    $hasHeightmap = Test-Path -LiteralPath $heightmap
    $hasGlb = Test-Path -LiteralPath $glb
    $hasCollisionSrc = Test-Path -LiteralPath $collisionSrc
    $hasSource = $hasCollisionSrc -or $lodPlyCount -gt 0

    $status = if (-not $hasLod) { "NO_BUNDLE" }
        elseif (-not $hasSource) { "NO_SOURCE" }
        elseif ($hasJson -and $hasBin) { "HAS_VOXEL" }
        else { "NEEDS_VOXEL" }

    [PSCustomObject]@{
        Bundle = $Bundle
        Status = $status
        LOD = $hasLod
        Source = $hasSource
        Voxel = ($hasJson -and $hasBin)
        Heightmap = $hasHeightmap
        GLB = $hasGlb
        JsonKB = if ($hasJson) { [math]::Round((Get-Item -LiteralPath $json).Length / 1KB, 1) } else { 0 }
        BinKB = if ($hasBin) { [math]::Round((Get-Item -LiteralPath $bin).Length / 1KB, 1) } else { 0 }
    }
}

function Resolve-CollisionSourcePath {
    $collisionSrc = Join-Path $WorkLod "collision-src.ply"
    if (Test-Path -LiteralPath $collisionSrc) {
        return @{
            Path = $collisionSrc
            Label = "collision-src.ply"
            Prepared = $true
        }
    }

    $lodFiles = Get-ChildItem -LiteralPath $WorkLod -Filter "lod*.ply" -ErrorAction SilentlyContinue |
        Sort-Object {
            if ($_.BaseName -match '^lod(\d+)$') { [int]$Matches[1] } else { 0 }
        } -Descending

    if ($lodFiles.Count -eq 0) {
        return $null
    }

    $coarse = $lodFiles[0]
    return @{
        Path = $coarse.FullName
        Label = $coarse.Name
        Prepared = $false
    }
}

function Ensure-CollisionSourcePly {
    $resolved = Resolve-CollisionSourcePath
    if (-not $resolved) {
        return $null
    }

    if ($resolved.Prepared) {
        $summary = Get-SplatSummary $resolved.Path
        return @{
            Path = $resolved.Path
            Summary = $summary
        }
    }

    $collisionSrc = Join-Path $WorkLod "collision-src.ply"
    $summary = Prepare-CollisionSourcePly `
        -InputPath $resolved.Path `
        -OutputPath $collisionSrc `
        -BaseName $Bundle `
        -InputLabel $resolved.Label

    return @{
        Path = $collisionSrc
        Summary = $summary
    }
}

function Build-CollisionVoxelOnly {
    param(
        [string]$SourcePath,
        [string]$CollisionJsonPath,
        [string]$VoxelParamsForScene,
        [double]$SceneExtentM
    )

    $sourceCountM = Get-GaussianCountM $SourcePath
    Write-Host "      voxel -> $CollisionJsonPath"
    Write-Host ("      source=collision-src.ply ({0}M gaussians); extent={1:N1}m; params={2}" -f `
        $sourceCountM, $SceneExtentM, $VoxelParamsForScene)

    $voxelArgs = @(
        "-w", $SourcePath,
        "--voxel-params", $VoxelParamsForScene,
        "--seed-pos", $CollisionSeedPos
    )

    if ($VoxelFloorFill -and $VoxelFloorFill -ne "none" -and $VoxelFloorFill -ne "0") {
        $voxelArgs += @("--voxel-floor-fill", $VoxelFloorFill)
    }

    $voxelArgs += $CollisionJsonPath
    Invoke-SplatTransformTimed -SplatCliArgs $voxelArgs -TimeoutMinutes $CollisionTimeoutMin -StreamProgress

    $binPath = $CollisionJsonPath -replace '\.voxel\.json$', '.voxel.bin'
    if (-not (Test-Path -LiteralPath $CollisionJsonPath)) {
        throw "missing $CollisionJsonPath after voxel step"
    }
    if (-not (Test-Path -LiteralPath $binPath)) {
        throw "missing $binPath after voxel step"
    }

    return @{
        Json = $CollisionJsonPath
        Bin = $binPath
    }
}

function Build-HeightmapFromVoxel {
    param([string]$CollisionJsonPath)

    $heightmapJson = Join-Path $WorkOut "heightmap.json"
    $extractScript = Join-Path $RepoRoot "scripts/splat/extract-heightmap.mjs"
    $cellArgs = @()
    if ($env:SPLAT_HEIGHTMAP_CELL) {
        $cellArgs = @("--cell", $env:SPLAT_HEIGHTMAP_CELL)
    }

    Write-Host "      heightmap -> $heightmapJson"
    & node $extractScript --voxel $CollisionJsonPath --out $heightmapJson @cellArgs
    if ($LASTEXITCODE -ne 0) {
        throw "extract-heightmap exited with code $LASTEXITCODE"
    }
}

$status = Get-Um02VoxelStatus
Write-Host "UM02 collision voxel status:"
$status | Format-List

if ($status.Status -eq "NO_BUNDLE") {
    $tempHint = Join-Path $RepoRoot "temp"
    $tempFiles = if (Test-Path $tempHint) {
        Get-ChildItem -LiteralPath $tempHint -File |
            Where-Object { $_.BaseName -eq $Bundle -and $_.Extension -match '^\.(ksplat|splat|ply)$' }
    } else { @() }

    Write-Host ""
    Write-Host "Missing work/out/UM02/lod-meta.json." -ForegroundColor Red
    if ($tempFiles.Count -gt 0) {
        Write-Host "Found source in temp/: $($tempFiles[0].Name)"
        Write-Host "Run the full LOD build first:"
        Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/splat/batch-lod-from-temp.ps1"
    } else {
        Write-Host "Place UM02 source splat in temp/ (e.g. temp/UM02.ksplat), then run batch-lod-from-temp.ps1."
    }
    exit 1
}

if ($status.Status -eq "NO_SOURCE") {
    Write-Host ""
    Write-Host "Missing work/lod/UM02 intermediates (lod*.ply or collision-src.ply)." -ForegroundColor Red
    Write-Host "Re-run batch-lod-from-temp.ps1 after placing the UM02 source in temp/."
    exit 1
}

if ($CheckOnly) {
    if ($status.Status -ne "HAS_VOXEL") { exit 1 }
    exit 0
}

if ($status.Status -eq "HAS_VOXEL" -and -not $Force) {
    Write-Host ""
    Write-Host "Voxels already present. Use -Force to regenerate."
    if (-not $SkipHeightmap -and -not $status.Heightmap) {
        Write-Host "Heightmap missing; re-run with -Force to rebuild voxels + heightmap."
    }
    exit 0
}

Write-Um02Log "=== generate-um02-voxels start (mesh=$WithMesh, force=$Force) ==="

try {
    $collisionJson = Join-Path $WorkOut "collision.voxel.json"
    $prepared = Ensure-CollisionSourcePly
    if (-not $prepared) {
        throw "no collision source available under work/lod/UM02"
    }

    $prepSummary = $prepared.Summary
    if (-not $prepSummary -or -not $prepSummary.CountM -or $prepSummary.CountM -le 0) {
        throw "collision prep produced 0 gaussians"
    }

    $prepExtentM = Get-SceneExtentM $prepSummary
    if ($prepExtentM -gt $CollisionMaxExtentM) {
        throw ("prep extent {0:N1}m exceeds SPLAT_COLLISION_MAX_EXTENT_M ({1}m); raise the cap or tighten prep filters" -f `
            $prepExtentM, $CollisionMaxExtentM)
    }

    $voxelParams = Get-VoxelParamsForBundle -CollisionJsonPath $collisionJson -DefaultParams $VoxelParams
    $voxelParams = Resolve-CollisionVoxelParams -ExtentM $prepExtentM -BaseParams $voxelParams
    Write-Host "      using voxel params $voxelParams"

    if ($WithMesh) {
        $outputs = Build-CollisionVoxelWithMesh `
            -SourcePath $prepared.Path `
            -CollisionJsonPath $collisionJson `
            -CollisionMeshMode $CollisionMeshMode `
            -VoxelParamsForScene $voxelParams
        $glbKb = [math]::Round((Get-Item -LiteralPath $outputs.Glb).Length / 1KB, 1)
        Write-Um02Log "OK voxels + GLB -> $($outputs.Glb) (${glbKb}KB)"
    } else {
        $outputs = Build-CollisionVoxelOnly `
            -SourcePath $prepared.Path `
            -CollisionJsonPath $collisionJson `
            -VoxelParamsForScene $voxelParams `
            -SceneExtentM $prepExtentM
        Write-Um02Log "OK voxels -> $($outputs.Json)"
    }

    if (-not $SkipHeightmap) {
        Build-HeightmapFromVoxel -CollisionJsonPath $collisionJson
        Write-Um02Log "OK heightmap -> $(Join-Path $WorkOut 'heightmap.json')"
    }

    Write-Host ""
    Write-Host "Done: $WorkOut"
    Write-Host "Log: $LogPath"
    exit 0
} catch {
    Write-Um02Log "FAIL UM02 : $($_.Exception.Message)"
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
