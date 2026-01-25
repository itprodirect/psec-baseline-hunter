# PSEC Baseline Hunter - Project Status

**Last Updated:** 2026-01-25
**Current Branch:** `feature/nextjs-migration`
**Phase:** 0 Complete, Phase 1 Ready to Start

---

## Repository Overview

| Repo | Location | Purpose |
|------|----------|---------|
| **psec-baseline-hunter** | `C:\Users\user\Desktop\psec-baseline-hunter` | Main repo - Streamlit → Next.js migration |
| **psec-nextjs** | `C:\Users\user\Desktop\psec-nextjs` | Secondary Next.js workspace (referenced in CLAUDE.md) |

---

## Current State

### Branch Structure

```
main                          # Original Streamlit app (stable)
└── feature/nextjs-migration  # Next.js migration (active development)
```

### Commits on `feature/nextjs-migration`

| Commit | Message | Status |
|--------|---------|--------|
| `70f38f1` | feat: add Next.js scaffolding with shadcn/ui dashboard (Phase 0) | ✅ Complete |

### What Exists Now

#### Legacy Python/Streamlit (still in repo, will be removed later)
```
app/                    # Streamlit pages (Home.py, pages/2_Scorecard.py, pages/3_Diff.py)
core/                   # Business logic (ingest.py, nmap_parse.py, diff.py)
.venv/                  # Python virtual environment
requirements.txt        # Python dependencies
```

#### New Next.js Structure (Phase 0 complete)
```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Dashboard shell with nav sidebar
│   │   ├── upload/page.tsx     # Upload page stub
│   │   ├── scorecard/page.tsx  # Scorecard page stub
│   │   └── diff/page.tsx       # Diff page stub (with tabs)
│   ├── layout.tsx              # Root layout with metadata
│   ├── page.tsx                # Redirects to /upload
│   └── globals.css             # Tailwind + shadcn styles
├── components/
│   ├── layout/
│   │   └── nav-sidebar.tsx     # Navigation sidebar component
│   └── ui/                     # shadcn/ui components
│       ├── button.tsx, card.tsx, tabs.tsx, badge.tsx, separator.tsx, sheet.tsx
└── lib/
    └── utils.ts                # cn() utility for class merging
```

---

## Technology Stack

### Current (Next.js)

| Category | Technology | Version |
|----------|------------|---------|
| Framework | Next.js (App Router) | 16.1.4 |
| Language | TypeScript | ^5 |
| Runtime | Node.js | 22.14.0 |
| Styling | Tailwind CSS | ^4 |
| Components | shadcn/ui | Latest |
| State (planned) | SWR + Zustand | — |
| Hosting | Vercel | — |
| Storage | AWS S3 | — |

### Legacy (Streamlit)

| Category | Technology |
|----------|------------|
| Framework | Streamlit 1.52.2 |
| Language | Python 3.x |
| Data | Pandas 2.3.3 |
| XML Parsing | lxml 6.0.2 |

---

## Phase Completion Status

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 0** | Scaffolding, CI, UI shell | ✅ Complete |
| **Phase 1** | Upload, validate, store, show status | 🔲 Not started |
| **Phase 2** | Run detection, registry, dedupe | 🔲 Not started |
| **Phase 3** | Parse Nmap XML, scorecard | 🔲 Not started |
| **Phase 4** | Diff, risk flags, exports | 🔲 Not started |
| **Phase 5** | Configs, improved reporting | 🔲 Not started |
| **Phase 6** | Hardening (rate limits, audit logs) | 🔲 Not started |

---

## Key Decisions Made

1. **Full TypeScript rewrite** (not Python worker) - simpler deployment, single codebase
2. **No authentication needed** - internal tool
3. **AWS S3 for storage** - user has AWS account ready
4. **All three pages** in MVP - full feature parity with Streamlit
5. **shadcn/ui** for components - modern, accessible, customizable
6. **SWR** for server state, **Zustand** for client state

---

## Known Issues

1. **Workspace root warning** in Next.js build - caused by multiple package-lock.json files (user home + project). Harmless but can be silenced in next.config.ts
2. **Legacy Python files** still in repo - will be removed after migration complete
3. **ESLint Babel warnings** - eslint scans .venv folder; config updated to ignore it

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
```

---

## Files to Reference

| File | Purpose |
|------|---------|
| `docs/MIGRATION_PLAN.md` | Full 6-phase migration plan |
| `docs/RESOURCES_NEEDED.md` | AWS setup, dependencies, tools needed |
| `docs/SESSION_NOTES.md` | Detailed session history |
| `CLAUDE.md` | Claude Code onboarding (original) |
| `.env.example` | Environment variables template |
