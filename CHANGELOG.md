# Changelog

All notable changes to PSEC Baseline Hunter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Phase 5: Custom risk rules (per-network port classifications)
- Comparison history with shareable URLs
- CSV export alongside markdown
- S3 cloud storage integration

---

## [0.5.0] - 2026-01-27

### Added - AI-Powered Insights
- **Real-World Impact Cards**: Expandable breach examples on P0/P1 risk ports
  - Attack scenarios explaining how services get exploited
  - Real breach incidents with financial costs (WannaCry, NotPetya, etc.)
  - Financial impact grid (avg breach cost, recovery time, fines)
  - Quick fix recommendations
  - 30-day localStorage caching for cost savings (~80% reduction)
- **Executive Summary Generator**: Business-focused security reports for leadership
  - Profession-aware prompts (healthcare, small business, IT, etc.)
  - Regulatory context integration (HIPAA, PCI-DSS)
  - Top 3 business risks with financial impact
  - Actionable recommendations (immediate, short-term, ongoing)
  - Markdown export with copy/download
- **New API Routes**:
  - `POST /api/llm/port-impact` - Generate breach examples for ports
  - `POST /api/llm/executive-summary` - Generate executive reports
- **New Components**:
  - `PortImpactCard.tsx` - Expandable impact cards on scorecard
  - `ExecutiveSummaryCard.tsx` - Summary generator UI
- **New Services**:
  - `impact-cache.ts` - Client-side caching with 30-day TTL
  - `prompt-impact.ts` - Port impact prompts with breach database
  - `prompt-executive.ts` - Business-focused executive prompts

### Fixed
- TypeScript compilation errors with UserProfile type imports
- ESLint `@typescript-eslint/no-explicit-any` violations
- Module resolution for re-exported types

### Technical
- Cost optimization: ~$0.02-0.03 per typical session with caching
- Rule-based fallbacks for all LLM features (works without API keys)
- Privacy-first design (respects profile settings)

---

## [0.4.0] - 2026-01-27

### Added - Real Data Diff
- **Run Comparison**: Select baseline + current runs from dropdowns
- **Diff Engine**: Computes host/port differences from actual parsed data
  - New/removed hosts from real scans
  - Opened/closed ports from real scans
  - Risk scoring (0-100 scale with labels: Excellent, Good, Fair, Poor)
- **API Route**: `POST /api/diff` - Compare two runs
- **Export**: CHANGES.md and WATCHLIST.md with real data
- **UI**: Run selector dropdowns on Changes page

### Changed
- Removed "demo mode only" limitation from comparison
- Changes page now works with real parsed scan data

---

## [0.3.0] - 2026-01-26

### Added - Personalized Summaries
- **LLM Integration**: Anthropic Claude / OpenAI with automatic fallback
- **User Profile System**: Capture technical level, profession, context, tone
  - Technical levels: non-technical, some-technical, technical, security-professional
  - Professions: healthcare, small business, IT staff, attorney, etc.
  - Context factors: HIPAA, PCI-DSS, handles client data, etc.
  - Tone preferences: reassuring, direct, urgent, educational
- **Personalized Summaries**: Plain-English explanations tailored to user
  - On Health Overview page (scorecard analysis)
  - On Changes page (diff explanation)
- **Privacy-First Design**: IP redaction by default, opt-in to include details
- **Rule-Based Fallback**: Works without LLM API keys configured
- **Persona System**: Shared React Context with localStorage persistence
- **API Routes**:
  - `POST /api/llm/scorecard-summary` - Generate personalized summaries
  - `POST /api/llm/diff-summary` - Generate diff explanations
- **New Components**:
  - `PersonalizedSummaryCard.tsx` - "Explain This" button and display
  - `PersonalizedSummaryModal.tsx` - Profile capture wizard
  - `MarkdownViewer.tsx` - Markdown display with copy/download
  - `PersonalizedDiffCard.tsx` - Diff explanations
  - `persona-toggle.tsx` - Persona viewer in sidebar
- **New Services**:
  - `llm/provider.ts` - LLM abstraction (Anthropic/OpenAI)
  - `llm/prompt-scorecard.ts` - Scorecard prompts + fallback
  - `llm/prompt-diff.ts` - Diff prompts + fallback
  - `context/persona-context.tsx` - User profile state management

### Changed
- Page rename: "Scorecard" → "Health Overview"
- Page rename: "Diff" → "Changes"
- Dashboard layout updated with PersonaProvider

### Technical
- Added dependencies: `@anthropic-ai/sdk`, `openai`
- LLM provider abstraction supports multiple AI services
- Token estimation: ~1700-2100 tokens per summary (~$0.006 with Claude)

---

## [0.2.0] - 2026-01-25

### Added - Run Registry & Demo Mode
- **Run Registry**: Persistent run metadata with deduplication
  - Unique run IDs (8-character hash)
  - Content hashing for duplicate detection
  - Manifest storage at `data/runs/{runUid}/manifest.json`
  - Index at `data/runs/index.json`
- **Demo Mode**: Preloaded sample data for testing
  - Sample network: "acme-corp"
  - Baseline and current scans
  - Scorecard and diff data
  - Toggle button on upload page
- **Scorecard Page**: Single-run analysis
  - Real parsed data display (not just demo)
  - Metrics: total hosts, open ports, services, risk ports
  - Risk port details with P0/P1/P2 classification
  - Top ports table
- **Risk Classification**:
  - P0 (Critical): 23, 445, 3389, 5900, 135, 139, 1080
  - P1 (Admin/Dev): 8080, 8443, 8888
  - P2 (Watch): 22, 80, 443
- **API Routes**:
  - `GET /api/demo` - Get demo data
  - `GET /api/scorecard/[runUid]` - Get scorecard for specific run
- **Services**:
  - `run-registry.ts` - Run manifest CRUD operations
  - `risk-classifier.ts` - Port risk classification logic

---

## [0.2.0] - 2026-01-25 (Phase 1)

### Added
- **Upload System**: Drag-and-drop ZIP file upload with react-dropzone
- **ZIP Extraction**: Automatic extraction to local storage using adm-zip
- **Run Detection**: Automatic detection of scan runs in `YYYY-MM-DD_HHMM_*` folders
- **Nmap XML Parsing**: Full parsing of Nmap XML with fast-xml-parser
- **Top Ports Aggregation**: Summary of most common open ports
- **API Routes**:
  - `POST /api/upload` - File upload with validation
  - `POST /api/ingest` - ZIP extraction and run detection
  - `GET /api/runs` - List all detected runs
  - `POST /api/parse` - Parse Nmap XML files
- **UI Components**:
  - Dropzone component with progress and status
  - Run list with key file badges
  - Upload page with full workflow
- **Documentation**:
  - `docs/ROADMAP.md` - Feature roadmap and security guide
  - `docs/SCANNING_GUIDE.md` - Practical Nmap scanning instructions

### Changed
- Moved legacy Streamlit app to `streamlit_app/` directory
- Updated `CLAUDE.md` with current architecture
- Updated TypeScript target to ES2020

### Technical
- Added dependencies: `fast-xml-parser`, `adm-zip`, `react-dropzone`
- Added type definitions: `@types/adm-zip`
- TypeScript types: `RunMeta`, `PortFinding`, `TopPort`

---

## [0.2.0] - 2026-01-25

### Added
- **Upload System**: Drag-and-drop ZIP file upload with react-dropzone
- **ZIP Extraction**: Automatic extraction to local storage using adm-zip
- **Run Detection**: Automatic detection of scan runs in `YYYY-MM-DD_HHMM_*` folders
- **Nmap XML Parsing**: Full parsing of Nmap XML with fast-xml-parser
- **Top Ports Aggregation**: Summary of most common open ports
- **API Routes**:
  - `POST /api/upload` - File upload with validation
  - `POST /api/ingest` - ZIP extraction and run detection
  - `GET /api/runs` - List all detected runs
  - `POST /api/parse` - Parse Nmap XML files
- **UI Components**:
  - Dropzone component with progress and status
  - Run list with key file badges
  - Upload page with full workflow
- **Documentation**:
  - `docs/ROADMAP.md` - Feature roadmap and security guide
  - `docs/SCANNING_GUIDE.md` - Practical Nmap scanning instructions

### Changed
- Moved legacy Streamlit app to `streamlit_app/` directory
- Updated `CLAUDE.md` with current architecture
- Updated TypeScript target to ES2020

### Technical
- Added dependencies: `fast-xml-parser`, `adm-zip`, `react-dropzone`
- Added type definitions: `@types/adm-zip`
- TypeScript types: `RunMeta`, `PortFinding`, `TopPort`

---

## [0.1.0] - 2026-01-25

### Added
- **Next.js Scaffolding**: App Router with TypeScript
- **Dashboard Layout**: Three-page structure (Upload, Scorecard, Diff)
- **UI Framework**: shadcn/ui with Tailwind CSS 4
- **Navigation**: Sidebar with page links
- **shadcn Components**: Button, Card, Tabs, Badge, Separator, Sheet
- **CI Pipeline**: GitHub Actions for lint and type-check
- **Documentation**:
  - `docs/MIGRATION_PLAN.md` - Technical migration plan
  - `docs/PROJECT_STATUS.md` - Implementation status
  - `docs/RESOURCES_NEEDED.md` - Setup requirements
  - `docs/SESSION_NOTES.md` - Development session notes

### Technical
- Next.js 16.1.4 with App Router
- TypeScript 5 with strict mode
- Tailwind CSS 4 with tw-animate-css
- ESLint 9 with Next.js config

---

## [0.0.1] - 2025-12-31 (Legacy)

### Original Streamlit Implementation
- Python-based Streamlit application
- Nmap XML parsing with pandas
- Run comparison with set operations
- Risk flagging (P0/P1/P2)
- Markdown export (CHANGES.md, WATCHLIST.md)

### Files
- `core/ingest.py` - Upload and extraction
- `core/nmap_parse.py` - XML parsing
- `core/diff.py` - Comparison engine
- `app/Home.py` - Main page
- `app/pages/2_Scorecard.py` - Analysis page
- `app/pages/3_Diff.py` - Comparison page

---

## Version History Summary

| Version | Date | Milestone |
|---------|------|-----------|
| **0.5.0** | 2026-01-27 | **Phase 5.5: AI-Powered Insights** |
| 0.4.0 | 2026-01-27 | Phase 4: Real Data Diff |
| 0.3.0 | 2026-01-26 | Phase 3: Personalized Summaries |
| 0.2.0 | 2026-01-25 | Phase 2: Run Registry + Demo Mode |
| 0.2.0 | 2026-01-25 | Phase 1: Upload + Business Logic |
| 0.1.0 | 2026-01-25 | Phase 0: Next.js Scaffolding |
| 0.0.1 | 2025-12-31 | Original Streamlit App |

---

## Migration Progress

```
Streamlit (Python)  ──────────────────────────────>  Next.js (TypeScript)
     │                                                      │
     ├── core/ingest.py        ✅ Ported to ──>  src/lib/services/ingest.ts
     ├── core/nmap_parse.py    ✅ Ported to ──>  src/lib/services/nmap-parser.ts
     ├── core/diff.py          ✅ Ported to ──>  src/lib/services/diff-engine.ts
     │
     ├── LLM Features          ✅ Added    ──>   src/lib/llm/* (NEW)
     │
     └── Streamlit Pages       ✅ Replaced by ──> Next.js App Router
```

**Migration Complete!** All core Python functionality has been successfully ported to TypeScript with Next.js, plus new AI-powered features.

---

[Unreleased]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/itprodirect/psec-baseline-hunter/releases/tag/v0.0.1
