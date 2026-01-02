# Session 3 Notes — Diff Mode + Risk Flags

## Shipped
- Diff page UI: Network selector + Run type filter + Comparison presets (Latest vs Previous).
- Diff results: host delta, port delta, risk flags, export CHANGES.md + WATCHLIST.md.
- Installed/used tabulate for markdown table rendering.

## Known Issues (Expected)
- Run identity can collide or look duplicated when:
  - multiple ingests/extractions exist for the same underlying run, OR
  - run folder naming is minute-granular (HHMM), OR
  - the same zip is ingested multiple times.
- This can cause confusing pairing and sometimes A/B appear identical.

## Next Overhaul Plan (Recommended)
- Build canonical run registry in `data/runs/` with a manifest:
  - stable run_id (network + timestamp + run_type + hash or uuid)
  - dedupe across ingests using content hash of key files
- Make UI list runs only from registry (not from `data/extracted/`)
- Optional guardrails:
  - prevent comparing different run_types unless "Advanced" enabled
  - disallow A == B and warn on same-minute collisions
