# Scanner Pipeline Reference (for Claude Code / Codex)

> This document captures the scan-to-app workflow so AI assistants can understand the pipeline without re-learning context.

---

## Overview

The PSEC Baseline Hunter workflow:
1. **Run scan** — PowerShell script executes Nmap against a LAN subnet
2. **Generate ZIP** — Script bundles results into a baselinekit-style ZIP
3. **Upload to app** — User drops ZIP into Next.js app at `/upload`
4. **View results** — Scorecard shows hosts, ports, risks, recommendations

---

## Scanner Scripts

**Recommended:** `scripts/network-scan_v1_3.ps1`
- Writes `hosts_up.txt` as ASCII (no BOM issues)
- Sorts hosts unique
- Produces full Nmap output triplets (-oA)

**Command (Git Bash on Windows):**
```bash
powershell.exe -ExecutionPolicy Bypass -File ".\scripts\network-scan_v1_3.ps1" \
  -Target "192.168.1.0/24" \
  -NetworkName "orange-network" \
  -OutputDir ".\processed\current"
```

**Output structure:**
```
processed/current/
├── orange-network/
│   └── rawscans/
│       └── 2026-01-26_2126_baselinekit_v0/
│           ├── discovery_ping_sweep.xml
│           ├── hosts_up.txt
│           ├── ports_top200_open.xml
│           ├── http_titles.xml
│           ├── infra_services_gw.xml
│           ├── scan_metadata.json
│           └── ... (other outputs)
└── orange-network_2026-01-26_2126.zip
```

---

## ZIP Contents (What the App Needs)

### Required
- `ports_top200_open.xml` — Port scan results (Nmap XML)

### Optional (enhances UI)
- `discovery_ping_sweep.xml` — Host discovery
- `hosts_up.txt` — List of live IPs
- `http_titles.xml` — Web UI titles for device identification
- `infra_services_gw.xml` — Gateway/router service context
- `scan_metadata.json` — Timestamp, scan profile, flags

### Known Gotcha
If `hosts_up.txt` has a UTF-8 BOM (from older script versions), Nmap fails with:
```
Failed to resolve "∩╗┐192.168.1.1"
```
**Fix:** Use v1_3 script, or manually strip BOM and re-zip.

---

## Verified Working Run

**Network:** orange-network (home LAN)
**Date:** 2026-01-26
**Results:**
- 12 hosts
- 14 open ports
- 7 services
- 5 risk ports (SOCKS proxy, SMB, NetBIOS)

The Scorecard correctly displays:
- Host/port/service counts
- Risk exposures with affected host counts
- Prioritized recommended actions (P0/P1/P2)

---

## App Data Flow

```
ZIP Upload
    ↓
/api/upload (validates, saves to data/uploads/)
    ↓
/api/ingest (extracts ZIP, detects run folders)
    ↓
/api/parse (parses Nmap XML → structured data)
    ↓
Run Registry (dedup by content hash)
    ↓
Scorecard/Diff UI (renders parsed data)
```

---

## Product Direction

### Current gaps
The Scorecard is accurate but technical. Non-technical users need:
- **"What device is this?"** — HTTP titles, MAC vendor, hostname
- **"Why should I care?"** — Plain-English risk explanation
- **"What do I do next?"** — Prioritized, practical actions

### Planned features
1. **Personalized Summary** — LLM-generated report tailored to user's role/context
2. **Device Identification** — Show HTTP titles and vendors per risky host
3. **Audience Translation** — Toggle between Security/Executive/Legal/Ops views
4. **Demo Mode** — Preloaded sample data for demos without real scans

---

## Risk Classification

| Priority | Ports | Why It's Risky |
|----------|-------|----------------|
| **P0 (Critical)** | 23 (telnet), 445 (SMB), 3389 (RDP), 5900 (VNC), 135/139 (NetBIOS), 1080 (SOCKS) | Remote access, file sharing, proxy abuse |
| **P1 (Admin)** | 8080, 8443, 8888, 9000, 9090 | Admin panels, dev servers, often unprotected |
| **P2 (Watch)** | 22 (SSH), 80 (HTTP), 443 (HTTPS) | Common services, note when NEW |

---

## File Naming Flexibility

The ingester should accept multiple naming conventions:
- `ports_top200_open.xml` OR `ports.xml`
- `discovery_ping_sweep.xml` OR `discovery.xml`

Map to canonical internal names during parsing.
