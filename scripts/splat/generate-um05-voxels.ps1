# Regenerate collision voxels + heightmap for UM05_HighQuality_0SH (viewer FieldID UM_05).
#
# Tuned for faint above-ground haze: higher opacity threshold + floater filter +
# a tighter walkable Y band when extracting the heightmap.
#
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-um05-voxels.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-um05-voxels.ps1 -CheckOnly
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-um05-voxels.ps1 -Force
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-um05-voxels.ps1 -HeightmapOnly
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-um05-voxels.ps1 -Force -Opacity 0.3
#
# Prerequisites:
#   - @playcanvas/splat-transform on PATH (v2.4+)
#   - Existing LOD bundle:
#       work/out/UM05_HighQuality_0SH/lod-meta.json
#       work/lod/UM05_HighQuality_0SH/lod*.ply  (or collision-src.ply)
#
# Output:
#   work/out/UM05_HighQuality_0SH/collision.voxel.json
#   work/out/UM05_HighQuality_0SH/collision.voxel.bin
#   work/out/UM05_HighQuality_0SH/heightmap.json + heightmap.bin
#
# Defaults (override via env or params; env wins when already set):
#   SPLAT_VOXEL_PARAMS=0.1,0.25          # size, opacity — raise opacity to ignore faint floaters
#   SPLAT_COLLISION_FILTER_FLOATERS=1
#   SPLAT_HEIGHTMAP_WALKABLE_BAND_MAX=12 # tighter than global default 30 m
#   SPLAT_VOXEL_FLOOR_FILL=1.6
#   SPLAT_COLLISION_SEED_POS=0,0,0
#   SPLAT_COLLISION_SPHERE_M=60
#
# After upload, smoke test:
#   https://d2gml8tam2i8fl.cloudfront.net/viewer/?m=UM_05

param(
    [switch]$CheckOnly,
    [switch]$Force,
    [switch]$WithMesh,
    [switch]$SkipHeightmap,
    [switch]$HeightmapOnly,
    [double]$Opacity = 0.25,
    [double]$WalkableBandMaxM = 12
)

$ErrorActionPreference = "Stop"

$Bundle = "UM05_HighQuality_0SH"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$WorkLod = Join-Path $RepoRoot "work/lod/$Bundle"
$WorkOut = Join-Path $RepoRoot "work/out/$Bundle"
$LogPath = Join-Path $RepoRoot "work/generate-um05-voxels.log"

# UM_05 defaults (only when the caller did not set env vars).
$VoxelParamsUserSet = [bool]$env:SPLAT_VOXEL_PARAMS
if (-not $env:SPLAT_VOXEL_PARAMS) {
    $env:SPLAT_VOXEL_PARAMS = ("0.1,{0}" -f $Opacity)
}
if (-not $env:SPLAT_VOXEL_FLOOR_FILL) { $env:SPLAT_VOXEL_FLOOR_FILL = "1.6" }
if (-not $env:SPLAT_COLLISION_SEED_POS) { $env:SPLAT_COLLISION_SEED_POS = "0,0,0" }
if (-not $env:SPLAT_COLLISION_SPHERE_M) { $env:SPLAT_COLLISION_SPHERE_M = "60" }
if (-not $env:SPLAT_COLLISION_MAX_EXTENT_M) { $env:SPLAT_COLLISION_MAX_EXTENT_M = "120" }
if (-not $env:SPLAT_COLLISION_TIMEOUT_MIN) { $env:SPLAT_COLLISION_TIMEOUT_MIN = "90" }
if (-not $env:SPLAT_COLLISION_FILTER_FLOATERS) { $env:SPLAT_COLLISION_FILTER_FLOATERS = "1" }
if (-not $env:SPLAT_HEIGHTMAP_WALKABLE_BAND_MAX) {
    $env:SPLAT_HEIGHTMAP_WALKABLE_BAND_MAX = "$WalkableBandMaxM"
}

. (Join-Path $PSScriptRoot "collision-lib.ps1")
Initialize-CollisionLibConfig
$CollisionMaxExtentM = [double]$env:SPLAT_COLLISION_MAX_EXTENT_M
$CollisionMeshMode = if ($env:SPLAT_COLLISION_MESH -and $env:SPLAT_COLLISION_MESH -ne "none") {
    $env:SPLAT_COLLISION_MESH
} else {
    "smooth"
}

function Write-Um05Log {
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
    $opacity = if ($parts.Count -gt 1) { $parts[1] } else { "$Opacity" }

    if ($ExtentM -gt 50) {
        $minSize = [math]::Ceiling(($ExtentM / 100) * 20) / 20
        if ($minSize -gt $size) { $size = $minSize }
    }

    return ("{0},{1}" -f $size, $opacity)
}

function Get-Um05VoxelStatus {
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
    Write-Host ("      source=collision-src.ply ({0}M gaussians); extent={1:N1}m; params={2}; floaters={3}" -f `
        $sourceCountM, $SceneExtentM, $VoxelParamsForScene, $CollisionFilterFloaters)

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
    $extraArgs = @()
    if ($env:SPLAT_HEIGHTMAP_CELL) {
        $extraArgs += @("--cell", $env:SPLAT_HEIGHTMAP_CELL)
    }
    if ($env:SPLAT_HEIGHTMAP_WALKABLE_BAND_MIN) {
        $extraArgs += @("--walkable-band-min", $env:SPLAT_HEIGHTMAP_WALKABLE_BAND_MIN)
    }
    if ($env:SPLAT_HEIGHTMAP_WALKABLE_BAND_MAX) {
        $extraArgs += @("--walkable-band-max", $env:SPLAT_HEIGHTMAP_WALKABLE_BAND_MAX)
    }
    if ($env:SPLAT_HEIGHTMAP_WALKABLE_BAND_FRACTION) {
        $extraArgs += @("--walkable-band-fraction", $env:SPLAT_HEIGHTMAP_WALKABLE_BAND_FRACTION)
    }
    if ($env:SPLAT_HEIGHTMAP_WALKABLE_MAX_Y) {
        $extraArgs += @("--walkable-max-y", $env:SPLAT_HEIGHTMAP_WALKABLE_MAX_Y)
    }

    Write-Host "      heightmap -> $heightmapJson"
    Write-Host ("      walkable-band-max={0}m (env/param); opacity source={1}" -f `
        $env:SPLAT_HEIGHTMAP_WALKABLE_BAND_MAX, $env:SPLAT_VOXEL_PARAMS)
    & node $extractScript --voxel $CollisionJsonPath --out $heightmapJson @extraArgs
    if ($LASTEXITCODE -ne 0) {
        throw "extract-heightmap exited with code $LASTEXITCODE"
    }
}

$status = Get-Um05VoxelStatus
Write-Host "UM05 ($Bundle) collision / heightmap status:"
$status | Format-List

if ($status.Status -eq "NO_BUNDLE") {
    $tempHint = Join-Path $RepoRoot "temp"
    $tempFiles = if (Test-Path $tempHint) {
        Get-ChildItem -LiteralPath $tempHint -File |
            Where-Object { $_.BaseName -eq $Bundle -and $_.Extension -match '^\.(ksplat|splat|ply)$' }
    } else { @() }

    Write-Host ""
    Write-Host "Missing work/out/$Bundle/lod-meta.json." -ForegroundColor Red
    if ($tempFiles.Count -gt 0) {
        Write-Host "Found source in temp/: $($tempFiles[0].Name)"
        Write-Host "Run the full LOD build first:"
        Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/splat/batch-lod-from-temp.ps1"
    } else {
        Write-Host "Place $Bundle source splat in temp/, then run batch-lod-from-temp.ps1."
    }
    exit 1
}

if ($HeightmapOnly) {
    $collisionJson = Join-Path $WorkOut "collision.voxel.json"
    $collisionBin = Join-Path $WorkOut "collision.voxel.bin"
    if (-not (Test-Path -LiteralPath $collisionJson) -or -not (Test-Path -LiteralPath $collisionBin)) {
        Write-Host "Missing voxels for -HeightmapOnly. Run without -HeightmapOnly first." -ForegroundColor Red
        exit 1
    }
    Write-Um05Log "=== generate-um05 heightmap-only (bandMax=$($env:SPLAT_HEIGHTMAP_WALKABLE_BAND_MAX)) ==="
    try {
        Build-HeightmapFromVoxel -CollisionJsonPath $collisionJson
        Write-Um05Log "OK heightmap -> $(Join-Path $WorkOut 'heightmap.json')"
        Write-Host ""
        Write-Host "Done (heightmap only): $WorkOut"
        Write-Host "Re-upload heightmap.json + heightmap.bin with sync-lod-to-s3 / sync-all-lod-to-s3."
        exit 0
    } catch {
        Write-Um05Log "FAIL $Bundle heightmap-only : $($_.Exception.Message)"
        Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

if ($status.Status -eq "NO_SOURCE") {
    Write-Host ""
    Write-Host "Missing work/lod/$Bundle intermediates (lod*.ply or collision-src.ply)." -ForegroundColor Red
    Write-Host "Re-run batch-lod-from-temp.ps1 after placing the source in temp/."
    exit 1
}

if ($CheckOnly) {
    if ($status.Status -ne "HAS_VOXEL") { exit 1 }
    exit 0
}

if ($status.Status -eq "HAS_VOXEL" -and -not $Force) {
    Write-Host ""
    Write-Host "Voxels already present. Use -Force to regenerate voxels + heightmap,"
    Write-Host "or -HeightmapOnly to re-extract the heightmap with current band/opacity settings."
    if (-not $SkipHeightmap -and -not $status.Heightmap) {
        Write-Host "Heightmap missing; try: -HeightmapOnly"
    }
    exit 0
}

Write-Um05Log "=== generate-um05-voxels start (mesh=$WithMesh, force=$Force, opacity=$Opacity, bandMax=$WalkableBandMaxM) ==="

try {
    $collisionJson = Join-Path $WorkOut "collision.voxel.json"

    # Re-prep on -Force so opacity/floaters changes actually apply (stale collision-src.ply).
    $staleSrc = Join-Path $WorkLod "collision-src.ply"
    if ($Force -and (Test-Path -LiteralPath $staleSrc)) {
        Write-Um05Log "Removing stale collision-src.ply so prep re-runs (floaters/opacity)"
        Remove-Item -LiteralPath $staleSrc -Force
    }

    $prepared = Ensure-CollisionSourcePly
    if (-not $prepared) {
        throw "no collision source available under work/lod/$Bundle"
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
        Write-Um05Log "OK voxels + GLB -> $($outputs.Glb) (${glbKb}KB)"
    } else {
        $outputs = Build-CollisionVoxelOnly `
            -SourcePath $prepared.Path `
            -CollisionJsonPath $collisionJson `
            -VoxelParamsForScene $voxelParams `
            -SceneExtentM $prepExtentM
        Write-Um05Log "OK voxels -> $($outputs.Json)"
    }

    if (-not $SkipHeightmap) {
        Build-HeightmapFromVoxel -CollisionJsonPath $collisionJson
        Write-Um05Log "OK heightmap -> $(Join-Path $WorkOut 'heightmap.json')"
    }

    Write-Host ""
    Write-Host "Done: $WorkOut"
    Write-Host "Log: $LogPath"
    Write-Host "Upload the bundle folder, then test: /viewer/?m=UM_05"
    exit 0
} catch {
    Write-Um05Log "FAIL $Bundle : $($_.Exception.Message)"
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
