# PSEC Baseline Hunter - Project Status

**Last Updated:** 2026-06-27
**Current Branch:** `main`
**Version:** v0.6.0 - Custom Rules and History

---

## Project Goal

Increase personal security by making network risk easier to understand and simpler to act on:

- Explain scan results in plain language for non-security users.
- Highlight what changed and what matters most first.
- Keep the workflow fast: upload -> review -> compare -> take action.

---

## Quick Status

| Metric | Value |
|--------|-------|
| **Current Release** | v0.6.0 (Custom Rules and History) |
| **Recent Work** | Refactor: split large `scorecard` and `diff` pages into reusable components |
| **Next Milestone** | Phase 6 hardening (rate limits, audit logging, operational safeguards) |
| **Tech Stack** | Next.js 16 + TypeScript 5 + Tailwind 4 + shadcn/ui |

---

## Phase Completion Status

| Phase | Description | Status | Date |
|-------|-------------|--------|------|
| **Phase 0** | Scaffolding, CI, UI shell | Complete | 2026-01-25 |
| **Phase 1** | Upload, extraction, parsing | Complete | 2026-01-25 |
| **Phase 2** | Run registry, demo mode, scorecard | Complete | 2026-01-25 |
| **Phase 3** | Deterministic evidence summaries, presentation context | Complete | 2026-01-26 |
| **Phase 4** | Diff with real data | Complete | 2026-01-27 |
| **Phase 5** | Custom rules, history, CSV export | Complete | 2026-01-27 |
| **Phase 5.5** | Evidence-bounded executive summaries + port-impact gate | Complete | 2026-01-27 |
| **Phase 6** | Hardening and production controls | Not started | - |

---

## What Works Now

### User-facing Features

| Feature | Status | Description |
|---------|--------|-------------|
| ZIP Upload + Ingest | Working | Drag/drop upload, extraction, run detection |
| Demo Mode | Working | One-click sample data flow |
| Health Overview (`/scorecard`) | Working | Single-run observations, review priorities, and evidence limits |
| Changes (`/diff`) | Working | Evidence-aware baseline/current comparison without a synthetic safety score |
| Saved Comparisons | Working | Save, reopen, delete, share by ID |
| Custom Risk Rules | Working | Network-specific/global overrides and whitelist rules |
| CSV Export | Working | Scorecard and diff exports (full + review list) |
| Evidence Summaries | Working | Deterministic server-rendered summaries from recomputed evidence |
| Executive Summary | Working | Deterministic leadership report with explicit evidence limits |
| Port Impact | Closed pending evidence | Returns a non-success response until verified external-vantage evidence exists |

### API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/upload` | POST | Upload ZIP file | Working |
| `/api/ingest` | POST | Extract ZIP and detect runs | Working |
| `/api/runs` | GET | List run manifests | Working |
| `/api/parse` | POST | Parse Nmap XML | Working |
| `/api/demo` | GET | Return demo dataset | Working |
| `/api/scorecard/[runUid]` | GET | Build scorecard data | Working |
| `/api/diff` | POST | Compute run-to-run diff | Working |
| `/api/comparisons` | GET, POST | List or save comparisons | Working |
| `/api/comparisons/[comparisonId]` | GET, DELETE | Read/delete one comparison | Working |
| `/api/rules` | GET, POST | List/create custom risk rules | Working |
| `/api/rules/[ruleId]` | GET, PUT, DELETE | Manage one custom rule | Working |
| `/api/llm/scorecard-summary` | POST | Render an evidence-bounded scorecard report | Working |
| `/api/llm/diff-summary` | POST | Render an evidence-bounded comparison report | Working |
| `/api/llm/port-impact` | POST | Require verified external-vantage evidence | Closed (422) |
| `/api/llm/executive-summary` | POST | Render an evidence-bounded leadership report | Working |
| `/api/inventory` | GET, POST | List/add known devices by network | Working |
| `/api/inventory/upload` | POST | Import inventory CSV | Working |

### Main Routes

| Route | Purpose | Status |
|------|---------|--------|
| `/` | Dashboard overview | Working |
| `/upload` | Start scan review flow | Working |
| `/scorecard` | Single-run health view | Working |
| `/diff` | Compare two runs | Working |
| `/diff/[comparisonId]` | View a saved comparison | Working |
| `/history` | Manage saved comparisons | Working |
| `/rules` | Manage risk rule overrides | Working |

---

## Architecture Snapshot

```text
src/
  app/
    (dashboard)/
      page.tsx
      upload/page.tsx
      scorecard/page.tsx
      diff/page.tsx
      diff/[comparisonId]/page.tsx
      history/page.tsx
      rules/page.tsx
    api/
      upload/ ingest/ runs/ parse/ demo/
      scorecard/[runUid]/
      diff/
      comparisons/ comparisons/[comparisonId]/
      rules/ rules/[ruleId]/
      inventory/ inventory/upload/
      llm/(scorecard-summary, diff-summary, port-impact, executive-summary)
  components/
    scorecard/ (ScorecardDisplay, ScorecardRunSelector, ScorecardEmptyState, ...)
    diff/ (DiffView, RunSelector, SaveComparisonDialog, ComparisonHistoryDialog, ...)
    rules/
    upload/
    layout/
    ui/
  lib/
    services/ (diff-engine, run-registry, comparisons-registry, rules-registry, inventory, ...)
    llm/
    context/
    constants/
    types/
```

---

## Recent Changes (Post-v0.6.0)

| Date | Change | Outcome |
|------|--------|---------|
| 2026-02-18 | Refactor `scorecard` and `diff` pages into reusable components | Cleaner page orchestration and easier UX iteration |
| 2026-02-18 | Update generated Next.js type reference path | Keeps generated typing references aligned |

---

## Session 01B Status Note

- Date: 2026-06-27
- Battery replacement is installed but still being stabilized.
- PSEC Session 01B dogfooding was completed or advanced.
- Next recommended PSEC action is a clean closeout / next-slice decision, not new feature work.
- No code changes are being made in this task.

---

## Known Gaps and Risks

| Gap | Impact | Priority |
|-----|--------|----------|
| Local filesystem storage only | No cloud durability by default | Medium |
| No auth/rate limiting on internal APIs | Hardening needed before broader deployment | High |
| Limited automated test depth | Regression risk as features expand | Medium |
| No dedicated inventory UI yet | Inventory is API-ready but less discoverable | Medium |

---

## Recommended Next Steps

1. Phase 6 hardening: add API rate limiting and audit logging.
2. Add basic auth/role gates if this moves beyond internal usage.
3. Expand tests around diff/rules/comparisons service boundaries.
4. Add a first-class inventory UI to support unknown-device triage workflow.

---

## Verification Commands

```bash
npm run dev
npm run lint
npm run build
npm test
```
