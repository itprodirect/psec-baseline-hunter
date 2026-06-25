# CLAUDE.md — AI Assistant Context

> This file provides context for Claude Code and other AI assistants working on this project.

---

## Project Overview

**PSEC Baseline Hunter** is a network security tool that helps non-technical users understand their network's security posture. Users upload Nmap scans, and the app provides plain-English explanations tailored to their role (executive, attorney, IT, parent).

**Core value proposition:** "What changed on my network, and what should I do about it?"

---

## Tech Stack

| Layer        | Technology                                   |
| ------------ | -------------------------------------------- |
| Framework    | Next.js 16 (App Router)                      |
| Language     | TypeScript 5                                 |
| Styling      | Tailwind CSS 4                               |
| Components   | shadcn/ui                                    |
| XML Parsing  | fast-xml-parser                              |
| ZIP Handling | adm-zip                                      |
| State        | React Context (persona), React state (local) |
| LLM          | Anthropic Claude / OpenAI (optional)         |

---

## Key Directories

```
src/
├── app/
│   ├── (dashboard)/           # Main app pages
│   │   ├── page.tsx           # Network Health Dashboard (main)
│   │   ├── scorecard/         # Health Overview (single run)
│   │   └── diff/              # Changes view (compare runs)
│   └── api/                   # API routes
│       ├── upload/            # ZIP upload
│       ├── ingest/            # ZIP extraction
│       ├── parse/             # Nmap XML parsing
│       ├── runs/              # Run listing
│       ├── diff/              # Diff calculation
│       ├── scorecard/         # Scorecard data
│       └── llm/               # LLM summary generation
├── components/
│   ├── scorecard/             # PersonalizedSummaryCard, modals
│   ├── layout/                # Sidebar, navigation
│   ├── upload/                # Upload dropzone
│   └── ui/                    # shadcn/ui primitives
├── lib/
│   ├── services/              # Core business logic
│   │   ├── diff-engine.ts     # Scan comparison
│   │   ├── risk-classifier.ts # P0/P1/P2 classification
│   │   ├── nmap-parser.ts     # XML parsing
│   │   └── ingest.ts          # Run detection
│   ├── llm/                   # LLM integration
│   │   ├── provider.ts        # Provider abstraction
│   │   └── prompt-scorecard.ts # Prompt builders
│   ├── types/                 # TypeScript definitions
│   │   └── userProfile.ts     # Persona types
│   ├── constants/             # Configuration
│   │   └── risk-ports.ts      # Port classifications
│   └── context/               # React contexts
│       └── demo-context.tsx   # Demo mode state
├── scripts/                   # PowerShell/bash scan scripts
└── data/                      # Local storage (gitignored)
```

---

## Current State (January 2026)

### ✅ Working Features

- Upload ZIP → extract → detect runs → parse Nmap XML
- Scorecard with risk classification (P0/P1/P2)
- Personalized Summary Card (LLM + rule-based fallback)
- Persona modal (technical level, profession, context)
- Demo mode with sample data
- Diff view for comparing scans
- Quick Overview panel
- **CSV Export** - Scorecard and diff data for Excel/Sheets
- **Custom Risk Rules** - Override default port classifications per network
- **Comparison History** - Save and share scan comparisons with unique URLs
- **Real-World Impact Cards** - Breach examples with financial costs
- **Executive Summaries** - Business-focused reports for leadership
- **Traffic Visualizer (V0)** - PCAP/PCAPNG upload → animated "network city" at `/packet-highway` (metadata-only parsing, in-memory, rule-based text; see `docs/TRAFFIC_VISUALIZER.md`)

### 📋 Next Priorities (Phase 5/6)

1. **LLM Observability** - Integrate wandb for tracking API calls, costs, performance
2. **S3 Cloud Storage** - Move from local filesystem to cloud storage
3. **Scheduled Scans** - Automated scan execution and weekly digests
4. **Security Hardening** - Rate limiting, input validation, zip-slip protection
5. **Device Identification** - Parse HTTP titles and MAC vendors for device names

---

## Key Patterns

### Risk Classification

```typescript
// P0 = Critical, P1 = Admin, P2 = Watch
const CRITICAL_PORTS = [23, 445, 3389, 5900, 135, 139, 1080];
const ADMIN_PORTS = [8080, 8443, 8888, 9000, 9090];
const WATCH_PORTS = [22, 80, 443];
```

### Persona System

```typescript
interface UserProfile {
  technicalLevel: "non_technical" | "some_technical" | "technical";
  professionOrRole: string;
  context: string[]; // works_from_home, young_children_in_home, etc.
  audience: "self" | "spouse_family" | "IT_vendor" | "executive_summary";
  tone: "concise" | "normal" | "detailed";
  includeSensitiveDetails: boolean;
}
```

### LLM Provider Behavior

Runtime provider behavior is centralized in `src/lib/llm/provider.ts`:

```typescript
// Provider selection order:
1. ANTHROPIC_API_KEY -> Anthropic Messages API
2. OPENAI_API_KEY -> OpenAI Chat Completions API
3. Neither -> rule-based summaries
```

Current runtime defaults:
- `ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"`
- `OPENAI_MODEL || "gpt-4o"`
- `LLM_REQUEST_TIMEOUT_MS || 15000`
- `LLM_MAX_TOKENS || 2000`

The provider currently uses direct `fetch` calls. OpenAI uses Chat Completions, not the Responses API or SDK. Anthropic uses Messages API, not the Anthropic SDK. Route-level LLM failures fall back to rule-based summaries. Future model-default or API modernization belongs in a separate focused issue/PR.

---

## Scanner Integration

### Expected ZIP Structure

```
network-name/
└── rawscans/
    └── YYYY-MM-DD_HHMM_baselinekit_v0/
        ├── ports_top200_open.xml      # Required
        ├── hosts_up.txt               # Optional
        ├── discovery_ping_sweep.xml   # Optional
        ├── http_titles.xml            # Optional (device names)
        └── scan_metadata.json         # Optional
```

### PowerShell Scanner

Located at `scripts/network-scan_v1_3.ps1`:

```powershell
# Run with:
powershell.exe -ExecutionPolicy Bypass -File ".\scripts\network-scan_v1_3.ps1" `
  -Target "192.168.1.0/24" `
  -NetworkName "my-network" `
  -OutputDir ".\processed\current"
```

**Note:** Use v1_3+ to avoid UTF-8 BOM issues in hosts_up.txt.

---

## Coding Guidelines

### Component Structure

- Use `"use client"` directive for interactive components
- Keep components under 200 lines; extract hooks for complex logic
- Colocate component-specific types in the same file

### State Management

- Use React Context for app-wide state (persona, demo mode)
- Use local state for component-specific UI state
- Persist user preferences to localStorage

### API Routes

- Return consistent shapes: `{ data: T } | { error: string }`
- Handle errors gracefully; never expose internal paths

### Git Commits

- Use conventional commits: `feat(scope): message`, `fix(scope): message`
- Commit after each logical change
- Push to feature branch, PR to main

---

## Common Tasks

### Add a new risk port

1. Edit `src/lib/constants/risk-ports.ts`
2. Add to appropriate array (CRITICAL_PORTS, ADMIN_PORTS, etc.)
3. Add action description to `P0_ACTIONS` or `P1_ACTIONS`

### Add a new persona field

1. Update `src/lib/types/userProfile.ts`
2. Update persona modal component
3. Update LLM prompt builder if field affects summary

### Add a new API route

1. Create folder in `src/app/api/`
2. Add `route.ts` with handler
3. Export named functions (GET, POST, etc.)

---

## Testing

### Manual Testing Checklist

- [ ] Upload a ZIP → runs detected
- [ ] Select run → scorecard shows data
- [ ] Change persona → summary updates
- [ ] Compare two runs → diff shows changes
- [ ] Demo mode → sample data loads
- [ ] Export → file downloads

### Commands

```bash
npm run dev       # Start dev server
npm run build     # Production build (catches type errors)
npm run lint      # ESLint
```

---

## Documentation Files

| File                         | Purpose                                           |
| ---------------------------- | ------------------------------------------------- |
| `README.md`                  | Project overview, quick start                     |
| `CLAUDE.md`                  | AI assistant context (this file)                  |
| `CHANGELOG.md`               | Version history                                   |
| `docs/ROADMAP.md`            | Feature roadmap                                   |
| `docs/SCANNING_GUIDE.md`     | How to run Nmap scans                             |
| `docs/FEATURE_ROADMAP.md`    | Prioritized feature list                          |
| `docs/TRAFFIC_VISUALIZER.md` | Traffic Visualizer (PCAP) feature & privacy model |

---

## Security Guidance: Uploads, Parsers, and Packet Highway

This repo accepts user-supplied network artifacts. Treat all uploaded ZIPs, XML files, PCAPs, PCAPNGs, CSVs, JSON fixtures, and generated analysis outputs as untrusted input.

### Runtime parser risk

- XML parsing is a runtime security boundary because users upload Nmap XML artifacts.
- PCAP/PCAPNG parsing is also a runtime security boundary because users may upload large or malformed captures.
- Any parser change must preserve explicit input limits, safe failure behavior, and path-safe error messages.

### Dependency security

When touching dependencies:

1. Run `npm audit`.
2. Classify findings as:
   - runtime exposure,
   - development/build-tool exposure,
   - transitive/no practical exposure,
   - false positive or not applicable.

3. Fix runtime exposures first.
4. Prefer normal semver-compatible upgrades.
5. Avoid `npm audit fix --force` unless explicitly approved.
6. If using `overrides`, document:
   - why the override exists,
   - what package/version it overrides,
   - how to remove it later,
   - the upstream version that should make it unnecessary.

### Packet Highway privacy rules

Do not commit:

- `*.pcap`
- `*.pcapng`
- `*.cap`
- `*.har`
- `*.etl`
- Zeek logs such as `conn.log`, `dns.log`, `ssl.log`, `http.log`
- real device inventory CSV/XLSX files
- generated raw flow JSON
- local capture output folders

Real captures and inventories must stay in ignored local paths only.

### Parser output rules

Packet Highway parser output must contain metadata only:

- timestamps
- MAC addresses
- IP addresses
- ports
- protocol/service classification
- packet counts
- byte counts
- DNS/mDNS/LLMNR query names where present

Do not extract, store, summarize, or display packet payload contents.

### UI wording rules

The UI must not claim it can see encrypted content.

Use wording like:

- “encrypted web/video traffic observed”
- “metadata suggests this service category”
- “unusual pattern worth reviewing”
- “potentially risky”

Avoid wording like:

- “malware detected”
- “Zoom content”
- “safe device”
- “confirmed attack”

unless there is deterministic evidence and the rule explains that evidence.

### Required validation before PR

Run and report:

```bash
npm ci
npm audit --audit-level=moderate
npm test
npm run lint
npx tsc --noEmit
npm run build
git status --short
git check-ignore path/to/test.pcap path/to/test.pcapng path/to/test.har path/to/conn.log
```

Before merging, confirm no raw captures, real inventories, local generated outputs, or sensitive analysis artifacts are staged.

_Last updated: January 27, 2026_
