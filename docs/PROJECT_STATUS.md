# PSEC Baseline Hunter - Project Status

**Last Updated:** 2026-01-27
**Current Branch:** `main`
**Version:** v0.5.0 - AI-Powered Insights

---

## Quick Status

| Metric | Value |
|--------|-------|
| **Current Version** | v0.5.0 (AI-Powered Insights) |
| **Last Completed** | Phase 5.5: Real-World Impact + Executive Summaries |
| **Next Milestone** | Phase 5: Custom rules, history, CSV export |
| **Tech Stack** | Next.js 16 + TypeScript 5 + LLM |

---

## Phase Completion Status

| Phase | Description | Status | Date |
|-------|-------------|--------|------|
| **Phase 0** | Scaffolding, CI, UI shell | ✅ Complete | 2026-01-25 |
| **Phase 1** | Upload, extraction, parsing | ✅ Complete | 2026-01-25 |
| **Phase 2** | Run registry, demo mode, scorecard | ✅ Complete | 2026-01-25 |
| **Phase 3** | Personalized summaries, persona system | ✅ Complete | 2026-01-26 |
| **Phase 4** | Diff with real data | ✅ Complete | 2026-01-27 |
| **Phase 5.5** | Real-World Impact + Executive Summaries | ✅ Complete | 2026-01-27 |
| **Phase 5** | Custom rules, history, CSV export | 🔲 Not started | — |
| **Phase 6** | Hardening, production | 🔲 Not started | — |

---

## What Works Now

### Functional Features

| Feature | Status | Description |
|---------|--------|-------------|
| ZIP Upload | ✅ Working | Drag-and-drop with validation |
| ZIP Extraction | ✅ Working | Extracts to `data/extracted/` |
| Run Detection | ✅ Working | Finds `YYYY-MM-DD_HHMM_*` folders |
| Key File Detection | ✅ Working | Identifies ports, discovery, hosts files |
| Nmap XML Parsing | ✅ Working | Extracts host/port/service data |
| Top Ports | ✅ Working | Aggregates by port/service |
| Run List UI | ✅ Working | Displays detected runs |
| Demo Mode | ✅ Working | Preloaded sample data |
| Health Overview | ✅ Working | Single-run analysis with real data |
| Changes Page | ✅ Working | Comparison view with real data |
| Run Comparison | ✅ Working | Select baseline + current runs to compare |
| Diff Engine | ✅ Working | Computes host/port differences |
| Risk Scoring | ✅ Working | 0-100 risk score with labels |
| LLM Integration | ✅ Working | Anthropic Claude / OpenAI support |
| Personalized Summaries | ✅ Working | On Health Overview + Changes pages |
| Persona System | ✅ Working | Shared context, localStorage persistence |
| Real-World Impact Cards | ✅ Working | Breach examples, financial costs (P0/P1 ports) |
| Executive Summaries | ✅ Working | Business-focused reports for leadership |
| Port Impact Caching | ✅ Working | 30-day localStorage cache |
| Export | ✅ Working | CHANGES.md, WATCHLIST.md, summaries |

### API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/upload` | POST | Upload ZIP file | ✅ Working |
| `/api/ingest` | POST | Extract and detect | ✅ Working |
| `/api/runs` | GET | List all runs | ✅ Working |
| `/api/parse` | POST | Parse Nmap XML | ✅ Working |
| `/api/demo` | GET | Get demo data | ✅ Working |
| `/api/scorecard/[runUid]` | GET | Get scorecard data | ✅ Working |
| `/api/diff` | POST | Compute diff between two runs | ✅ Working |
| `/api/llm/scorecard-summary` | POST | Generate personalized summary | ✅ Working |
| `/api/llm/diff-summary` | POST | Generate diff summary | ✅ Working |
| `/api/llm/port-impact` | POST | Get real-world breach examples | ✅ Working |
| `/api/llm/executive-summary` | POST | Generate executive report | ✅ Working |

### Pages

| Page | Route | Status | Features |
|------|-------|--------|----------|
| Start Scan Review | `/upload` | ✅ Working | Dropzone, run list, demo mode button |
| Health Overview | `/scorecard` | ✅ Working | Metrics, risk ports, personalized summary |
| Changes | `/diff` | ✅ Working | Run selectors, comparison, risk score, export |

---

## Current Architecture

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Dashboard shell + PersonaProvider
│   │   ├── upload/page.tsx         # ✅ Start Scan Review
│   │   ├── scorecard/page.tsx      # ✅ Health Overview
│   │   └── diff/page.tsx           # ✅ Changes
│   └── api/
│       ├── upload/route.ts         # ✅ File upload
│       ├── ingest/route.ts         # ✅ ZIP extraction
│       ├── runs/route.ts           # ✅ Run listing
│       ├── parse/route.ts          # ✅ XML parsing
│       ├── demo/route.ts           # ✅ Demo data
│       ├── scorecard/[runUid]/route.ts  # ✅ Scorecard data
│       └── llm/
│           ├── scorecard-summary/route.ts  # ✅ Personalized summaries
│           ├── diff-summary/route.ts       # ✅ Diff summaries
│           ├── port-impact/route.ts        # ✅ Real-world impact
│           └── executive-summary/route.ts  # ✅ Executive reports
├── components/
│   ├── upload/
│   │   ├── dropzone.tsx            # ✅ Drag-and-drop
│   │   └── run-list.tsx            # ✅ Run display
│   ├── scorecard/
│   │   ├── PersonalizedSummaryCard.tsx   # ✅ Personalized summaries
│   │   ├── PersonalizedSummaryModal.tsx  # ✅ Profile wizard
│   │   ├── MarkdownViewer.tsx            # ✅ Markdown display
│   │   ├── PortImpactCard.tsx            # ✅ Breach examples
│   │   └── ExecutiveSummaryCard.tsx      # ✅ Executive reports
│   ├── diff/
│   │   └── PersonalizedDiffCard.tsx      # ✅ Diff explanation
│   ├── layout/
│   │   ├── nav-sidebar.tsx         # ✅ Navigation
│   │   └── persona-toggle.tsx      # ✅ Persona viewer
│   └── ui/                         # ✅ shadcn components
└── lib/
    ├── types/
    │   ├── index.ts                # ✅ Core types
    │   └── userProfile.ts          # ✅ Persona types
    ├── constants/
    │   ├── file-patterns.ts        # ✅ File detection
    │   └── risk-ports.ts           # ✅ Risk classification
    ├── context/
    │   ├── demo-context.tsx        # ✅ Demo state
    │   └── persona-context.tsx     # ✅ User profile state
    ├── llm/
    │   ├── provider.ts             # ✅ LLM abstraction
    │   ├── prompt-scorecard.ts     # ✅ Scorecard prompts
    │   ├── prompt-diff.ts          # ✅ Diff prompts
    │   ├── prompt-impact.ts        # ✅ Port impact prompts
    │   └── prompt-executive.ts     # ✅ Executive summary prompts
    └── services/
        ├── ingest.ts               # ✅ Run detection
        ├── nmap-parser.ts          # ✅ XML parsing
        ├── run-registry.ts         # ✅ Run manifest
        ├── risk-classifier.ts      # ✅ Risk classification
        └── impact-cache.ts         # ✅ Port impact caching
```

---

## What's Next

### Priority 1: Custom Rules + History (Phase 5)

| Task | Description |
|------|-------------|
| **Custom risk rules** | Per-network port classifications |
| **Comparison history** | Track past comparisons with shareable URLs |
| **CSV export** | Alternative export format alongside markdown |
| **S3 integration** | Cloud storage for persistence |

### Priority 2: Hardening (Phase 6)

| Task | Description |
|------|-------------|
| **Rate limiting** | Prevent abuse |
| **Audit logging** | Track all actions |
| **Run archival** | Move old runs to cold storage |

---

## Technology Stack

### Current

| Category | Technology | Version |
|----------|------------|---------|
| Framework | Next.js (App Router) | 16.1.4 |
| Language | TypeScript | ^5 |
| Runtime | Node.js | 22.14.0 |
| Styling | Tailwind CSS | ^4 |
| Components | shadcn/ui | Latest |
| XML Parsing | fast-xml-parser | ^5.1.0 |
| ZIP Handling | adm-zip | ^0.5.16 |
| File Upload | react-dropzone | ^14.3.8 |
| LLM (Anthropic) | @anthropic-ai/sdk | ^0.39.0 |
| LLM (OpenAI) | openai | ^4.77.3 |

### Planned

| Category | Technology | Phase |
|----------|------------|-------|
| State Management | SWR + Zustand | Phase 4 |
| Tables | TanStack Table | Phase 4 |
| Cloud Storage | AWS S3 | Phase 5 |
| Monitoring | Sentry | Phase 6 |

---

## Key Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| TypeScript rewrite | Single codebase, type safety | 2026-01-25 |
| Local storage first | Faster iteration, add S3 later | 2026-01-25 |
| No auth needed | Internal tool | 2026-01-25 |
| shadcn/ui | Modern, accessible, customizable | 2026-01-25 |
| Dual LLM support | Anthropic + OpenAI with auto-fallback | 2026-01-26 |
| Rule-based fallback | Works without API key | 2026-01-26 |
| Context-based persona | Shared state across all pages | 2026-01-26 |

---

## Known Issues

| Issue | Severity | Status | Fix Plan |
|-------|----------|--------|----------|
| Local storage only | Low | Planned Phase 5 | Add S3 support |
| Minute-granular naming | Low | Documented | HHMM collisions possible |
| No run deduplication | Low | Planned | Re-uploading same ZIP creates duplicates |

---

## Files Changed Recently

### Phase 5.5 (2026-01-27)

| File | Change |
|------|--------|
| `src/lib/llm/prompt-impact.ts` | Created - Port impact prompts with breach database |
| `src/lib/llm/prompt-executive.ts` | Created - Executive summary prompts |
| `src/lib/services/impact-cache.ts` | Created - 30-day localStorage caching |
| `src/app/api/llm/port-impact/route.ts` | Created - Port impact API endpoint |
| `src/app/api/llm/executive-summary/route.ts` | Created - Executive summary API endpoint |
| `src/components/scorecard/PortImpactCard.tsx` | Created - Impact card UI |
| `src/components/scorecard/ExecutiveSummaryCard.tsx` | Created - Summary card UI |
| `src/lib/types/index.ts` | Updated - Added PortImpactData, ExecutiveSummaryResponse |
| `src/app/(dashboard)/scorecard/page.tsx` | Updated - Integrated new cards |

### Phase 4 (2026-01-27)

| File | Change |
|------|--------|
| `src/app/(dashboard)/diff/page.tsx` | Added run selectors, API integration for real data diff |
| `src/lib/services/diff-engine.ts` | Already complete - computes diffs between runs |
| `src/app/api/diff/route.ts` | Already complete - POST endpoint for diff computation |
| `docs/PROJECT_STATUS.md` | Updated to v0.4.0 |
| `docs/CLAUDE.md` | Updated feature status |

### Phase 3 (2026-01-26)

| File | Change |
|------|--------|
| `src/lib/types/userProfile.ts` | Created - User profile types |
| `src/lib/llm/provider.ts` | Created - LLM abstraction |
| `src/lib/llm/prompt-scorecard.ts` | Created - Scorecard prompts |
| `src/lib/llm/prompt-diff.ts` | Created - Diff prompts |
| `src/lib/context/persona-context.tsx` | Created - Shared persona state |
| `src/app/api/llm/scorecard-summary/route.ts` | Created - LLM API |
| `src/app/api/llm/diff-summary/route.ts` | Created - Diff LLM API |
| `src/components/scorecard/PersonalizedSummaryCard.tsx` | Created |
| `src/components/scorecard/PersonalizedSummaryModal.tsx` | Created |
| `src/components/scorecard/MarkdownViewer.tsx` | Created |
| `src/components/diff/PersonalizedDiffCard.tsx` | Created |
| `src/components/layout/persona-toggle.tsx` | Created |
| `src/components/layout/nav-sidebar.tsx` | Updated - Page renames |
| `src/app/(dashboard)/layout.tsx` | Updated - Added PersonaProvider |
| `src/app/(dashboard)/scorecard/page.tsx` | Updated - Added summary card |
| `src/app/(dashboard)/diff/page.tsx` | Updated - Added summary card |

---

## Verification Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Type check
npx tsc --noEmit

# Test personalized summary flow
# 1. Open http://localhost:3000/upload
# 2. Click "Load Demo Data"
# 3. Go to Health Overview
# 4. Click "Explain This for My Situation"
# 5. Complete the wizard
# 6. Verify summary appears
# 7. Check sidebar shows persona
```

---

## Documentation Index

| File | Purpose |
|------|---------|
| `README.md` | Project overview and quick start |
| `CHANGELOG.md` | Version history |
| `CONTRIBUTING.md` | Development guidelines |
| `CLAUDE.md` | Claude Code reference |
| `docs/ROADMAP.md` | Feature roadmap |
| `docs/SCANNING_GUIDE.md` | Nmap usage guide |
| `docs/MIGRATION_PLAN.md` | Technical architecture |
| `docs/RESOURCES_NEEDED.md` | Setup requirements |
| `docs/SESSION_NOTES.md` | Development history |
