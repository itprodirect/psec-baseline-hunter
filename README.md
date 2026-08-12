# PSEC Baseline Hunter

**Network Security for Everyone** — Understand what changed on your network, explained in plain English.

[![Next.js](https://img.shields.io/badge/Next.js-16.x-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## What Is This?

PSEC Baseline Hunter helps you answer: **"What did these network observations record, what changed, and what should I review?"**

Upload your network scans, and get:
- **Evidence-bounded summaries** with recorded presentation context
- **Prioritized review actions** — what to verify first and why
- **Change detection** — evidence-supported changes between compatible observations
- **Review prioritization** — identify observed P0/P1-classified services without treating them as proof of exposure or safety

```
┌─────────────────────────────────────────────────────────────────┐
│  Network Observation                                            │
│                                                                 │
│  Evidence: supported for this declared scope                    │
│                                                                 │
│  2 device additions supported by identity evidence              │
│  1 observed P0/P1-classified service requires review            │
│  External reachability: not established                         │
│                                                                 │
│  [View Details]  [Explain This To Me]  [Export Report]          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Features

| Feature | What It Does |
|---------|-------------|
| **Deterministic Explanations** | Record presentation context alongside server-rendered reports; profile data never changes evidence or conclusions |
| **Demo Mode** | Try the app instantly with sample data — no scan required |
| **Risk Prioritization** | P0/P1/P2 classifications identify observed services for review |
| **Change Detection** | Compare compatible observations over time within verified evidence limits |
| **One-Click Export** | Generate evidence-aware reports for review and handoff |
| **Evidence-Bounded Summaries** | Deterministic reports generated from server-recomputed evidence; no free-form provider narrative |

---

## Quick Start

### Option 1: Try Demo Mode (No Setup)

```bash
git clone https://github.com/itprodirect/psec-baseline-hunter.git
cd psec-baseline-hunter
npm install
npm run dev
```

Open http://localhost:3000 and click **"Try Demo"** — see the app with sample data instantly.

### Option 2: Scan Your Own Network

**Prerequisites:** Node.js 20+, Nmap installed

```bash
# 1. Run a scan (replace with your network range)
nmap -sV --top-ports 200 192.168.1.0/24 -oX my_scan.xml

# 2. Create ZIP structure
mkdir -p my-network/rawscans/$(date +%Y-%m-%d_%H%M)_baseline
mv my_scan.xml my-network/rawscans/*/ports_top200_open.xml
zip -r my-network.zip my-network/

# 3. Upload at http://localhost:3000
```

---

## Who Is This For?

### 👨‍👩‍👧‍👦 Families & Home Users
> "I want to know if something sketchy joined my Wi-Fi."

Review evidence-supported device additions and service findings in plain English, with collection limits shown alongside them.

### ⚖️ Attorneys & Compliance
> "I need to document what a network observation can and cannot establish."

Export evidence-bounded reports that preserve collection scope, provenance, and explicit limitations.

### 💼 Small Business Owners
> "Show me what the observations say I should review first."

Review the top evidence-bounded actions and share reports with your IT vendor.

### 🔒 Security Professionals
> "I want the raw data plus quick triage."

Full port/service details, P0/P1/P2 review classifications, identity and coverage context, and evidence-aware CSV/Markdown exports.

---

## The 3-Step Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   UPLOAD     │────▶│   ANALYZE    │────▶│   ACT        │
│              │     │              │     │              │
│ Drag & drop  │     │ Review the   │     │ Verify the   │
│ your scan    │     │ evidence &   │     │ prioritized  │
│ ZIP file     │     │ limitations  │     │ findings     │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## Deterministic Evidence Reports

The app records selected technical level, role, context, and tone in a bounded presentation note. These settings do not strengthen evidence, change supported conclusions, or introduce role-specific risk, legal, compliance, breach, or financial claims.

---

## Project Structure

```
psec-baseline-hunter/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (dashboard)/          # Main dashboard pages
│   │   │   ├── page.tsx          # Network Health Dashboard
│   │   │   ├── scorecard/        # Health Overview (single run)
│   │   │   └── diff/             # Changes view (compare runs)
│   │   └── api/                  # Backend API routes
│   ├── components/
│   │   ├── scorecard/            # Deterministic evidence reports, presentation controls
│   │   ├── layout/               # Sidebar, navigation
│   │   └── ui/                   # shadcn/ui components
│   └── lib/
│       ├── services/             # Diff engine, risk classifier, parsers
│       ├── llm/                  # Deterministic evidence report renderers
│       ├── types/                # TypeScript definitions
│       └── constants/            # Risk ports, actions mapping
├── scripts/                      # PowerShell/bash scan scripts
├── docs/                         # Documentation
└── data/                         # Local storage (gitignored)
```

---

## Risk Classification

| Priority | Ports | Why It Matters |
|----------|-------|----------------|
| **P0 Critical** | 23, 445, 3389, 5900, 135, 139, 1080 | Remote access and file-sharing services that warrant prompt review |
| **P1 Admin** | 8080, 8443, 8888, 9000, 9090 | Administrative services that warrant access-control review |
| **P2 Watch** | 22, 80, 443 | Common services — note when NEW |

---

## Configuration

### Evidence summaries

Scorecard, Diff, and executive reports are rendered deterministically after the server recomputes and validates the relevant evidence. Provider API keys do not enable free-form narratives for these DB-01 outputs.

---

## Development

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run lint      # Run linter
npm test          # Run tests
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | AI assistant context for Claude Code |
| [ROADMAP.md](docs/ROADMAP.md) | Feature roadmap |
| [SCANNING_GUIDE.md](docs/SCANNING_GUIDE.md) | How to run Nmap scans |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## Roadmap Highlights

### ✅ Completed (v0.6.0)
- Deterministic, evidence-bounded explanations with recorded presentation context
- Demo mode with sample data
- Evidence-bounded review prioritization without synthetic safety scores
- Change detection and diff view
- Port impact endpoint closed unless verified external-vantage evidence is available
- Executive summaries for leadership
- **Custom risk rules** - Per-network port classifications
- **CSV export** - Download scorecard and diff data
- **Comparison history** - Save and share scan comparisons

### 📋 Planned (Phase 6+)
- **Optional provider research** - any future provider output must remain subordinate to structured evidence support
- **S3 cloud storage** - Move from local filesystem
- Device identification (HTTP titles, MAC vendors)
- Scheduled scans + weekly digest
- Security hardening (rate limiting, input validation)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Nmap](https://nmap.org/) — The network scanner that powers our data
- [shadcn/ui](https://ui.shadcn.com/) — Beautiful UI components
- [Next.js](https://nextjs.org/) — React framework
- Provider integrations remain available for non-authoritative experimentation; evidence-sensitive summaries are deterministic.

---

**Built to help families, small businesses, and professionals understand their network security.**
