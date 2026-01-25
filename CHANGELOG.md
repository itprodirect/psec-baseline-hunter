# Changelog

All notable changes to PSEC Baseline Hunter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Run registry with deduplication (Phase 2)
- Content hashing for duplicate detection

### Changed
- Runs now stored with unique identifiers

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
     ├── core/diff.py          🔲 Planned  ──>   src/lib/services/diff-engine.ts
     │
     └── Streamlit Pages       ✅ Replaced by ──> Next.js App Router
```

---

[Unreleased]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/itprodirect/psec-baseline-hunter/releases/tag/v0.0.1
