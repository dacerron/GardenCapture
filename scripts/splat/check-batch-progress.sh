#!/usr/bin/env bash
# Report progress for scripts/splat/batch-lod-from-temp.ps1 (LOD + collision voxel).
#
# Usage (from repo root):
#   bash scripts/splat/check-batch-progress.sh
#   bash scripts/splat/check-batch-progress.sh --watch
#   bash scripts/splat/check-batch-progress.sh --watch 10   # refresh every 10s
#
# Works in Git Bash on Windows (uses PowerShell for process stats) and on Linux/macOS.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BATCH_LOG="$REPO_ROOT/work/batch-lod.log"
WORK_OUT="$REPO_ROOT/work/out"

WATCH=0
INTERVAL=5

usage() {
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    -w|--watch) WATCH=1; shift ;;
    [0-9]*) INTERVAL="$1"; shift ;;
    *) echo "Unknown option: $1" >&2; usage 1 ;;
  esac
done

is_windows() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*|Windows_NT) return 0 ;;
    *) return 1 ;;
  esac
}

to_windows_path() {
  local path="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$path"
  else
    # Git Bash: /c/Users/foo -> C:\Users\foo
    if [[ "$path" =~ ^/([a-zA-Z])/(.*)$ ]]; then
      local drive="${BASH_REMATCH[1]}"
      local rest="${BASH_REMATCH[2]}"
      drive="$(printf '%s' "$drive" | tr '[:lower:]' '[:upper:]')"
      printf '%s:\\%s' "$drive" "${rest//\//\\}"
    else
      printf '%s' "$path"
    fi
  fi
}

format_duration() {
  local total="${1%.*}"
  local h=$((total / 3600))
  local m=$(((total % 3600) / 60))
  local s=$((total % 60))
  if [[ "$h" -gt 0 ]]; then
    printf '%dh %dm %ds' "$h" "$m" "$s"
  elif [[ "$m" -gt 0 ]]; then
    printf '%dm %ds' "$m" "$s"
  else
    printf '%ds' "$s"
  fi
}

print_header() {
  echo "=============================================="
  echo " Splat batch progress — $(date '+%Y-%m-%d %H:%M:%S')"
  echo " Repo: $REPO_ROOT"
  echo "=============================================="
  echo
}

print_log_summary() {
  echo "--- Batch log (work/batch-lod.log) ---"
  if [[ ! -f "$BATCH_LOG" ]]; then
    echo "  (no log file yet)"
    echo
    return
  fi

  if is_windows; then
    local log_win
    log_win="$(to_windows_path "$BATCH_LOG")"
    powershell.exe -NoProfile -Command "
      \$log = '$log_win'
      if (-not (Test-Path -LiteralPath \$log)) { Write-Host '  (log missing)'; exit }
      \$lines = Get-Content -Path \$log -Encoding UTF8 -ErrorAction SilentlyContinue
      if (-not \$lines) { \$lines = Get-Content -Path \$log -ErrorAction SilentlyContinue }
      \$start = \$lines | Where-Object { \$_ -match 'batch-lod-from-temp start' } | Select-Object -Last 1
      \$processing = \$lines | Where-Object { \$_ -match '^\\[.*\\] Processing ' } | Select-Object -Last 1
      \$collision = \$lines | Where-Object { \$_ -match 'collision start:' } | Select-Object -Last 1
      \$done = \$lines | Where-Object { \$_ -match '^\\[.*\\] Done ' } | Select-Object -Last 1
      \$complete = \$lines | Where-Object { \$_ -match 'batch-lod-from-temp complete' } | Select-Object -Last 1
      \$doneCount = (\$lines | Where-Object { \$_ -match '^\\[.*\\] Done ' }).Count
      if (\$start) { Write-Host ('  Latest run:  ' + (\$start -replace '^\\[[^\\]]+\\]\\s*', '')) }
      if (\$processing) { Write-Host ('  Processing:  ' + (\$processing -replace '^\\[[^\\]]+\\]\\s*', '')) }
      if (\$collision) { Write-Host ('  Collision:   ' + (\$collision -replace '^\\[[^\\]]+\\]\\s*', '')) }
      if (\$done) { Write-Host ('  Last done:   ' + (\$done -replace '^\\[[^\\]]+\\]\\s*', '')) }
      if (\$complete) { Write-Host ('  Complete:    ' + (\$complete -replace '^\\[[^\\]]+\\]\\s*', '')) }
      Write-Host \"  Scenes marked done (log): \$doneCount\"
    " 2>/dev/null || echo "  (failed to read log via PowerShell)"
    echo
    return
  fi

  local last_start last_processing last_collision last_done last_complete
  last_start="$(grep 'batch-lod-from-temp start' "$BATCH_LOG" | tail -1 || true)"
  last_processing="$(grep 'Processing ' "$BATCH_LOG" | tail -1 || true)"
  last_collision="$(grep 'collision start:' "$BATCH_LOG" | tail -1 || true)"
  last_done="$(grep '] Done ' "$BATCH_LOG" | tail -1 || true)"
  last_complete="$(grep 'batch-lod-from-temp complete' "$BATCH_LOG" | tail -1 || true)"

  [[ -n "$last_start" ]] && echo "  Latest run:  ${last_start#*] }"
  [[ -n "$last_processing" ]] && echo "  Processing:  ${last_processing#*] }"
  [[ -n "$last_collision" ]] && echo "  Collision:   ${last_collision#*] }"
  [[ -n "$last_done" ]] && echo "  Last done:   ${last_done#*] }"
  [[ -n "$last_complete" ]] && echo "  Complete:    ${last_complete#*] }"

  local done_count
  done_count="$(grep -c '] Done ' "$BATCH_LOG" 2>/dev/null || true)"
  done_count="${done_count:-0}"
  echo "  Scenes marked done (log): $done_count"
  echo
}

print_output_summary() {
  echo "--- Output folders (work/out/) ---"
  if [[ ! -d "$WORK_OUT" ]]; then
    echo "  (work/out not found)"
    echo
    return
  fi

  local total=0 lod=0 collision=0
  local dir name
  for dir in "$WORK_OUT"/*; do
    [[ -d "$dir" ]] || continue
    name="$(basename "$dir")"
    total=$((total + 1))
    local has_lod has_col
    has_lod=" "; has_col=" "
    [[ -f "$dir/lod-meta.json" ]] && { has_lod="L"; lod=$((lod + 1)); }
    [[ -f "$dir/collision.voxel.json" && -f "$dir/collision.voxel.bin" ]] && {
      has_col="C"
      collision=$((collision + 1))
    }
    printf '  [%s%s] %s\n' "$has_lod" "$has_col" "$name"
  done

  if [[ "$total" -eq 0 ]]; then
    echo "  (no output folders)"
  else
    echo
    echo "  Legend: [L]=lod-meta.json  [C]=collision voxel pair"
    echo "  Totals: $total folder(s), $lod with LOD, $collision with collision"
  fi
  echo
}

# Windows: query batch PowerShell + splat-transform node via PowerShell.
print_processes_windows() {
  echo "--- Running processes ---"
  powershell.exe -NoProfile -Command '
    $ErrorActionPreference = "SilentlyContinue"
    $sampleSec = 2

    function Format-Duration([TimeSpan]$ts) {
      if ($ts.TotalHours -ge 1) {
        return "{0}h {1}m {2}s" -f [int]$ts.TotalHours, $ts.Minutes, $ts.Seconds
      }
      if ($ts.TotalMinutes -ge 1) {
        return "{0}m {1}s" -f [int]$ts.TotalMinutes, $ts.Seconds
      }
      return "{0}s" -f [int]$ts.TotalSeconds
    }

    function Show-ProcInfo($label, $proc) {
      if (-not $proc) {
        Write-Host ("  {0}: not running" -f $label)
        return
      }
      $wall = (Get-Date) - $proc.StartTime
      $cpuBefore = $proc.CPU
      Start-Sleep -Seconds $sampleSec
      $proc.Refresh()
      $cpuDelta = $proc.CPU - $cpuBefore
      $cores = [Environment]::ProcessorCount
      $pct = if ($cores -gt 0) { [math]::Round(($cpuDelta / $sampleSec) * 100 / $cores, 1) } else { 0 }
      $state = if ($cpuDelta -gt 0.3) { "ACTIVE" } else { "idle" }
      Write-Host ("  {0}: PID {1}" -f $label, $proc.Id)
      Write-Host ("    Wall time:   {0}" -f (Format-Duration $wall))
      Write-Host ("    CPU time:    {0:N1} min (total)" -f ($proc.CPU / 60))
      Write-Host ("    CPU usage:   ~{0}% ({1} over {2}s sample, {3} cores)" -f $pct, $state, $sampleSec, $cores)
      Write-Host ("    Memory:      {0:N0} MB" -f ($proc.WorkingSet64 / 1MB))
      Write-Host ("    Started:     {0}" -f $proc.StartTime.ToString("yyyy-MM-dd HH:mm:ss"))
    }

    $batchCim = Get-CimInstance Win32_Process |
      Where-Object { $_.CommandLine -like "*batch-lod-from-temp.ps1*" } |
      Select-Object -First 1
    $batchProc = if ($batchCim) { Get-Process -Id $batchCim.ProcessId -ErrorAction SilentlyContinue }

    $voxelCim = Get-CimInstance Win32_Process |
      Where-Object {
        $_.CommandLine -like "*splat-transform*" -and
        $_.CommandLine -like "*collision.voxel*"
      } |
      Select-Object -First 1
    $voxelProc = if ($voxelCim) { Get-Process -Id $voxelCim.ProcessId -ErrorAction SilentlyContinue }

    $otherVoxelCim = Get-CimInstance Win32_Process |
      Where-Object {
        $_.CommandLine -like "*splat-transform*" -and
        $_.CommandLine -notlike "*collision.voxel*"
      } |
      Select-Object -First 1
    $otherProc = if ($otherVoxelCim) { Get-Process -Id $otherVoxelCim.ProcessId -ErrorAction SilentlyContinue }

    Show-ProcInfo "batch-lod-from-temp.ps1" $batchProc
    if ($voxelCim) {
      $cmd = $voxelCim.CommandLine
      if ($cmd.Length -gt 120) { $cmd = $cmd.Substring(0, 117) + "..." }
      Write-Host "    Command:     $cmd"
    }
    Show-ProcInfo "splat-transform (collision)" $voxelProc
    if ($otherProc -and (-not $voxelProc -or $otherProc.Id -ne $voxelProc.Id)) {
      Show-ProcInfo "splat-transform (other)" $otherProc
    }

    if (-not $batchProc -and -not $voxelProc -and -not $otherProc) {
      Write-Host "  No batch or splat-transform processes found."
    }
  ' 2>/dev/null || echo "  (failed to query processes via PowerShell)"
  echo
}

# Unix: ps-based process info.
print_processes_unix() {
  echo "--- Running processes ---"
  local found=0

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    found=1
    echo "  $line"
  done < <(ps -ax -o pid=,etime=,pcpu=,rss=,command= 2>/dev/null | grep -E 'batch-lod-from-temp|splat-transform' | grep -v grep || true)

  if [[ "$found" -eq 0 ]]; then
    echo "  No batch or splat-transform processes found."
  else
    echo "  (etime=wall clock, pcpu=%%CPU snapshot, rss=KB)"
  fi
  echo
}

print_snapshot() {
  print_header
  print_log_summary
  print_output_summary
  if is_windows; then
    print_processes_windows
  else
    print_processes_unix
  fi
}

if [[ "$WATCH" -eq 1 ]]; then
  while true; do
    clear 2>/dev/null || true
    print_snapshot
    echo "Refreshing every ${INTERVAL}s (Ctrl+C to stop)..."
    sleep "$INTERVAL"
  done
else
  print_snapshot
fi
