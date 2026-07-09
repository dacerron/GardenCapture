# Generate collision.collision.glb for each LOD bundle under work/out/.
# Usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-collision-glbs.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-collision-glbs.ps1 -CheckOnly
#   powershell -ExecutionPolicy Bypass -File scripts/splat/generate-collision-glbs.ps1 -Bundle UBC_Farm_Agricultural
#
# Optional env (same as batch-lod-from-temp.ps1 collision step):
#   SPLAT_COLLISION_MESH=smooth   mesh shape: smooth (default) or faces
#   SPLAT_VOXEL_PARAMS=0.1,0.12   used when no collision.voxel.json exists yet
#   SPLAT_COLLISION_SEED_POS=0,0,0
#   SPLAT_VOXEL_FLOOR_FILL=1.6
#   SPLAT_COLLISION_TIMEOUT_MIN=90
#
# Requires @playcanvas/splat-transform on PATH and work/lod/{bundle}/ intermediates
# (collision-src.ply or lod*.ply from a prior batch-lod run).
#
# Note: re-runs voxelization and overwrites collision.voxel.json/.bin so the GLB
# matches the mesh; existing voxel headers are reused for --voxel-params size.

param(
    [switch]$CheckOnly,
    [switch]$Force,
    [string]$Bundle
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$WorkLod = Join-Path $RepoRoot "work/lod"
$WorkOut = Join-Path $RepoRoot "work/out"
$LogPath = Join-Path $RepoRoot "work/generate-collision-glbs.log"

. (Join-Path $PSScriptRoot "collision-lib.ps1")
Initialize-CollisionLibConfig

$CollisionMeshMode = if ($env:SPLAT_COLLISION_MESH -and $env:SPLAT_COLLISION_MESH -ne "none") {
    $env:SPLAT_COLLISION_MESH
} else {
    "smooth"
}

function Write-GenLog {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    New-Item -ItemType Directory -Force -Path (Split-Path $LogPath) | Out-Null
    Add-Content -Path $LogPath -Value $line -Encoding utf8
    Write-Host $Message
}

function Get-CollisionGlbStatus {
    param([string]$BundleName)

    $outDir = Join-Path $WorkOut $BundleName
    $lodDir = Join-Path $WorkLod $BundleName
    $lod = Join-Path $outDir "lod-meta.json"
    $json = Join-Path $outDir "collision.voxel.json"
    $bin = Join-Path $outDir "collision.voxel.bin"
    $glb = Join-Path $outDir "collision.collision.glb"
    $collisionSrc = Join-Path $lodDir "collision-src.ply"

    $hasLod = Test-Path -LiteralPath $lod
    $hasJson = Test-Path -LiteralPath $json
    $hasBin = Test-Path -LiteralPath $bin
    $hasGlb = Test-Path -LiteralPath $glb
    $hasCollisionSrc = Test-Path -LiteralPath $collisionSrc
    $hasLodDir = Test-Path -LiteralPath $lodDir
    $lodPlyCount = if ($hasLodDir) {
        (Get-ChildItem -LiteralPath $lodDir -Filter "lod*.ply" -ErrorAction SilentlyContinue).Count
    } else { 0 }

    $glbKb = if ($hasGlb) { [math]::Round((Get-Item -LiteralPath $glb).Length / 1KB, 1) } else { 0 }

    $status = if (-not $hasLod) { "NO_BUNDLE" }
        elseif ($hasGlb) { "HAS_GLB" }
        elseif (-not $hasLodDir -or ($lodPlyCount -eq 0 -and -not $hasCollisionSrc)) { "NO_SOURCE" }
        elseif (-not $hasJson -or -not $hasBin) { "NEEDS_VOXEL_AND_GLB" }
        else { "NEEDS_GLB" }

    [PSCustomObject]@{
        Bundle = $BundleName
        Status = $status
        LOD = $hasLod
        Voxel = ($hasJson -and $hasBin)
        GLB = $hasGlb
        GlbKB = $glbKb
        CollisionSrc = $hasCollisionSrc
        LodPlys = $lodPlyCount
    }
}

function Get-TargetBundles {
    if (-not (Test-Path -LiteralPath $WorkOut)) {
        return @()
    }

    $names = Get-ChildItem -LiteralPath $WorkOut -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "lod-meta.json") } |
        ForEach-Object { $_.Name } |
        Sort-Object

    if ($Bundle) {
        $names = @($names | Where-Object { $_ -eq $Bundle })
        if ($names.Count -eq 0) {
            throw "Bundle not found under work/out with lod-meta.json: $Bundle"
        }
    }

    return $names
}

function Resolve-CollisionSourcePath {
    param(
        [string]$BundleName,
        [string]$LodDir
    )

    $collisionSrc = Join-Path $LodDir "collision-src.ply"
    if (Test-Path -LiteralPath $collisionSrc) {
        return @{
            Path = $collisionSrc
            Label = "collision-src.ply"
            Prepared = $true
        }
    }

    $lodFiles = Get-ChildItem -LiteralPath $LodDir -Filter "lod*.ply" -ErrorAction SilentlyContinue |
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
    param(
        [string]$BundleName,
        [string]$LodDir
    )

    $resolved = Resolve-CollisionSourcePath -BundleName $BundleName -LodDir $LodDir
    if (-not $resolved) {
        return $null
    }

    if ($resolved.Prepared) {
        return $resolved.Path
    }

    $collisionSrc = Join-Path $LodDir "collision-src.ply"
    $null = Prepare-CollisionSourcePly `
        -InputPath $resolved.Path `
        -OutputPath $collisionSrc `
        -BaseName $BundleName `
        -InputLabel $resolved.Label
    return $collisionSrc
}

$bundles = Get-TargetBundles
if ($bundles.Count -eq 0) {
    Write-Host "No LOD bundles found under $WorkOut"
    exit 1
}

$rows = foreach ($name in $bundles) {
    Get-CollisionGlbStatus -BundleName $name
}

Write-Host "Collision GLB status (work/out):"
$rows | Format-Table -AutoSize

$hasGlb = @($rows | Where-Object Status -eq "HAS_GLB").Count
$needs = @($rows | Where-Object { $_.Status -ne "HAS_GLB" -and $_.Status -ne "NO_BUNDLE" }).Count
Write-Host "GLB present: $hasGlb / $($rows.Count); actionable: $needs"

if ($CheckOnly) {
    if ($needs -gt 0) { exit 1 }
    exit 0
}

if ($needs -eq 0 -and -not $Force) {
    Write-Host "All bundles already have collision.collision.glb. Use -Force to regenerate."
    exit 0
}

Write-GenLog "=== generate-collision-glbs start (mesh=$CollisionMeshMode) ==="
$failures = 0

foreach ($name in $bundles) {
    $status = Get-CollisionGlbStatus -BundleName $name
    if ($status.Status -eq "NO_BUNDLE") { continue }
    if ($status.Status -eq "HAS_GLB" -and -not $Force) { continue }
    if ($status.Status -eq "NO_SOURCE") {
        Write-GenLog "SKIP $name : no work/lod intermediates (re-run batch-lod-from-temp.ps1 for this scene)"
        $failures++
        continue
    }

    Write-Host ""
    Write-Host "========================================"
    Write-Host " $name"
    Write-Host "========================================"

    $outDir = Join-Path $WorkOut $name
    $lodDir = Join-Path $WorkLod $name
    $collisionJson = Join-Path $outDir "collision.voxel.json"

    try {
        $sourcePath = Ensure-CollisionSourcePly -BundleName $name -LodDir $lodDir
        if (-not $sourcePath) {
            throw "no collision source available"
        }

        $voxelParams = Get-VoxelParamsForBundle -CollisionJsonPath $collisionJson -DefaultParams $VoxelParams
        Write-Host "      using voxel params $voxelParams"

        $outputs = Build-CollisionVoxelWithMesh `
            -SourcePath $sourcePath `
            -CollisionJsonPath $collisionJson `
            -CollisionMeshMode $CollisionMeshMode `
            -VoxelParamsForScene $voxelParams

        $glbKb = [math]::Round((Get-Item -LiteralPath $outputs.Glb).Length / 1KB, 1)
        Write-GenLog "OK $name -> $($outputs.Glb) (${glbKb}KB)"
        Write-Host "Done: $($outputs.Glb) (${glbKb}KB)"
    } catch {
        $failures++
        Write-GenLog "FAIL $name : $($_.Exception.Message)"
        Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-GenLog "=== generate-collision-glbs complete (failures=$failures) ==="
Write-Host ""
Write-Host "Log: $LogPath"

if ($failures -gt 0) { exit 1 }
exit 0
