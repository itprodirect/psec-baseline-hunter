# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PSEC Baseline Hunter is a network security baseline comparison tool. It ingests baselinekit (Nmap-based) scan results, analyzes them, and compares runs to detect new security exposures.

**Currently migrating from Streamlit (Python) to Next.js (TypeScript).**

## Quick Reference

| Documentation | Purpose |
|--------------|---------|
| [docs/ROADMAP.md](docs/ROADMAP.md) | Full feature roadmap and security concepts |
| [docs/SCANNING_GUIDE.md](docs/SCANNING_GUIDE.md) | How to create scan files with Nmap |
| [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md) | Technical migration plan |
| [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) | Current implementation status |

---

## Demo-Ready Sprint (Current Focus)

### Priority 1: Connect Scorecard to Real Data
- [x] Wire up selected run to display actual parsed metrics
- [x] Add P0/P1/P2 risk classification display
- [x] Show top 3 recommended actions
- [x] Human-readable summary at top

### Priority 2: Demo Mode
- [x] Create preloaded sample run pair (baseline vs current)
- [x] Precomputed results that populate immediately
- [x] "Load Demo Data" button on upload page
- [x] Populates Scorecard and Diff with realistic numbers
- Location: `data/demo/` for fixtures

### Priority 3: Diff Page (Partially Complete)
- [x] Display comparison metrics (new/removed hosts, ports opened/closed)
- [x] Risky exposures with P0/P1/P2 badges
- [x] Export CHANGES.md and WATCHLIST.md
- [ ] Wire to real data (currently demo-only)

### Definition of Done (Demo-Ready v1)
- [x] Upload (or Demo Mode) produces a clear Overview status
- [x] Scorecard shows real counts + top 3 actions
- [x] Diff shows a one-paragraph narrative + top changes
- [ ] Persona toggle instantly changes explanation style
- [x] No "blank" screens after upload

---

## Commands

### Next.js (Current)
```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # Run ESLint
npx tsc --noEmit     # Type check
```

### Legacy Streamlit (Deprecated)
```bash
streamlit run streamlit_app/Home.py    # Original Python app
pip install -r requirements.txt         # Python dependencies
```

## Architecture

### Next.js Structure (Active Development)
```
src/
├── app/
│   ├── (dashboard)/              # Dashboard layout group
│   │   ├── upload/page.tsx       # ZIP upload & run detection
│   │   ├── scorecard/page.tsx    # Single-run analysis
│   │   └── diff/page.tsx         # Run comparison
│   └── api/
│       ├── upload/route.ts       # File upload endpoint
│       ├── ingest/route.ts       # ZIP extraction endpoint
│       ├── runs/route.ts         # List runs endpoint
│       ├── parse/route.ts        # XML parsing endpoint
│       ├── demo/route.ts         # Demo data endpoint
│       └── scorecard/[runUid]/route.ts  # Scorecard data for a run
├── components/
│   ├── upload/
│   │   ├── dropzone.tsx          # Drag-and-drop upload
│   │   └── run-list.tsx          # Detected runs display
│   └── ui/                       # shadcn/ui components
└── lib/
    ├── types/index.ts            # TypeScript interfaces
    ├── constants/
    │   ├── file-patterns.ts      # File detection patterns
    │   └── risk-ports.ts         # P0/P1/P2 risk classification
    ├── context/
    │   └── demo-context.tsx      # Demo mode state management
    └── services/
        ├── ingest.ts             # Run detection logic
        ├── nmap-parser.ts        # XML parsing logic
        ├── run-registry.ts       # Run manifest CRUD
        └── risk-classifier.ts    # Risk classification service
```

### Data Directory Structure
```
data/
├── uploads/          # Uploaded ZIP files
├── extracted/        # Extracted ZIP contents
├── runs/             # Run registry (index.json + manifests)
└── demo/             # Demo fixtures
    └── demo-data.json
```

### Legacy Python Structure
```
core/                   # Business logic modules (reference for porting)
├── ingest.py           # Upload, extract zip, detect runs
├── nmap_parse.py       # Parse Nmap XML
└── diff.py             # Run comparison, risk flagging

streamlit_app/          # Original Streamlit pages (deprecated)
```

## Key Data Flows

1. **Ingest:** ZIP upload → extract → detect run folders → register in registry
2. **Scorecard:** Select run → parse Nmap XML → classify risks → aggregate top ports
3. **Diff:** Compare two runs → set difference on hosts/ports → apply risk rules → generate summary

## Input File Requirements

### Expected ZIP Structure
```
{network-name}/
└── rawscans/
    └── YYYY-MM-DD_HHMM_{run-type}/
        ├── ports_top200_open.xml    # Main port scan (required)
        ├── hosts_up.txt             # Live hosts list
        ├── discovery_ping_sweep.xml # Discovery scan
        └── [other scan files]
```

### Folder Naming Pattern
```
2025-12-31_2044_baselinekit_v0
│          │    │
│          │    └── Run type identifier
│          └── Time (24hr format)
└── Date (YYYY-MM-DD)
```

## Risk Classification

| Priority | Ports | Risk Level | Description |
|----------|-------|------------|-------------|
| **P0** | 23, 445, 3389, 5900, 135, 139, 1080 | Critical | Immediate action required |
| **P1** | 8080, 8443, 8888 | Admin/Dev | Should be reviewed |
| **P2** | 22, 80, 443 | Context-dependent | Standard services |

Risk rules defined in: `src/lib/constants/risk-ports.ts`

## Development Status

| Feature | Status |
|---------|--------|
| ZIP upload | ✅ Working |
| ZIP extraction | ✅ Working |
| Run detection | ✅ Working |
| Run registry | ✅ Working |
| Nmap XML parsing | ✅ Working |
| Demo mode | ✅ Working |
| Scorecard (demo) | ✅ Working |
| Scorecard (real data) | ✅ Working |
| Diff (demo) | ✅ Working |
| Diff (real data) | 🔲 Not started |
| Persona toggle | 🔲 Not started |
| Export functionality | ✅ Working (demo mode) |

## Git Workflow

- **Main branch:** `main` (stable Streamlit version)
- **Active branch:** `feature/phase2-run-registry`
- **Commit style:** conventional commits (feat:, fix:, docs:, chore:)

## Known Issues

- Local filesystem storage only (S3 integration planned)
- Minute-granular naming (HHMM) can cause same-minute collisions
- Diff comparison only works in demo mode currently

---

## Future Enhancements

### UX Improvements (Quick Wins)
- Page Renames: Upload → "Start Scan Review", Scorecard → "Health Overview", Diff → "Changes"
- Persona Toggle: Security / Executive / Legal / Operations views
- Plain-Language Summaries on every major view

### Hardening + Scalability
- Replace client-supplied paths with runId-based APIs
- Add zip-slip + extraction guardrails
- Refactor recursive run detection into testable units
- Convert sync fs hotspots to async
- Surface filesystem errors in UI
