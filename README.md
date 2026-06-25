# PSEC Baseline Hunter

**Network Security for Everyone** — Understand what changed on your network, explained in plain English.

[![Next.js](https://img.shields.io/badge/Next.js-16.x-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## What Is This?

PSEC Baseline Hunter helps you answer: **"Is my network safe, and what should I do about it?"**

Upload your network scans, and get:
- **Plain-English summaries** tailored to your role (executive, attorney, IT, parent)
- **Prioritized action items** — what to fix first and why
- **Change detection** — what's new since your last scan
- **Risk scoring** — understand your security posture at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│  🏠 Your Network Health                                         │
│                                                                 │
│  Risk Score: 72 (Good)                                          │
│                                                                 │
│  ✅ No critical exposures detected                              │
│  ⚠️  2 new devices joined your network                          │
│  📋 Recommended: Review unknown devices                         │
│                                                                 │
│  [View Details]  [Explain This To Me]  [Export Report]          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Features

| Feature | What It Does |
|---------|-------------|
| **Personalized Explanations** | Choose your audience (Executive, Security Pro, Attorney, Operations) and get results in language you understand |
| **Demo Mode** | Try the app instantly with sample data — no scan required |
| **Risk Prioritization** | Critical → High → Watch classifications with clear action items |
| **Change Detection** | Compare scans over time to see what's new or different |
| **One-Click Export** | Generate reports for stakeholders, IT teams, or compliance |
| **LLM-Powered Summaries** | Optional AI explanations tailored to your profession and context |

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

Get alerts when new devices appear, understand risks in plain English, and get simple fix instructions.

### ⚖️ Attorneys & Compliance
> "I need to document network exposure for a case or audit."

Export professional reports with liability framing, chain-of-custody language, and regulatory context.

### 💼 Small Business Owners
> "Just tell me what I need to do to stay safe."

See your risk score, get the top 3 actions, and share reports with your IT vendor.

### 🔒 Security Professionals
> "I want the raw data plus quick triage."

Full port/service details, P0/P1/P2 classifications, and export to CHANGES.md / WATCHLIST.md.

---

## The 3-Step Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   UPLOAD     │────▶│   ANALYZE    │────▶│   ACT        │
│              │     │              │     │              │
│ Drag & drop  │     │ View health  │     │ Fix issues   │
│ your scan    │     │ summary &    │     │ with guided  │
│ ZIP file     │     │ risk score   │     │ checklist    │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## Personalized Explanations

The app adapts its language based on who you are:

| Persona | Language Style |
|---------|---------------|
| **Executive** | Risk trends, business impact, board-ready summaries |
| **Attorney** | Liability exposure, documentation trail, privilege concerns |
| **Security** | Ports, services, CVEs, technical remediation |
| **Operations** | Change tickets, uptime risk, rollback steps |
| **Parent** | "Your kid's iPad" vs "Unknown device on kids' Wi-Fi" |

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
│   │   ├── scorecard/            # Personalized summary, modals
│   │   ├── layout/               # Sidebar, navigation
│   │   └── ui/                   # shadcn/ui components
│   └── lib/
│       ├── services/             # Diff engine, risk classifier, parsers
│       ├── llm/                  # LLM prompt builders
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
| **P0 Critical** | 23, 445, 3389, 5900, 135, 139, 1080 | Remote access & file sharing — fix immediately |
| **P1 Admin** | 8080, 8443, 8888, 9000, 9090 | Admin panels — often unprotected |
| **P2 Watch** | 22, 80, 443 | Common services — note when NEW |

---

## Configuration

### Optional: Enable AI Summaries

Add to `.env.local`:

```bash
# Anthropic is used first when configured.
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# OpenAI is used only when Anthropic is not configured.
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o

# Optional LLM safety controls.
LLM_REQUEST_TIMEOUT_MS=15000
LLM_MAX_TOKENS=2000
```

The model variables are optional; the values shown above match the current runtime defaults. Without API keys, or when route-level LLM calls fail, the app uses intelligent rule-based summaries.

Current implementation notes:
- OpenAI uses a direct Chat Completions API `fetch`, not the Responses API or the OpenAI SDK.
- Anthropic uses a direct Messages API `fetch`, not the Anthropic SDK.
- Future model-default or API modernization should be handled in a separate focused issue/PR.

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
- Persona-based explanations with LLM integration
- Demo mode with sample data
- Risk scoring and prioritization
- Change detection and diff view
- Real-world impact cards with breach examples
- Executive summaries for leadership
- **Custom risk rules** - Per-network port classifications
- **CSV export** - Download scorecard and diff data
- **Comparison history** - Save and share scan comparisons

### 📋 Planned (Phase 6+)
- **LLM observability** - Wandb integration for tracking API calls, costs, performance
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
- [Anthropic](https://anthropic.com/) — Claude AI for summaries

---

**Built to help families, small businesses, and professionals understand their network security.**
