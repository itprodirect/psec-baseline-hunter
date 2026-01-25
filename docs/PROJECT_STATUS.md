# PSEC Baseline Hunter - Project Status

**Last Updated:** 2026-01-25
**Current Branch:** `feature/phase2-run-registry`
**Phase:** Phase 1 Complete, Phase 2 In Progress

---

## Quick Status

| Metric | Value |
|--------|-------|
| **Current Phase** | Phase 2: Run Registry |
| **Last Completed** | Phase 1: Upload + Business Logic |
| **Next Milestone** | Phase 3: Scorecard Enhancement |
| **Tech Stack** | Next.js 16 + TypeScript 5 |

---

## Phase Completion Status

| Phase | Description | Status | Date |
|-------|-------------|--------|------|
| **Phase 0** | Scaffolding, CI, UI shell | ✅ Complete | 2026-01-25 |
| **Phase 1** | Upload, extraction, parsing | ✅ Complete | 2026-01-25 |
| **Phase 2** | Run registry, deduplication | 🔄 In Progress | — |
| **Phase 3** | Enhanced scorecard | 🔲 Not started | — |
| **Phase 4** | Diff, risk flags, exports | 🔲 Not started | — |
| **Phase 5** | Custom rules, history | 🔲 Not started | — |
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

### API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/upload` | POST | Upload ZIP file | ✅ Working |
| `/api/ingest` | POST | Extract and detect | ✅ Working |
| `/api/runs` | GET | List all runs | ✅ Working |
| `/api/parse` | POST | Parse Nmap XML | ✅ Working |

### Pages

| Page | Status | Features |
|------|--------|----------|
| `/upload` | ✅ Working | Dropzone, run list, extract button |
| `/scorecard` | 🔲 Stub | Placeholder only |
| `/diff` | 🔲 Stub | Placeholder with tabs |

---

## Current Architecture

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Dashboard shell
│   │   ├── upload/page.tsx         # ✅ Full implementation
│   │   ├── scorecard/page.tsx      # 🔲 Placeholder
│   │   └── diff/page.tsx           # 🔲 Placeholder with tabs
│   └── api/
│       ├── upload/route.ts         # ✅ File upload
│       ├── ingest/route.ts         # ✅ ZIP extraction
│       ├── runs/route.ts           # ✅ Run listing
│       └── parse/route.ts          # ✅ XML parsing
├── components/
│   ├── upload/
│   │   ├── dropzone.tsx            # ✅ Drag-and-drop
│   │   └── run-list.tsx            # ✅ Run display
│   ├── layout/
│   │   └── nav-sidebar.tsx         # ✅ Navigation
│   └── ui/                         # ✅ shadcn components
└── lib/
    ├── types/index.ts              # ✅ TypeScript interfaces
    ├── constants/file-patterns.ts  # ✅ Configuration
    └── services/
        ├── ingest.ts               # ✅ Run detection
        └── nmap-parser.ts          # ✅ XML parsing
```

---

## What's Next (Phase 2)

### Run Registry

The current implementation has a limitation: re-uploading the same ZIP creates duplicate runs. Phase 2 adds:

| Feature | Description |
|---------|-------------|
| **Run Manifest** | JSON file storing run metadata |
| **Content Hashing** | SHA256 hash of key files |
| **Deduplication** | Skip duplicate runs on re-upload |
| **Run UID** | Unique identifier for each run |

### Files to Create

```
src/lib/
├── services/
│   └── run-registry.ts       # Run manifest CRUD
└── utils/
    └── hash.ts               # Content hashing
```

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

### Planned

| Category | Technology | Phase |
|----------|------------|-------|
| State Management | SWR + Zustand | Phase 3 |
| Tables | TanStack Table | Phase 3 |
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

---

## Known Issues

| Issue | Severity | Status | Fix Plan |
|-------|----------|--------|----------|
| Duplicate runs on re-upload | Medium | Fixing in Phase 2 | Add run registry |
| No scorecard UI | Low | Planned Phase 3 | Build scorecard page |
| No diff comparison | Low | Planned Phase 4 | Port diff engine |
| Local storage only | Low | Planned Phase 5 | Add S3 support |

---

## Files Changed Recently

### Phase 1 (2026-01-25)

| File | Change |
|------|--------|
| `src/lib/services/ingest.ts` | Created - run detection |
| `src/lib/services/nmap-parser.ts` | Created - XML parsing |
| `src/lib/types/index.ts` | Created - TypeScript types |
| `src/app/api/*` | Created - all API routes |
| `src/components/upload/*` | Created - upload UI |
| `src/app/(dashboard)/upload/page.tsx` | Updated - full implementation |
| `docs/ROADMAP.md` | Created - feature guide |
| `docs/SCANNING_GUIDE.md` | Created - Nmap guide |

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

# Test upload flow
# 1. Open http://localhost:3000/upload
# 2. Upload a baselinekit ZIP
# 3. Click "Extract + Detect"
# 4. Verify runs appear in list
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
