#!/usr/bin/env bash
#
# scripts/check.sh — Orchestrate the `just check` pipeline.
#
# Each step runs even if a prior step fails, so a single pass surfaces every
# problem at once. A summary table is printed at the end. Exits non-zero if
# any step failed.

set -u

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_HDR_PROTO=$'\033[1;36m'
  C_HDR_GO=$'\033[1;34m'
  C_HDR_TS=$'\033[1;35m'
  C_OK=$'\033[1;32m'
  C_FAIL=$'\033[1;31m'
  C_RESET=$'\033[0m'
else
  C_HDR_PROTO=""; C_HDR_GO=""; C_HDR_TS=""; C_OK=""; C_FAIL=""; C_RESET=""
fi

# step_key | banner_color | banner | shell command
STEPS=(
  "proto-lint|$C_HDR_PROTO|Proto: lint (buf lint)|buf lint"
  "proto-fmt|$C_HDR_PROTO|Proto: format (buf format -w)|buf format -w"
  "go-fmt|$C_HDR_GO|Server: format (gofmt -s -w)|cd apps/server && gofmt -s -w ."
  "go-vet|$C_HDR_GO|Server: vet (go vet ./...)|cd apps/server && go vet ./..."
  "go-lint|$C_HDR_GO|Server: lint (golangci-lint run)|cd apps/server && golangci-lint run"
  "ts-fmt|$C_HDR_TS|Client: format (prettier --write)|bun x prettier --write --log-level warn ."
  "ts-lint|$C_HDR_TS|Client: lint (eslint --fix)|bun x eslint --fix ."
  "ts-check|$C_HDR_TS|Client: typecheck (tsc --noEmit)|bun x tsc -p packages/core/tsconfig.json --noEmit && bun x tsc -p apps/cli/tsconfig.json --noEmit"
)

keys=()
statuses=()
durations=()
overall=0
total_start=$(date +%s)

fmt_dur() {
  local s=$1
  if [ "$s" -ge 60 ]; then
    printf '%dm%02ds' "$((s / 60))" "$((s % 60))"
  else
    printf '%ds' "$s"
  fi
}

for entry in "${STEPS[@]}"; do
  IFS='|' read -r key color banner cmd <<< "$entry"
  printf '%s=== %s ===%s\n' "$color" "$banner" "$C_RESET"
  start=$(date +%s)
  if ( eval "$cmd" ); then
    statuses+=("PASS")
  else
    statuses+=("FAIL")
    overall=1
  fi
  end=$(date +%s)
  keys+=("$key")
  durations+=("$(fmt_dur $((end - start)))")
done

total_elapsed=$(fmt_dur $(($(date +%s) - total_start)))

# Column widths.
key_w=4      # "Step"
for k in "${keys[@]}"; do
  if [ "${#k}" -gt "$key_w" ]; then key_w=${#k}; fi
done
status_w=6   # "Status"
dur_w=8      # "Duration"
for d in "${durations[@]}"; do
  if [ "${#d}" -gt "$dur_w" ]; then dur_w=${#d}; fi
done

repeat_dash() {
  local n=$1
  local i=0
  while [ "$i" -lt "$n" ]; do
    printf -- '-'
    i=$((i + 1))
  done
}

border() {
  printf '+'
  repeat_dash $((key_w + 2));    printf '+'
  repeat_dash $((status_w + 2)); printf '+'
  repeat_dash $((dur_w + 2));    printf '+\n'
}

echo
printf '%s== Summary ==%s\n' "$C_HDR_PROTO" "$C_RESET"
border
printf '| %-*s | %-*s | %*s |\n' "$key_w" "Step" "$status_w" "Status" "$dur_w" "Duration"
border

pass_count=0
fail_count=0
for i in "${!keys[@]}"; do
  s="${statuses[$i]}"
  if [ "$s" = "PASS" ]; then
    color="$C_OK"
    pass_count=$((pass_count + 1))
  else
    color="$C_FAIL"
    fail_count=$((fail_count + 1))
  fi
  # Pad status manually so embedded color codes don't skew the column width.
  pad=$((status_w - ${#s}))
  printf '| %-*s | %s%s%s%*s | %*s |\n' \
    "$key_w" "${keys[$i]}" \
    "$color" "$s" "$C_RESET" "$pad" "" \
    "$dur_w" "${durations[$i]}"
done
border
echo

if [ "$overall" -eq 0 ]; then
  printf '%s✓ %d/%d steps passed — %s elapsed%s\n' \
    "$C_OK" "$pass_count" "${#keys[@]}" "$total_elapsed" "$C_RESET"
else
  printf '%s✘ %d/%d steps failed — %s elapsed%s\n' \
    "$C_FAIL" "$fail_count" "${#keys[@]}" "$total_elapsed" "$C_RESET"
  printf '%s  Failed:%s' "$C_FAIL" "$C_RESET"
  for i in "${!keys[@]}"; do
    if [ "${statuses[$i]}" = "FAIL" ]; then
      printf ' %s' "${keys[$i]}"
    fi
  done
  echo
fi

exit "$overall"
