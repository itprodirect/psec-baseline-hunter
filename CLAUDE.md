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

## Current Sprint: AI-Powered Insights (v0.5.0 - Complete)

### Real-World Impact Cards + Executive Summaries (Phase 5.5)
- [x] Port impact cards on P0/P1 risk ports with breach examples
- [x] Real breach examples with financial costs (WannaCry, NotPetya, etc.)
- [x] 30-day localStorage caching for impact data
- [x] Executive summary generator for leadership
- [x] Business-focused reports with financial impact estimates
- [x] Profession-aware and regulatory context (HIPAA/PCI-DSS)
- [x] Rule-based fallbacks for both features
- [x] Markdown export with copy/download

### Previous Sprint: Real Data Diff (v0.4.0 - Complete)
- [x] Run selector UI on Changes page (baseline + current dropdowns)
- [x] API integration with `/api/diff` endpoint
- [x] Diff computation from actual parsed Nmap XML data
- [x] Host delta (new/removed hosts from real scans)
- [x] Port delta (opened/closed ports from real scans)
- [x] Risk scoring (0-100 scale with labels)
- [x] Export CHANGES.md and WATCHLIST.md with real data

### Previous Sprint: Personalized Summaries (v0.3.0 - Complete)
- [x] LLM integration (Anthropic Claude / OpenAI with automatic fallback)
- [x] User profile capture (technical level, profession, context, tone)
- [x] Privacy-first design (IP redaction by default, opt-in to include)
- [x] Rule-based fallback when no API key configured
- [x] Personalized summaries on Health Overview + Changes pages
- [x] Persona system with shared React Context

### Previous Sprint: Demo Mode (Complete)
- [x] Wire up selected run to display actual parsed metrics
- [x] Add P0/P1/P2 risk classification display
- [x] Demo mode with preloaded sample data

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
│   │   ├── layout.tsx            # Dashboard layout with PersonaProvider
│   │   ├── upload/page.tsx       # "Start Scan Review" - ZIP upload
│   │   ├── scorecard/page.tsx    # "Health Overview" - single-run analysis
│   │   └── diff/page.tsx         # "Changes" - run comparison
│   └── api/
│       ├── upload/route.ts       # File upload endpoint
│       ├── ingest/route.ts       # ZIP extraction endpoint
│       ├── runs/route.ts         # List runs endpoint
│       ├── parse/route.ts        # XML parsing endpoint
│       ├── demo/route.ts         # Demo data endpoint
│       ├── scorecard/[runUid]/route.ts  # Scorecard data for a run
│       └── llm/
│           ├── scorecard-summary/route.ts  # LLM-powered scorecard explanations
│           ├── diff-summary/route.ts       # LLM-powered diff explanations
│           ├── port-impact/route.ts        # Real-world breach examples
│           └── executive-summary/route.ts  # Executive reports for leadership
├── components/
│   ├── upload/
│   │   ├── dropzone.tsx          # Drag-and-drop upload
│   │   └── run-list.tsx          # Detected runs display
│   ├── scorecard/
│   │   ├── PersonalizedSummaryCard.tsx   # "Explain This" card
│   │   ├── PersonalizedSummaryModal.tsx  # Profile capture wizard
│   │   ├── MarkdownViewer.tsx            # Markdown display with copy/download
│   │   ├── PortImpactCard.tsx            # Real-world breach examples
│   │   └── ExecutiveSummaryCard.tsx      # Executive summary generator
│   ├── diff/
│   │   └── PersonalizedDiffCard.tsx      # "Explain This" card for diff
│   ├── layout/
│   │   ├── nav-sidebar.tsx       # Navigation with persona display
│   │   └── persona-toggle.tsx    # Persona viewer in sidebar
│   └── ui/                       # shadcn/ui components
└── lib/
    ├── types/
    │   ├── index.ts              # TypeScript interfaces
    │   └── userProfile.ts        # User profile types for personalization
    ├── constants/
    │   ├── file-patterns.ts      # File detection patterns
    │   └── risk-ports.ts         # P0/P1/P2 risk classification
    ├── context/
    │   ├── demo-context.tsx      # Demo mode state management
    │   └── persona-context.tsx   # User profile state (shared across app)
    ├── llm/
    │   ├── provider.ts           # LLM abstraction (Anthropic/OpenAI)
    │   ├── prompt-scorecard.ts   # Scorecard prompt templates + fallback
    │   ├── prompt-diff.ts        # Diff prompt templates + fallback
    │   ├── prompt-impact.ts      # Port impact prompts + breach database
    │   └── prompt-executive.ts   # Executive summary prompts
    └── services/
        ├── ingest.ts             # Run detection logic
        ├── nmap-parser.ts        # XML parsing logic
        ├── run-registry.ts       # Run manifest CRUD
        ├── risk-classifier.ts    # Risk classification service
        └── impact-cache.ts       # Port impact caching (30-day TTL)
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
| Health Overview (Scorecard) | ✅ Working (demo + real data) |
| Changes (Diff) | ✅ Working (demo + real data) |
| Run comparison | ✅ Working (select baseline + current runs) |
| Diff engine | ✅ Working (computes host/port differences) |
| Risk scoring | ✅ Working (0-100 scale) |
| LLM Integration | ✅ Working (Anthropic/OpenAI) |
| Personalized Summaries | ✅ Working (Health Overview + Changes) |
| Persona System | ✅ Working (shared context, localStorage) |
| Real-World Impact Cards | ✅ Working (P0/P1 ports with breach examples) |
| Executive Summary | ✅ Working (business-focused reports) |
| Port Impact Caching | ✅ Working (30-day localStorage) |
| Page Renames | ✅ Complete |
| Export functionality | ✅ Working (real data + summaries) |

## Git Workflow

- **Main branch:** `main` (stable Streamlit version)
- **Active branch:** `feature/phase2-run-registry`
- **Commit style:** conventional commits (feat:, fix:, docs:, chore:)

## Known Issues

- Local filesystem storage only (S3 integration planned)
- Minute-granular naming (HHMM) can cause same-minute collisions
- No run deduplication (re-uploading same ZIP creates duplicates)

---

## Future Enhancements

### Completed: Real-World Impact + Executive Summaries (v0.5.0)
- ~~Port impact cards with breach examples and financial costs~~ ✅
- ~~Executive summary generator for leadership~~ ✅
- ~~30-day caching for impact data~~ ✅
- ~~Rule-based fallbacks for both features~~ ✅

### Completed: Wire Diff to Real Data (v0.4.0)
- ~~Connect Changes page to actual parsed run data~~ ✅
- ~~Remove demo-only limitation from comparison~~ ✅

### Next Priority: Custom Rules + History (Phase 5)
- [ ] Custom risk rules (per-network port classifications)
- [ ] Comparison history with shareable URLs
- [ ] CSV export alongside markdown
- [ ] S3 cloud storage integration

### Hardening + Scalability (Phase 6)
- Replace client-supplied paths with runId-based APIs
- Add zip-slip + extraction guardrails
- Refactor recursive run detection into testable units
- Convert sync fs hotspots to async
- Surface filesystem errors in UI

## Environment Variables

For LLM-powered personalized summaries, configure one of:

```env
# Anthropic Claude (preferred)
ANTHROPIC_API_KEY=sk-ant-...

# OpenAI (fallback)
OPENAI_API_KEY=sk-...
```

If neither is configured, the app falls back to rule-based summaries.
