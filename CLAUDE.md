# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PSEC Baseline Hunter is a Streamlit-based network security baseline comparison tool. It ingests baselinekit (Nmap-based) scan results, analyzes them, and compares runs to detect new security exposures.

## Commands

**Run the application:**
```bash
streamlit run app/Home.py
```

**Install dependencies:**
```bash
pip install -r requirements.txt
```

No test framework or linting tools are currently configured.

## Architecture

Three-tier structure: UI Layer (Streamlit) → Business Logic (core/) → Data/File Layer (data/)

```
app/                    # Streamlit pages
├── Home.py             # Main entry point (upload & ingest)
└── pages/
    ├── 2_Scorecard.py  # Parse Nmap XML, top ports summary
    └── 3_Diff.py       # Compare runs, detect deltas, risk flags

core/                   # Business logic modules
├── ingest.py           # Upload, extract zip, detect runs, parse metadata
├── nmap_parse.py       # Parse Nmap XML → DataFrames
└── diff.py             # Run comparison, risk flagging, markdown export

data/                   # Data storage (gitignored)
├── uploads/            # Uploaded zip files
├── extracted/          # Extracted zip contents
└── comparisons/        # Markdown exports
```

**Key data flows:**
1. **Ingest:** ZIP upload → extract → detect run folders → build metadata
2. **Scorecard:** Select run → parse Nmap XML → aggregate top ports
3. **Diff:** Compare two runs → set difference on hosts/ports → apply risk rules → export markdown

## Key Modules

**core/ingest.py:** Run detection parses folder names formatted as `YYYY-MM-DD_HHMM_<type>`. Key files include discovery, ports, hosts_up, http_titles, infra_services, gateway_smoke, and snapshots.

**core/diff.py:** Risk flagging uses static port rules:
- P0 (critical): 23, 445, 3389, 5900, 135, 139, 1080
- P1 (admin/dev): 8080, 8443, 8888
- P2 (context-dependent): 22, 80, 443

Modify `RISK_PORTS` and `PORT_NOTES` dicts to adjust risk rules.

**app/_bootstrap.py:** Adds repo root to sys.path for cross-directory imports.

## Adding New Features

- New Streamlit pages: `app/pages/{N}_{Name}.py` (Streamlit convention)
- New key file patterns: `core/ingest.py` → `find_key_files()`
- New risk rules: `core/diff.py` → `RISK_PORTS`, `PORT_NOTES`

## Known Issues

From NOTES_SESSION3.md:
- Run identity collisions when ingesting the same underlying run multiple times
- Minute-granular naming (HHMM) can create same-minute collisions
- Recommended: implement canonical run registry with deduping (data/runs/ with manifest)

## Git Workflow

Feature branches: `feature/sessionN-*`
Commit style: conventional commits (feat:, fix:, docs:, chore:)
