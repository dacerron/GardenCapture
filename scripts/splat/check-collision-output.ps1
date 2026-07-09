# Compare temp/ splats and work/out bundles against collision voxel + GLB files.
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
$TempDir = Join-Path $RepoRoot "temp"
$OutDir = Join-Path $RepoRoot "work/out"

$bundles = @()
if (Test-Path $OutDir) {
    $bundles = Get-ChildItem $OutDir -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName "lod-meta.json") } |
        ForEach-Object { $_.Name } |
        Sort-Object -Unique
}

$sources = @()
if (Test-Path $TempDir) {
    $sources = Get-ChildItem $TempDir -File |
        Where-Object { $_.Extension -match '^\.(splat|ksplat|ply)$' } |
        ForEach-Object { $_.BaseName } |
        Sort-Object -Unique
}

$names = @($bundles + $sources | Sort-Object -Unique)

$rows = foreach ($base in $names) {
    $bundleDir = Join-Path $OutDir $base
    $lod = Join-Path $bundleDir "lod-meta.json"
    $json = Join-Path $bundleDir "collision.voxel.json"
    $bin = Join-Path $bundleDir "collision.voxel.bin"
    $glb = Join-Path $bundleDir "collision.collision.glb"

  $hasLod = Test-Path -LiteralPath $lod
  $hasJson = Test-Path -LiteralPath $json
  $hasBin = Test-Path -LiteralPath $bin
  $hasGlb = Test-Path -LiteralPath $glb
  $jsonBytes = if ($hasJson) { (Get-Item -LiteralPath $json).Length } else { 0 }
  $binBytes = if ($hasBin) { (Get-Item -LiteralPath $bin).Length } else { 0 }
  $glbBytes = if ($hasGlb) { (Get-Item -LiteralPath $glb).Length } else { 0 }

  $status = if ($hasJson -and $hasBin -and $jsonBytes -gt 0 -and $binBytes -gt 0 -and $hasGlb) { "OK" }
            elseif ($hasJson -and $hasBin -and $jsonBytes -gt 0 -and $binBytes -gt 0) { "NO_GLB" }
            elseif (-not $hasLod) { "NO_BUNDLE" }
            elseif (-not $hasJson -or -not $hasBin) { "MISSING_VOXEL" }
            else { "EMPTY" }

  [PSCustomObject]@{
    Bundle = $base
    Status = $status
    LOD = $hasLod
    JsonKB = [math]::Round($jsonBytes / 1KB, 1)
    BinKB = [math]::Round($binBytes / 1KB, 1)
    GlbKB = [math]::Round($glbBytes / 1KB, 1)
  }
}

Write-Host "Bundles / sources checked: $($names.Count)"
Write-Host ""
$rows | Format-Table -AutoSize

$ok = @($rows | Where-Object Status -eq "OK").Count
$bad = @($rows | Where-Object Status -ne "OK").Count
Write-Host "Collision complete (voxel + GLB): $ok / $($names.Count)"
if ($bad -gt 0) {
    Write-Host "Incomplete:"
    $rows | Where-Object Status -ne "OK" | ForEach-Object { Write-Host "  - $($_.Bundle): $($_.Status)" }
    Write-Host ""
    Write-Host "Generate missing GLBs: powershell -ExecutionPolicy Bypass -File scripts/splat/generate-collision-glbs.ps1"
    exit 1
}
