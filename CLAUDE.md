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
│       └── parse/route.ts        # XML parsing endpoint
├── components/
│   ├── upload/
│   │   ├── dropzone.tsx          # Drag-and-drop upload
│   │   └── run-list.tsx          # Detected runs display
│   └── ui/                       # shadcn/ui components
└── lib/
    ├── types/index.ts            # TypeScript interfaces
    ├── constants/file-patterns.ts # File detection patterns
    └── services/
        ├── ingest.ts             # Run detection logic
        └── nmap-parser.ts        # XML parsing logic
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

1. **Ingest:** ZIP upload → extract → detect run folders → build metadata
2. **Scorecard:** Select run → parse Nmap XML → aggregate top ports
3. **Diff:** Compare two runs → set difference on hosts/ports → apply risk rules

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

| Priority | Ports | Risk Level |
|----------|-------|------------|
| **P0** | 23, 445, 3389, 5900, 135, 139, 1080 | Critical |
| **P1** | 8080, 8443, 8888 | Admin/Dev |
| **P2** | 22, 80, 443 | Context-dependent |

Risk rules defined in: `src/lib/constants/file-patterns.ts` (to be moved to `risk-ports.ts`)

## Development Status

| Feature | Status |
|---------|--------|
| ZIP upload | ✅ Working |
| ZIP extraction | ✅ Working |
| Run detection | ✅ Working |
| Nmap XML parsing | ✅ Working |
| Run comparison | 🔲 Not started |
| Risk flagging UI | 🔲 Not started |
| Export functionality | 🔲 Not started |

## Git Workflow

- **Main branch:** `main` (stable Streamlit version)
- **Active branch:** `feature/nextjs-migration`
- **Commit style:** conventional commits (feat:, fix:, docs:, chore:)

## Known Issues

- Run identity can collide when re-uploading same ZIP
- Local filesystem storage only (S3 integration planned)
- Minute-granular naming (HHMM) can cause same-minute collisions
