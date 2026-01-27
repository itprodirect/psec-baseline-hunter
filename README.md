# PSEC Baseline Hunter

**Network Security Baseline Comparison Tool**

Detect unauthorized changes on your network by comparing scan results over time. Upload Nmap scans, identify new hosts and open ports, and get prioritized security alerts.

[![Next.js](https://img.shields.io/badge/Next.js-16.x-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## What Does This Tool Do?

PSEC Baseline Hunter answers the critical security question: **"What changed on my network since the last scan?"**

```
Week 1: Baseline Scan          Week 2: New Scan              Result
┌─────────────────────┐        ┌─────────────────────┐       ┌─────────────────────┐
│ 50 hosts            │        │ 53 hosts            │       │ +3 new hosts        │
│ 127 open ports      │  -->   │ 134 open ports      │  -->  │ +7 new ports        │
│ No RDP exposed      │        │ 1 host with RDP     │       │ P0 ALERT: RDP open! │
└─────────────────────┘        └─────────────────────┘       └─────────────────────┘
```

### Key Features

| Feature | Description |
|---------|-------------|
| **Drag & Drop Upload** | Upload baselinekit ZIP files with ease |
| **Automatic Detection** | Finds scan runs and parses Nmap XML |
| **Run Comparison** | Compare any two scans to see changes |
| **Risk Prioritization** | P0/P1/P2 alerts for dangerous ports |
| **AI-Powered Insights** | LLM-generated security explanations tailored to your role |
| **Real-World Impact Cards** | See actual breach examples and financial costs for exposed ports |
| **Executive Summaries** | Business-focused reports for leadership |
| **Export Reports** | Download CHANGES.md and WATCHLIST.md |

---

## Quick Start

### Prerequisites

- Node.js 20+ (`node --version`)
- npm 10+ (`npm --version`)

### Installation

```bash
# Clone the repository
git clone https://github.com/itprodirect/psec-baseline-hunter.git
cd psec-baseline-hunter

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Create Your First Scan

```bash
# Scan your network with Nmap (replace with your network range)
nmap -sV --top-ports 200 192.168.1.0/24 -oX ports_scan.xml

# Create the expected folder structure
mkdir -p my-network/rawscans/$(date +%Y-%m-%d_%H%M)_baseline
mv ports_scan.xml my-network/rawscans/*/

# Create ZIP and upload
zip -r my-network-scan.zip my-network/
```

Upload the ZIP file at [http://localhost:3000/upload](http://localhost:3000/upload)

---

## Project Structure

```
psec-baseline-hunter/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── (dashboard)/          # Dashboard pages
│   │   │   ├── upload/           # File upload & run detection
│   │   │   ├── scorecard/        # Single-run analysis (Health Overview)
│   │   │   └── diff/             # Run comparison (Changes)
│   │   └── api/                  # API routes
│   │       ├── upload/           # File upload endpoint
│   │       ├── ingest/           # ZIP extraction
│   │       ├── runs/             # Run listing
│   │       ├── parse/            # XML parsing
│   │       ├── diff/             # Diff computation
│   │       ├── scorecard/        # Scorecard data
│   │       └── llm/              # LLM-powered features
│   │           ├── scorecard-summary/    # Personalized summaries
│   │           ├── diff-summary/         # Diff explanations
│   │           ├── port-impact/          # Breach examples
│   │           └── executive-summary/    # Executive reports
│   ├── components/               # React components
│   │   ├── upload/               # Upload-related components
│   │   ├── scorecard/            # Scorecard components
│   │   │   ├── PersonalizedSummaryCard.tsx
│   │   │   ├── PortImpactCard.tsx
│   │   │   └── ExecutiveSummaryCard.tsx
│   │   ├── diff/                 # Diff components
│   │   ├── layout/               # Layout components
│   │   └── ui/                   # shadcn/ui components
│   └── lib/                      # Business logic
│       ├── services/             # Core services
│       │   ├── ingest.ts         # Run detection
│       │   ├── nmap-parser.ts    # XML parsing
│       │   ├── risk-classifier.ts # Risk classification
│       │   └── impact-cache.ts   # Port impact caching
│       ├── llm/                  # LLM integration
│       │   ├── provider.ts       # Anthropic/OpenAI abstraction
│       │   ├── prompt-scorecard.ts
│       │   ├── prompt-diff.ts
│       │   ├── prompt-impact.ts
│       │   └── prompt-executive.ts
│       ├── context/              # React contexts
│       │   ├── demo-context.tsx
│       │   └── persona-context.tsx
│       ├── types/                # TypeScript types
│       └── constants/            # Configuration
├── docs/                         # Documentation
│   ├── ROADMAP.md               # Feature roadmap
│   ├── SCANNING_GUIDE.md        # Nmap scanning guide
│   ├── MIGRATION_PLAN.md        # Technical migration plan
│   └── PROJECT_STATUS.md        # Current status
├── data/                         # Local data storage (gitignored)
│   ├── uploads/                  # Uploaded ZIP files
│   └── extracted/                # Extracted contents
└── streamlit_app/                # Legacy Python app (deprecated)
```

---

## How It Works

### 1. Upload Phase
You provide a ZIP file containing Nmap scan results organized in a specific structure:

```
network-name/
└── rawscans/
    └── 2025-01-25_1430_baselinekit_v0/
        ├── ports_top200_open.xml      # Required: Port scan data
        ├── hosts_up.txt               # Optional: Live hosts list
        └── discovery_ping_sweep.xml   # Optional: Discovery scan
```

### 2. Detection Phase
The tool automatically:
- Extracts the ZIP file
- Finds run folders matching `YYYY-MM-DD_HHMM_*` pattern
- Identifies key files (ports, discovery, hosts)
- Parses Nmap XML to extract host/port/service data

### 3. Analysis Phase
For each run, you can:
- View **Scorecard**: Top ports, host counts, service inventory
- Compare **Diff**: Changes between two scans
- Get **Alerts**: P0/P1/P2 risk flags for dangerous ports

### Risk Classification

| Priority | Ports | Description |
|----------|-------|-------------|
| **P0 (Critical)** | 23, 445, 3389, 5900, 135, 139, 1080 | Remote access, file sharing - rarely safe to expose |
| **P1 (Admin)** | 8080, 8443, 8888 | Admin panels, dev servers - often unprotected |
| **P2 (Watch)** | 22, 80, 443 | Common services - note when NEW |

---

## AI-Powered Features

PSEC Baseline Hunter includes optional LLM integration for non-technical security explanations:

### Personalized Summaries
Get plain-English explanations of scan results tailored to your:
- **Technical level** (non-technical to security professional)
- **Profession** (healthcare, small business, IT professional, etc.)
- **Context** (HIPAA, PCI-DSS, handles client data, etc.)
- **Tone preference** (direct, reassuring, technical)

### Real-World Impact Cards
Click "Show Real-World Impact" on any P0/P1 risk port to see:
- **Attack scenarios** - How attackers exploit this service
- **Real breach examples** - Actual incidents with costs (e.g., "WannaCry - $4B damages")
- **Financial impact** - Average breach cost, recovery time, regulatory fines
- **Quick fixes** - Immediate actions to reduce risk

Impact data is **cached for 30 days** to reduce API costs (~80% savings).

### Executive Summaries
Generate business-focused security reports for leadership with:
- **Plain-English overview** - No jargon
- **Top 3 business risks** - What it is, why it matters, recommended action
- **Financial impact estimates** - Breach costs, fines, recovery time
- **Action plan** - Immediate, short-term, and ongoing steps
- **Questions for leadership** - Business decisions needed

### LLM Configuration

```bash
# Optional: Add to .env.local for LLM features
ANTHROPIC_API_KEY=sk-ant-...      # Preferred
# OR
OPENAI_API_KEY=sk-...             # Fallback

# Without API keys, the app uses rule-based summaries
```

**Supported LLMs:**
- Anthropic Claude (claude-3-5-sonnet-20241022)
- OpenAI GPT-4o

**Cost estimate:** ~$0.02-0.03 per session with caching

---

## Available Commands

```bash
# Development
npm run dev           # Start dev server with hot reload
npm run build         # Production build
npm run start         # Start production server

# Quality
npm run lint          # Run ESLint
npx tsc --noEmit      # Type check without emitting
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| [ROADMAP.md](docs/ROADMAP.md) | Feature roadmap and future plans |
| [SCANNING_GUIDE.md](docs/SCANNING_GUIDE.md) | How to create scan files with Nmap |
| [MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md) | Technical architecture details |
| [PROJECT_STATUS.md](docs/PROJECT_STATUS.md) | Current implementation status |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## Development Status

### Completed ✅
- [x] **Phase 0:** Next.js scaffolding with shadcn/ui
- [x] **Phase 1:** Upload, extraction, run detection, XML parsing
- [x] **Phase 2:** Run registry, demo mode, scorecard
- [x] **Phase 3:** Personalized summaries with LLM integration
- [x] **Phase 4:** Diff comparison with real data
- [x] **Phase 5.5:** Real-World Impact Cards + Executive Summaries

### Next Up 🚧
- [ ] **Phase 5:** Custom risk rules, comparison history, CSV export
- [ ] **Phase 6:** Production hardening, S3 storage, rate limiting

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Components | shadcn/ui (Radix UI + Tailwind) |
| XML Parsing | fast-xml-parser |
| ZIP Handling | adm-zip |
| LLM (Optional) | Anthropic Claude / OpenAI GPT-4o |
| State Management | React Context + localStorage |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Nmap](https://nmap.org/) - The network scanning tool that provides our input data
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Next.js](https://nextjs.org/) - The React framework

---

*Built for learning network security with free tools.*
