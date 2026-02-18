# Changelog

All notable changes to PSEC Baseline Hunter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Refactored `scorecard` and `diff` pages into reusable components to reduce page complexity and improve UX consistency.
- Updated generated Next.js type reference path for current framework output.

## [0.6.0] - 2026-01-27

### Added
- **Custom Risk Rules** - Create per-network or global port classification overrides
  - Override default risk levels (P0/P1/P2) for specific ports
  - Whitelist ports to exclude from risk reports
  - Network-specific and global rule support
  - Rule priority: network-specific → global → default
  - Full CRUD UI at `/rules` page
  - Quick rule creation from scorecard risk ports

- **CSV Export** - Download scan data for Excel/Google Sheets
  - Scorecard export (summary metrics, risk ports, top ports)
  - Diff export (all changes + watchlist only options)
  - Multi-section CSV format with headers
  - Excel-compatible escaping
  - Smart filenames: `{network}_{date}_{type}.csv`

- **Comparison History** - Save and share scan comparisons
  - Save diff comparisons with unique 8-character IDs
  - Shareable URLs (`/diff/ABC12345`)
  - Risk scoring (0-100 scale) with color-coded labels
  - Search/filter by network or notes
  - Delete saved comparisons
  - Statistics dashboard
  - Copy-to-clipboard for sharing

- **UI Components** - New shadcn/ui components
  - Alert component for messages
  - Input component for forms
  - Label component for form labels
  - Select component for dropdowns
  - Textarea component for multi-line input
  - ExportCSVButton reusable component

### Changed
- Updated version to v0.6.0 in sidebar
- Risk classifier now uses custom rules when classifying ports
- Improved navigation with "History" link in sidebar

### Fixed
- ESLint errors (unescaped quotes, unused imports)
- TypeScript compilation errors (TopPort property names, API return types)
- Removed unused imports across multiple files

## [0.5.0] - 2026-01-26

### Added
- **Real-World Impact Cards** - Breach examples for risky ports
  - Attack scenarios and exploitation methods
  - Real breach examples with financial costs (WannaCry, NotPetya, etc.)
  - Financial impact estimates (avg breach cost, recovery time, fines)
  - Quick fixes and remediation steps
  - 30-day localStorage caching to reduce API costs

- **Executive Summaries** - Business-focused security reports
  - Plain-English overview for non-technical leadership
  - Top 3 business risks with recommended actions
  - Financial impact estimates
  - Action plan (immediate, short-term, ongoing)
  - Questions for leadership decision-making
  - Profession-aware and regulatory context (HIPAA/PCI-DSS)
  - Markdown export with copy/download

### Changed
- Page renames for clarity:
  - "Upload" → "Start Scan Review"
  - "Scorecard" → "Health Overview"
  - "Diff" → "Changes"

## [0.4.0] - 2026-01-25

### Added
- **Real Data Diff** - Compare actual scan runs
  - Run selector UI with baseline + current dropdowns
  - API integration with `/api/diff` endpoint
  - Diff computation from parsed Nmap XML data
  - Host delta (new/removed hosts)
  - Port delta (opened/closed ports)
  - Risk scoring (0-100 scale with labels)
  - Export CHANGES.md and WATCHLIST.md with real data

## [0.3.0] - 2026-01-24

### Added
- **Personalized Summaries** - LLM-powered explanations
  - LLM integration (Anthropic Claude / OpenAI with automatic fallback)
  - User profile capture (technical level, profession, context, tone)
  - Privacy-first design (IP redaction by default, opt-in to include)
  - Rule-based fallback when no API key configured
  - Personalized summaries on Health Overview + Changes pages
  - Persona system with shared React Context
  - LocalStorage persistence for user preferences

## [0.2.0] - 2026-01-23

### Added
- **Run Registry** - Persistent run tracking
  - Run manifest creation and storage
  - Run listing API
  - Demo mode with preloaded sample data

- **Scorecard Page** - Single-run analysis
  - Risk classification display (P0/P1/P2)
  - Top ports table
  - Risk ports detail
  - Summary metrics

## [0.1.0] - 2026-01-22

### Added
- **Initial Release** - Next.js migration from Streamlit
  - Next.js 16 with App Router
  - TypeScript 5
  - Tailwind CSS 4
  - shadcn/ui components
  - ZIP upload and extraction
  - Nmap XML parsing
  - Run detection
  - Basic diff computation

---

## Version History

- **v0.6.0** - Custom Rules & History (Current)
- **v0.5.0** - AI-Powered Insights
- **v0.4.0** - Real Data Diff
- **v0.3.0** - Personalized Summaries
- **v0.2.0** - Run Registry & Demo Mode
- **v0.1.0** - Initial Next.js Release

[Unreleased]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/itprodirect/psec-baseline-hunter/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/itprodirect/psec-baseline-hunter/releases/tag/v0.1.0
