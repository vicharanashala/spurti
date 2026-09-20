#!/bin/bash
# sp-runs-retention.sh — weekly retention for Spurti SP-refresh backups.
#
# Policy:
#   * Keep the last DAILY_DAYS days of ALL run artifacts (fresh rollback safety).
#   * Keep ONE snapshot per ISO week (the earliest run of the week = Monday's
#     early-morning run) for the last WEEKS weeks.
#   * Delete everything else under sp-runs/ that matches the mirror patterns.
#
# Artifacts share a timestamp token, e.g. 2026-07-14T0600Z, across:
#   sp_backup_mirror_<ts>/   sp_ledger_mirror_<ts>.csv   sp_set_aside_mirror_<ts>.csv
#
# Set DRY_RUN=1 to only print what WOULD be deleted (no changes).
set -euo pipefail

OUT_DIR="${OUT_DIR:-/home/sakshi/spurti/sp-runs}"
WEEKS="${WEEKS:-12}"
DAILY_DAYS="${DAILY_DAYS:-2}"
DRY_RUN="${DRY_RUN:-0}"

cd "$OUT_DIR" 2>/dev/null || { echo "no $OUT_DIR"; exit 0; }
now=$(date -u +%s)

# Union of all run timestamps, from all three artifact types.
tss=$( { ls -1d sp_backup_mirror_*/ 2>/dev/null | sed -E 's#^sp_backup_mirror_##; s#/$##';
         ls -1 sp_ledger_mirror_*.csv 2>/dev/null | sed -E 's#^sp_ledger_mirror_##; s#\.csv$##';
         ls -1 sp_set_aside_mirror_*.csv 2>/dev/null | sed -E 's#^sp_set_aside_mirror_##; s#\.csv$##';
       } | sort -u )

declare -A keep
declare -A week_earliest

for ts in $tss; do
  d=$(echo "$ts" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}') || true
  [ -z "$d" ] && continue
  epoch=$(date -u -d "$d" +%s 2>/dev/null) || continue
  age_days=$(( (now - epoch) / 86400 ))

  # Rule 1: last DAILY_DAYS days -> keep (fresh rollback safety)
  if [ "$age_days" -le "$DAILY_DAYS" ]; then keep[$ts]=1; fi

  # Rule 2: within WEEKS weeks -> track earliest ts per ISO week
  if [ "$age_days" -le $((WEEKS*7)) ]; then
    wk=$(date -u -d "$d" +%G-W%V)
    cur=${week_earliest[$wk]:-}
    if [ -z "$cur" ] || [[ "$ts" < "$cur" ]]; then week_earliest[$wk]=$ts; fi
  fi
done
for wk in "${!week_earliest[@]}"; do keep[${week_earliest[$wk]}]=1; done

kept=0; deleted=0
for ts in $tss; do
  if [ -n "${keep[$ts]:-}" ]; then
    kept=$((kept+1)); [ "$DRY_RUN" = "1" ] && echo "KEEP   $ts"
  else
    deleted=$((deleted+1))
    if [ "$DRY_RUN" = "1" ]; then
      echo "DELETE $ts"
    else
      rm -rf "sp_backup_mirror_$ts" "sp_ledger_mirror_$ts.csv" "sp_set_aside_mirror_$ts.csv" 2>/dev/null || true
    fi
  fi
done

echo "---"
echo "policy: keep last ${DAILY_DAYS}d dailies + 1/week for ${WEEKS} weeks"
echo "kept=$kept deleted=$deleted dry_run=$DRY_RUN"
