# PSEC Baseline Hunter - Project Roadmap & Feature Guide

**Last Updated:** 2026-01-25
**Purpose:** Comprehensive guide to understanding, using, and extending PSEC Baseline Hunter

---

## Table of Contents

1. [What Is This Tool?](#1-what-is-this-tool)
2. [The Security Problem We're Solving](#2-the-security-problem-were-solving)
3. [Input Files - What You Provide](#3-input-files---what-you-provide)
4. [Output - What You Get Back](#4-output---what-you-get-back)
5. [How This Helps Secure Your Network](#5-how-this-helps-secure-your-network)
6. [Free Tools Integration](#6-free-tools-integration)
7. [Current Features (What Works Now)](#7-current-features-what-works-now)
8. [Feature Roadmap](#8-feature-roadmap)
9. [Future Enhancement Options](#9-future-enhancement-options)
10. [Getting Started Guide](#10-getting-started-guide)

---

## 1. What Is This Tool?

PSEC Baseline Hunter is a **network security baseline comparison tool**. It answers a simple but critical question:

> "What changed on my network since the last time I scanned it?"

### The Core Workflow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   SCAN YOUR     │     │   UPLOAD TO     │     │   SEE WHAT      │
│   NETWORK       │ --> │   BASELINE      │ --> │   CHANGED       │
│   (Nmap/etc)    │     │   HUNTER        │     │   (New risks)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Use Cases

| Scenario | How Baseline Hunter Helps |
|----------|--------------------------|
| **Weekly security checks** | Compare this week's scan to last week's - spot new devices/ports |
| **Before/after changes** | Scan before and after a network change to verify only expected changes occurred |
| **Incident investigation** | Compare current state to a known-good baseline to identify unauthorized changes |
| **Compliance auditing** | Document what's on your network and track changes over time |
| **Home network security** | Find IoT devices exposing unexpected services |

---

## 2. The Security Problem We're Solving

### The Challenge

Networks change constantly:
- New devices join (IoT devices, guest laptops, rogue devices)
- Services get enabled (accidentally or maliciously)
- Configurations drift from secure baselines
- Attackers establish footholds

**Without baseline comparison:**
- You don't know what's "normal" on your network
- New risks blend in with existing services
- You're essentially blind to changes

**With baseline comparison:**
- You have a clear picture of "before" and "after"
- New exposures are immediately highlighted
- High-risk ports are automatically flagged

### What Makes a Port "Risky"?

The tool uses a tiered risk classification:

| Priority | Ports | Why These Are Flagged |
|----------|-------|----------------------|
| **P0 (Critical)** | 23, 445, 3389, 5900, 135, 139, 1080 | Remote access/file sharing that should rarely be exposed |
| **P1 (Admin/Dev)** | 8080, 8443, 8888 | Admin panels, dev servers - often left unprotected |
| **P2 (Watch)** | 22, 80, 443 | Normal services, but worth noting when NEW |

**Example P0 Alert:**
```
NEW: 192.168.1.105 tcp/3389 — RDP (remote desktop) | service=ms-wbt-server
```
This means someone enabled Remote Desktop on a device that didn't have it before. Was it you? If not, investigate immediately.

---

## 3. Input Files - What You Provide

### Primary Input: Baselinekit ZIP Files

The tool expects ZIP files containing network scan results in a specific structure:

```
your-network/
└── rawscans/
    └── 2025-12-31_2044_baselinekit_v0/    # Folder naming: YYYY-MM-DD_HHMM_runtype
        ├── ports_top200_open.xml           # Main port scan (Nmap XML)
        ├── hosts_up.txt                    # List of responding hosts
        ├── discovery_ping_sweep.xml        # Discovery scan
        ├── http_titles.xml                 # HTTP service detection
        ├── infra_services.xml              # Infrastructure services
        └── gw_ports_smoke.xml              # Gateway tests
```

### Folder Naming Convention

```
YYYY-MM-DD_HHMM_runtype
│          │    │
│          │    └── Type identifier (baselinekit_v0, smoketest, etc.)
│          └── Time in 24hr format (2044 = 8:44 PM)
└── Date of scan
```

### File Types Recognized

| File Pattern | Purpose | Format |
|-------------|---------|--------|
| `ports_*.xml` | Port scan results | Nmap XML |
| `hosts_up.txt` | Live host list | One IP per line |
| `discovery_*.xml` | Discovery scans | Nmap XML |
| `http_titles.xml` | HTTP service fingerprinting | Nmap XML |
| `infra_services*.xml` | Infrastructure services | Nmap XML |
| `gw_ports_smoke.xml` | Gateway smoke tests | Nmap XML |
| `arp*`, `ipconfig*`, `route*` | Network snapshots | Text files |

### Nmap XML Format (What's Inside)

The tool parses standard Nmap XML output:

```xml
<?xml version="1.0"?>
<nmaprun scanner="nmap" args="nmap -sV -oX output.xml 192.168.1.0/24">
  <host>
    <status state="up"/>
    <address addr="192.168.1.105" addrtype="ipv4"/>
    <address addr="00:15:26:0E:FF:05" addrtype="mac" vendor="Dell"/>
    <hostnames>
      <hostname name="workstation-5.local"/>
    </hostnames>
    <ports>
      <port protocol="tcp" portid="22">
        <state state="open"/>
        <service name="ssh" product="OpenSSH" version="8.9"/>
      </port>
      <port protocol="tcp" portid="80">
        <state state="open"/>
        <service name="http" product="nginx" version="1.18"/>
      </port>
    </ports>
  </host>
</nmaprun>
```

---

## 4. Output - What You Get Back

### Scorecard View (Single Run Analysis)

For a single scan, you get:

| Output | Description |
|--------|-------------|
| **Top Ports Table** | Most common open ports across all hosts |
| **Host Count** | Total number of responding hosts |
| **Port Distribution** | Protocol/port/service breakdown |
| **Service Inventory** | Products and versions detected |

**Example Top Ports Table:**

| Protocol | Port | Service | Hosts Affected |
|----------|------|---------|----------------|
| tcp | 22 | ssh | 47 |
| tcp | 80 | http | 23 |
| tcp | 443 | https | 21 |
| tcp | 8080 | http-alt | 5 |
| tcp | 3389 | ms-wbt-server | 2 |

### Diff View (Comparison Analysis)

When comparing two scans, you get:

#### Summary Metrics
```
New hosts:           +3
Removed hosts:       -1
Ports opened:        +7 new exposures
Ports closed:        -2
Risky exposures:     2 P0, 1 P1, 3 P2
```

#### Host Changes
```
## New hosts
- 192.168.1.201  (appeared since last scan)
- 192.168.1.202
- 192.168.1.203

## Removed hosts
- 192.168.1.50   (no longer responding)
```

#### Port Changes (CHANGES.md export)

```markdown
## Ports opened
| ip | hostname | protocol | port | state | service | product | version |
|----|----------|----------|------|-------|---------|---------|---------|
| 192.168.1.105 | workstation-5 | tcp | 3389 | open | ms-wbt-server | Microsoft RDP | - |
| 192.168.1.201 | iot-camera | tcp | 554 | open | rtsp | Hikvision | - |

## Ports closed
| ip | hostname | protocol | port | state | service |
|----|----------|----------|------|-------|---------|
| 192.168.1.30 | old-server | tcp | 21 | open | ftp |
```

#### Risk Flags (WATCHLIST.md export)

```markdown
# WATCHLIST - YourNetwork

## Prioritized items

### P0
- **192.168.1.105** `tcp/3389` — RDP (remote desktop) | service=ms-wbt-server

### P1
- **192.168.1.201** `tcp/8080` — HTTP alt / admin panel common | service=http

### P2
- **192.168.1.202** `tcp/22` — SSH (remote admin) | service=ssh

## Suggested next actions (fast)
- Confirm if each exposure is expected (device owner / change ticket / known service)
- Identify device by IP → MAC (ARP table / router UI / DHCP leases)
- If not expected: block at router/firewall, disable service, or isolate VLAN
- Re-scan the single host/port to confirm it's truly open (avoid false positives)
```

---

## 5. How This Helps Secure Your Network

### Security Workflow with Baseline Hunter

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONTINUOUS SECURITY MONITORING                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   WEEK 1                    WEEK 2                    WEEK 3                 │
│   ┌──────────┐              ┌──────────┐              ┌──────────┐          │
│   │ BASELINE │              │   NEW    │              │   NEW    │          │
│   │  SCAN    │              │   SCAN   │              │   SCAN   │          │
│   └────┬─────┘              └────┬─────┘              └────┬─────┘          │
│        │                         │                         │                 │
│        │                    ┌────┴─────┐              ┌────┴─────┐          │
│        │                    │ COMPARE  │              │ COMPARE  │          │
│        │                    │ vs Week1 │              │ vs Week2 │          │
│        │                    └────┬─────┘              └────┬─────┘          │
│        │                         │                         │                 │
│        v                         v                         v                 │
│   [Initial                 [Detect new             [Detect new              │
│    inventory]               exposures]              exposures]              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Practical Security Actions

| Finding | Investigation Steps | Remediation |
|---------|---------------------|-------------|
| **New host appeared** | 1. Check DHCP logs for MAC<br>2. Cross-reference with asset inventory<br>3. Physically locate device | If unauthorized: disconnect, investigate, document |
| **P0 port opened** | 1. Identify device owner<br>2. Check change tickets<br>3. Verify service necessity | Disable service, block at firewall, or accept risk with documentation |
| **Host disappeared** | 1. Check if device was decommissioned<br>2. Verify network connectivity<br>3. Check for hardware failure | May indicate device failure or network issue |
| **Service version changed** | 1. Check if patches were applied<br>2. Verify change was authorized | May be normal patching or unauthorized modification |

### Security Questions This Tool Answers

- "Did any new devices join my network this week?"
- "Are there any new remote access services I didn't enable?"
- "Did that firmware update accidentally open new ports?"
- "What was the state of my network before the incident?"
- "Are all my IoT devices still behaving normally?"

---

## 6. Free Tools Integration

### Network Scanning Tools

#### Nmap (Primary Tool)
**Purpose:** Port scanning, service detection, OS fingerprinting

```bash
# Basic scan - discover hosts and common ports
nmap -sV -T4 192.168.1.0/24 -oX scan_results.xml

# Top 200 ports with service detection
nmap -sV --top-ports 200 192.168.1.0/24 -oX ports_top200.xml

# Discovery only (ping sweep)
nmap -sn 192.168.1.0/24 -oX discovery.xml

# Full port scan (slow but thorough)
nmap -sV -p- 192.168.1.0/24 -oX full_scan.xml
```

**Key flags:**
| Flag | Purpose |
|------|---------|
| `-sV` | Service version detection |
| `-T4` | Faster timing (aggressive) |
| `-oX` | XML output (required for Baseline Hunter) |
| `--top-ports 200` | Scan most common 200 ports |
| `-sn` | Ping scan only (host discovery) |
| `-p-` | All 65535 ports |

#### Zenmap (Nmap GUI)
**Purpose:** Visual interface for Nmap, easier for beginners

- Download: https://nmap.org/zenmap/
- Provides scan profiles like "Quick scan", "Intense scan"
- Automatically generates XML output

### Packet Capture Tools

#### Wireshark
**Purpose:** Deep packet analysis, protocol inspection

**Use with Baseline Hunter:**
1. Baseline Hunter identifies new/suspicious host
2. Use Wireshark to capture traffic from that host
3. Analyze protocols to understand what it's doing

```
# Example filter to watch suspicious host
ip.addr == 192.168.1.105
```

#### tcpdump (Command Line)
**Purpose:** Quick packet captures without GUI

```bash
# Capture traffic from suspicious host to file
tcpdump -i eth0 host 192.168.1.105 -w capture.pcap

# Watch for connections to suspicious port
tcpdump -i eth0 port 3389
```

### Network Discovery Tools

#### arp-scan
**Purpose:** Fast MAC address discovery

```bash
# Discover all devices on local network
arp-scan --localnet
```

#### netdiscover
**Purpose:** ARP reconnaissance

```bash
# Passive discovery (listen only)
netdiscover -p

# Active discovery
netdiscover -r 192.168.1.0/24
```

### Vulnerability Scanners

#### OpenVAS / Greenbone
**Purpose:** Vulnerability assessment

- Open source vulnerability scanner
- Can be used after Baseline Hunter identifies new hosts
- Provides CVE-based vulnerability reports

#### Nikto
**Purpose:** Web server scanning

```bash
# Scan web service found by Baseline Hunter
nikto -h http://192.168.1.105:8080
```

### Integration Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FREE TOOLS SECURITY WORKFLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. DISCOVERY                2. ANALYSIS                3. INVESTIGATION     │
│  ┌─────────────┐             ┌─────────────┐            ┌─────────────┐     │
│  │   NMAP      │             │  BASELINE   │            │  WIRESHARK  │     │
│  │  Scan       │ ─────────>  │   HUNTER    │ ─────────> │  Capture    │     │
│  │  Network    │             │  Compare    │            │  Traffic    │     │
│  └─────────────┘             └─────────────┘            └─────────────┘     │
│        │                           │                          │              │
│        v                           v                          v              │
│  ┌─────────────┐             ┌─────────────┐            ┌─────────────┐     │
│  │ arp-scan    │             │  Identify   │            │   Nikto     │     │
│  │ MAC lookup  │             │  Changes    │            │  Web scan   │     │
│  └─────────────┘             └─────────────┘            └─────────────┘     │
│                                    │                                         │
│                                    v                                         │
│                             ┌─────────────┐                                  │
│                             │  OpenVAS    │                                  │
│                             │  Vuln Scan  │                                  │
│                             └─────────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Current Features (What Works Now)

### Implemented Features

| Feature | Status | Description |
|---------|--------|-------------|
| ZIP Upload | ✅ Working | Drag-and-drop ZIP file upload |
| ZIP Extraction | ✅ Working | Automatic extraction to local storage |
| Run Detection | ✅ Working | Finds runs in `rawscans/YYYY-MM-DD_HHMM_*` folders |
| Key File Detection | ✅ Working | Identifies discovery, ports, hosts_up files |
| Nmap XML Parsing | ✅ Working | Extracts host/port/service information |
| Top Ports Aggregation | ✅ Working | Summarizes most common ports |
| Run List Display | ✅ Working | Shows all detected runs with metadata |

### Current Limitations

| Limitation | Impact | Planned Fix |
|------------|--------|-------------|
| Local storage only | Data lost on deployment | Phase 1: S3 integration |
| No run comparison UI | Can't compare runs yet | Phase 4: Diff implementation |
| No risk flagging UI | No P0/P1/P2 alerts | Phase 4: Risk flags |
| No export functionality | Can't download reports | Phase 4: Markdown export |
| No deduplication | Re-uploading creates duplicates | Phase 2: Run registry |

---

## 8. Feature Roadmap

### Phase 1: Cloud Storage (Next Up)
**Focus:** Move from local filesystem to S3

| Task | Description |
|------|-------------|
| S3 Integration | Upload/store files in AWS S3 |
| Presigned URLs | Direct browser-to-S3 upload |
| ZIP Validation | Security checks for malicious ZIPs |

### Phase 2: Run Registry
**Focus:** Proper run management and deduplication

| Task | Description |
|------|-------------|
| Run Manifest | Structured metadata storage |
| Content Hashing | Detect duplicate uploads |
| Run UID Generation | Stable run identifiers |

### Phase 3: Scorecard Enhancement
**Focus:** Rich single-run analysis

| Task | Description |
|------|-------------|
| Network Selector | Dropdown to filter by network |
| Run Type Filter | Filter by scan type |
| Port Table | Sortable, paginated port listing |
| Host Metrics | Visual statistics display |

### Phase 4: Diff & Risk Flags
**Focus:** Core comparison functionality

| Task | Description |
|------|-------------|
| Comparison UI | Select two runs to compare |
| Host Delta | Show new/removed hosts |
| Port Delta | Show opened/closed ports |
| Risk Flagging | P0/P1/P2 classification |
| Markdown Export | CHANGES.md, WATCHLIST.md generation |

### Phase 5: Advanced Features
**Focus:** Customization and history

| Task | Description |
|------|-------------|
| Custom Risk Rules | Per-network port classifications |
| Comparison History | Track past comparisons |
| Shareable URLs | Deep links to specific comparisons |
| CSV Export | Alternative export format |

### Phase 6: Hardening
**Focus:** Production readiness

| Task | Description |
|------|-------------|
| Rate Limiting | Prevent abuse |
| Audit Logging | Track all actions |
| Run Archival | Move old runs to cold storage |
| Documentation | User guides and API docs |

---

## 9. Future Enhancement Options

### Option A: Automated Scanning Integration
**Effort:** High | **Value:** High

Integrate with scan schedulers to automate the baseline workflow:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   SCHEDULED     │     │   AUTOMATIC     │     │   EMAIL/SLACK   │
│   NMAP SCAN     │ --> │   UPLOAD &      │ --> │   ALERTS FOR    │
│   (cron/task)   │     │   COMPARE       │     │   NEW RISKS     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Implementation ideas:**
- Webhook endpoint to receive scan results
- Integration with scanning platforms (Nessus, Qualys)
- Scheduled comparison jobs
- Email/Slack notifications for P0 findings

### Option B: Machine Learning Anomaly Detection
**Effort:** Very High | **Value:** Medium-High

Go beyond static port rules to detect unusual patterns:

- Learn "normal" network behavior patterns
- Flag statistically unusual changes
- Identify suspicious service combinations
- Detect lateral movement patterns

### Option C: Asset Inventory Integration
**Effort:** Medium | **Value:** High

Connect scan data to an asset database:

```
Scan Result: 192.168.1.105:3389 opened
Asset DB Lookup: "workstation-5, Owner: John Doe, IT Dept"
Alert: "RDP enabled on John Doe's workstation - verify authorization"
```

**Benefits:**
- Context for all findings
- Owner notification for changes
- Automatic escalation rules
- Compliance reporting

### Option D: Vulnerability Correlation
**Effort:** High | **Value:** High

Correlate service versions with known vulnerabilities:

```
Finding: 192.168.1.50 running Apache 2.4.49
CVE Lookup: CVE-2021-41773 (Path Traversal) - CRITICAL
Alert: "Critical vulnerability on 192.168.1.50 - patch immediately"
```

**Implementation:**
- Integrate with NVD/CVE databases
- Version matching logic
- Severity scoring (CVSS)
- Remediation recommendations

### Option E: Network Visualization
**Effort:** Medium | **Value:** Medium

Visual network maps showing:

- All discovered hosts as nodes
- Connections between hosts
- Risk-colored highlighting
- Change animation over time

**Technologies:**
- D3.js or vis.js for visualization
- Force-directed graph layouts
- Interactive drill-down

### Option F: Multi-Tenant/Team Support
**Effort:** High | **Value:** Medium

Support for multiple networks/teams:

- User authentication
- Role-based access
- Network ownership/permissions
- Shared vs. private comparisons

### Option G: Wireshark PCAP Integration
**Effort:** Medium | **Value:** Medium

Import Wireshark captures alongside Nmap scans:

```
┌─────────────────┐     ┌─────────────────┐
│   NMAP SCAN     │     │   PCAP CAPTURE  │
│   (ports/svcs)  │     │   (traffic)     │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────┴──────┐
              │  COMBINED   │
              │  ANALYSIS   │
              │ Ports+Traffic
              └─────────────┘
```

**Use cases:**
- Correlate open ports with actual traffic
- Identify "dark" ports (open but unused)
- Protocol analysis for detected services

### Option H: Compliance Reporting
**Effort:** Medium | **Value:** High (for regulated environments)

Generate reports for compliance frameworks:

| Framework | Report Type |
|-----------|-------------|
| PCI-DSS | Network segmentation verification |
| HIPAA | Medical device inventory |
| SOC 2 | Change detection evidence |
| ISO 27001 | Asset inventory reports |

### Decision Matrix

| Option | Effort | Value | Recommended For |
|--------|--------|-------|-----------------|
| A: Automated Scanning | High | High | Production environments |
| B: ML Anomaly Detection | Very High | Medium-High | Enterprise security teams |
| C: Asset Inventory | Medium | High | Organizations with CMDB |
| D: Vuln Correlation | High | High | Security-focused teams |
| E: Visualization | Medium | Medium | Presentations/reporting |
| F: Multi-Tenant | High | Medium | MSPs, large teams |
| G: PCAP Integration | Medium | Medium | Deep investigation needs |
| H: Compliance Reporting | Medium | High | Regulated industries |

---

## 10. Getting Started Guide

### Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| Node.js | 20+ | `node --version` |
| npm | 10+ | `npm --version` |
| Git | Any | `git --version` |

### Quick Start

```bash
# 1. Clone and checkout
cd C:\Users\user\Desktop\psec-baseline-hunter
git checkout feature/nextjs-migration

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Open browser
# http://localhost:3000/upload
```

### Creating Your First Scan

#### Step 1: Run Nmap
```bash
# Replace with your network range
nmap -sV --top-ports 200 192.168.1.0/24 -oX ports_top200_open.xml

# Optional: host discovery
nmap -sn 192.168.1.0/24 -oX discovery_ping_sweep.xml

# Optional: save live hosts
nmap -sn 192.168.1.0/24 | grep "Nmap scan report" | awk '{print $5}' > hosts_up.txt
```

#### Step 2: Organize Files
```
mkdir -p my-network/rawscans/2026-01-25_1530_baselinekit_v0
mv ports_top200_open.xml my-network/rawscans/2026-01-25_1530_baselinekit_v0/
mv discovery_ping_sweep.xml my-network/rawscans/2026-01-25_1530_baselinekit_v0/
mv hosts_up.txt my-network/rawscans/2026-01-25_1530_baselinekit_v0/
```

#### Step 3: Create ZIP
```bash
zip -r my-network-scan.zip my-network/
```

#### Step 4: Upload to Baseline Hunter
1. Open http://localhost:3000/upload
2. Drag `my-network-scan.zip` onto the upload zone
3. Click "Extract + Detect"
4. View your run in the detected runs list

### Recommended Scan Schedule

| Environment | Frequency | Scope |
|-------------|-----------|-------|
| Home network | Weekly | Full scan |
| Small office | Weekly | Full scan |
| Corporate network | Daily | Key segments |
| DMZ/Internet-facing | Daily | All hosts |
| Critical infrastructure | Continuous | All hosts |

---

## Summary

PSEC Baseline Hunter transforms raw network scan data into actionable security intelligence. By comparing scans over time, you can:

1. **Detect unauthorized changes** before they become breaches
2. **Prioritize remediation** with risk-based flagging
3. **Document network state** for compliance and forensics
4. **Integrate with free tools** like Nmap and Wireshark

The roadmap provides a clear path from current local-only functionality to a full-featured cloud-based security monitoring platform. Choose the features that match your security needs and build incrementally.

---

*Questions? Suggestions? This is an evolving document. Future sessions can refine any section based on actual usage patterns and requirements.*
