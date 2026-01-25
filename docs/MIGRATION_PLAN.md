# PSEC Baseline Hunter: Next.js Migration Plan

## Step 1: Current State Summary

### Features

| Feature | Implementation | File |
|---------|---------------|------|
| ZIP Upload | Streamlit file_uploader → save to `data/uploads/` | `app/Home.py:52-65` |
| ZIP Extraction | zipfile.extractall → `data/extracted/` | `core/ingest.py:40-51` |
| Run Detection | Regex parse `YYYY-MM-DD_HHMM_<type>` folders | `core/ingest.py:54-75` |
| Key File Discovery | Glob patterns for discovery/ports/hosts_up/etc | `core/ingest.py:78-117` |
| Nmap XML Parsing | ElementTree → DataFrame (ip, port, state, service) | `core/nmap_parse.py:10-65` |
| Top Ports Summary | GroupBy (proto, port, service) → count unique IPs | `core/nmap_parse.py:68-83` |
| Run Comparison | Set difference on hosts and (ip, proto, port) tuples | `core/diff.py:171-214` |
| Risk Flagging | Static port rules P0/P1/P2 | `core/diff.py:223-278` |
| Markdown Export | CHANGES.md + WATCHLIST.md generation | `core/diff.py:281-381` |

### Data Flow

```
ZIP Upload → data/uploads/{name}_{uuid10}.zip
     ↓
Extract → data/extracted/{name}_{uuid8}/
     ↓
Detect Runs → Find */rawscans/YYYY-MM-DD_HHMM_* folders
     ↓
Build Metadata → RunMeta(folder, timestamp, type, key_files)
     ↓
Parse XML → DataFrame[ip, hostname, proto, port, state, service, product, version]
     ↓
Compare Runs → DiffResult(new_hosts, removed_hosts, ports_opened, ports_closed)
     ↓
Risk Flag → risky_opened DataFrame with priority P0/P1/P2
     ↓
Export → CHANGES.md, WATCHLIST.md
```

### File Structure

```
psec-baseline-hunter/
├── app/
│   ├── Home.py              # Upload + run detection (125 lines)
│   ├── _bootstrap.py        # sys.path setup (8 lines)
│   └── pages/
│       ├── 1_Ingest.py      # Empty placeholder
│       ├── 2_Scorecard.py   # Single-run analysis (59 lines)
│       └── 3_Diff.py        # Comparison + export (244 lines)
├── core/
│   ├── ingest.py            # Upload, extract, detect (168 lines)
│   ├── nmap_parse.py        # XML parsing (83 lines)
│   └── diff.py              # Comparison engine (449 lines)
├── data/                    # Gitignored runtime data
│   ├── uploads/
│   ├── extracted/
│   └── comparisons/
├── requirements.txt         # 45 Python dependencies
└── CLAUDE.md                # Project documentation
```

### Assumptions (Implicit in Code)

1. **Folder naming**: Runs MUST be named `YYYY-MM-DD_HHMM_<run_type>` (`core/ingest.py:60`)
2. **Network inference**: Network name = first part of ZIP stem before date pattern (`core/diff.py:62-81`)
3. **Single user**: No auth, no multi-tenancy, local filesystem storage
4. **Baselinekit format**: Expects `rawscans/` directory structure with specific file patterns
5. **Open ports only**: Diff only compares `state == "open"` ports (`core/diff.py:195`)

### Top Risks Blocking Production Use

| Risk | Severity | Location | Impact |
|------|----------|----------|--------|
| **Run identity collisions** | HIGH | `core/ingest.py:40-51` | Same ZIP re-uploaded creates duplicate runs with different UUIDs |
| **No ZIP validation** | HIGH | `core/ingest.py:32-38` | Malicious ZIPs could exploit path traversal (zip slip) |
| **Local filesystem only** | HIGH | All data/ ops | No persistence across deployments, no scale |
| **No run deduplication** | MEDIUM | `core/diff.py:84-127` | Users can compare wrong runs, data bloat |
| **Minute-granular timestamps** | MEDIUM | `core/ingest.py:60-75` | Same-minute runs collide in naming |
| **No error boundaries** | MEDIUM | All Streamlit pages | Parse failures crash entire page |
| **No pagination** | LOW | `app/pages/3_Diff.py:160+` | Large scans could OOM browser |
| **Hardcoded risk rules** | LOW | `core/diff.py:223-246` | No way to customize P0/P1/P2 per network |

---

## Step 2: Target Product Definition

### MVP Scope

**Core workflow:** Upload → Detect → Compare → Export

| Page | MVP Features |
|------|-------------|
| **Upload** | Drag-drop ZIP, progress bar, extraction status, detected runs list |
| **Scorecard** | Network/run selector, top 25 ports table, host count metrics |
| **Diff** | Network/type/preset selector, Summary/Hosts/Ports/Risk/Export tabs, download buttons |

### v1 Additions

- Configurable risk rules per network (YAML or DB)
- CSV export alongside markdown
- Run deletion / archival
- Comparison history with shareable URLs
- Basic audit logging

### User Workflows

```
┌─────────────────────────────────────────────────────────────────────┐
│ WORKFLOW 1: Initial Baseline Ingest                                 │
├─────────────────────────────────────────────────────────────────────┤
│ 1. User navigates to /upload                                        │
│ 2. Drags ZIP file onto dropzone                                     │
│ 3. Progress bar shows upload → extraction → detection               │
│ 4. Success: Shows table of detected runs with metadata              │
│ 5. User clicks "View Scorecard" to analyze a single run             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ WORKFLOW 2: Baseline Comparison                                     │
├─────────────────────────────────────────────────────────────────────┤
│ 1. User navigates to /diff                                          │
│ 2. Selects Network dropdown (auto-populated from detected runs)     │
│ 3. Selects Run Type (filters to same-type runs only)                │
│ 4. Selects Comparison preset ("Latest vs Previous") or manual       │
│ 5. Clicks "Compare" button                                          │
│ 6. Views tabs: Summary → Hosts → Ports → Risk Flags → Export        │
│ 7. Downloads CHANGES.md and/or WATCHLIST.md                         │
└─────────────────────────────────────────────────────────────────────┘
```

### UX Routes

| Route | Purpose |
|-------|---------|
| `/` | Redirect to `/upload` |
| `/upload` | ZIP upload and run detection |
| `/scorecard` | Single-run port analysis |
| `/scorecard/[runId]` | Direct link to specific run |
| `/diff` | Run comparison dashboard |
| `/diff/[runAId]/[runBId]` | Direct link to specific comparison |

### Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Performance** | Upload <500MB in <60s, Diff compute <10s for 10K ports |
| **Availability** | Vercel auto-scaling, S3 11 9s durability |
| **Data Retention** | Runs persist until manually deleted |
| **File Limits** | Max ZIP: 500MB, Max XML: 50MB |
| **Browser Support** | Chrome/Firefox/Safari latest 2 versions |
| **Mobile** | Responsive but not primary target |

---

## Step 3: Architecture

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (Browser)                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  Next.js App (React Server Components + Client Components)              │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐│ │
│  │  │   Upload    │ │  Scorecard  │ │    Diff     │ │  Layout + Nav       ││ │
│  │  │   Page      │ │    Page     │ │    Page     │ │  (shadcn/ui)        ││ │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────────────────────┘│ │
│  │         │               │               │                                │ │
│  │  ┌──────┴───────────────┴───────────────┴──────┐                        │ │
│  │  │           SWR (Server State Cache)          │                        │ │
│  │  │         Zustand (Client UI State)           │                        │ │
│  │  └──────────────────────┬──────────────────────┘                        │ │
│  └─────────────────────────┼───────────────────────────────────────────────┘ │
└────────────────────────────┼─────────────────────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────┼─────────────────────────────────────────────────┐
│                     VERCEL (Serverless)                                       │
│  ┌─────────────────────────┴──────────────────────────────────────────────┐  │
│  │                         API Routes (Edge/Node.js)                       │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │  │
│  │  │ POST /upload │ │ POST /ingest │ │  GET /runs   │ │ POST /diff   │   │  │
│  │  │  (presign)   │ │  (extract)   │ │  (list)      │ │  (compare)   │   │  │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘   │  │
│  │         │                │                │                │            │  │
│  │  ┌──────┴────────────────┴────────────────┴────────────────┴───────┐   │  │
│  │  │                    lib/services/                                 │   │  │
│  │  │  ingest.ts │ run-registry.ts │ diff-engine.ts │ markdown-export │   │  │
│  │  └──────────────────────────────┬──────────────────────────────────┘   │  │
│  │                                 │                                       │  │
│  │  ┌──────────────────────────────┴──────────────────────────────────┐   │  │
│  │  │                    lib/parsers/                                  │   │  │
│  │  │  nmap-xml.ts (fast-xml-parser) │ folder-name.ts │ hosts-up.ts   │   │  │
│  │  └─────────────────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ AWS SDK
┌──────────────────────────────────────┼───────────────────────────────────────┐
│                              AWS Services                                     │
│  ┌───────────────────────────────────┴────────────────────────────────────┐  │
│  │                              S3 Bucket                                  │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │  │
│  │  │  uploads/          Raw ZIP files (presigned upload)              │   │  │
│  │  │  extracted/        Unzipped contents per extraction              │   │  │
│  │  │  runs/             Run manifests + parsed JSON cache             │   │  │
│  │  │  comparisons/      CHANGES.md + WATCHLIST.md exports             │   │  │
│  │  └─────────────────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  DynamoDB (Optional - for fast queries)                                │  │
│  │  ┌───────────────────────────────────────────────────────────────────┐ │  │
│  │  │  Table: Runs       PK=network, SK=run_uid                         │ │  │
│  │  │  Table: DiffCache  PK=run_a_uid#run_b_uid, TTL=1h                  │ │  │
│  │  └───────────────────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
```

### File Ingest Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FILE INGEST PIPELINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. UPLOAD (Client → S3)                                                     │
│     ┌────────────────────────────────────────────────────────────────────┐  │
│     │ • Request presigned URL from /api/upload                           │  │
│     │ • Client uploads directly to S3 (bypass Vercel 4.5MB limit)        │  │
│     │ • Content-Type: application/zip                                    │  │
│     │ • Max size: 500MB                                                  │  │
│     └────────────────────────────────────────────────────────────────────┘  │
│                              ↓                                               │
│  2. VALIDATION (API Route)                                                   │
│     ┌────────────────────────────────────────────────────────────────────┐  │
│     │ • Verify ZIP magic bytes (0x50 0x4B 0x03 0x04)                     │  │
│     │ • Check file size ≤ 500MB                                          │  │
│     │ • ZIP SLIP PREVENTION: Validate all entry paths:                   │  │
│     │   - No absolute paths (/etc/passwd)                                │  │
│     │   - No parent traversal (../../../)                                │  │
│     │   - No symlinks                                                    │  │
│     │ • Reject if validation fails                                       │  │
│     └────────────────────────────────────────────────────────────────────┘  │
│                              ↓                                               │
│  3. EXTRACTION (API Route → S3)                                              │
│     ┌────────────────────────────────────────────────────────────────────┐  │
│     │ • Stream ZIP from S3 to /tmp (Vercel: 512MB limit)                 │  │
│     │ • Extract with adm-zip (validate paths again on extract)           │  │
│     │ • Upload extracted files to S3: extracted/{extraction_id}/         │  │
│     │ • Delete /tmp files after upload                                   │  │
│     └────────────────────────────────────────────────────────────────────┘  │
│                              ↓                                               │
│  4. RUN DETECTION                                                            │
│     ┌────────────────────────────────────────────────────────────────────┐  │
│     │ • Scan S3 prefix for folders matching: YYYY-MM-DD_HHMM_*           │  │
│     │ • Parse timestamp + run_type from folder name                      │  │
│     │ • Detect key files: ports_*.xml, hosts_up.txt, discovery_*.xml     │  │
│     └────────────────────────────────────────────────────────────────────┘  │
│                              ↓                                               │
│  5. DEDUPLICATION (run_uid)                                                  │
│     ┌────────────────────────────────────────────────────────────────────┐  │
│     │ • Compute run_uid = hash(network + timestamp + run_type +          │  │
│     │                          ports_xml_sha256)                         │  │
│     │ • Check if run_uid exists in runs/ manifest                        │  │
│     │ • If duplicate: skip, return existing run reference                │  │
│     │ • If new: create manifest, proceed to parsing                      │  │
│     └────────────────────────────────────────────────────────────────────┘  │
│                              ↓                                               │
│  6. PARSING                                                                  │
│     ┌────────────────────────────────────────────────────────────────────┐  │
│     │ • Parse Nmap XML with fast-xml-parser                              │  │
│     │ • Extract: ip, hostname, protocol, port, state, service, product   │  │
│     │ • Store parsed JSON to S3: runs/{run_uid}/parsed/ports.json        │  │
│     │ • Parse hosts_up.txt → runs/{run_uid}/parsed/hosts.json            │  │
│     └────────────────────────────────────────────────────────────────────┘  │
│                              ↓                                               │
│  7. STORAGE                                                                  │
│     ┌────────────────────────────────────────────────────────────────────┐  │
│     │ • Create run manifest: runs/{run_uid}/manifest.json                │  │
│     │   {                                                                │  │
│     │     "run_uid": "sha256...",                                        │  │
│     │     "network": "batman",                                           │  │
│     │     "timestamp": "2025-12-31T20:44:00Z",                           │  │
│     │     "run_type": "baselinekit_v0",                                  │  │
│     │     "key_files": {...},                                            │  │
│     │     "stats": { "hosts": 52, "ports": 1247 },                       │  │
│     │     "created_at": "2026-01-25T..."                                 │  │
│     │   }                                                                │  │
│     │ • Update network index: networks/{network}/runs.json               │  │
│     └────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Model

```typescript
// ============ CORE ENTITIES ============

interface Network {
  id: string;                    // "batman", "orange"
  name: string;                  // Display name
  created_at: string;            // ISO 8601
  run_count: number;             // Cached count
}

interface ScanRun {
  run_uid: string;               // SHA256 hash (primary key)
  network_id: string;            // FK to Network
  folder_name: string;           // "2025-12-31_2044_baselinekit_v0"
  run_type: string;              // "baselinekit_v0", "smoketest"
  timestamp: string;             // ISO 8601
  timestamp_str: string;         // "2025-12-31 20:44"

  // Storage references
  extraction_id: string;         // S3 prefix under extracted/
  s3_prefix: string;             // Full S3 path to run folder

  // Key file references (S3 keys)
  key_files: {
    discovery: string[];
    hosts_up: string | null;
    ports: string[];
    http_titles: string[];
    infra_services: string[];
    gateway_smoke: string[];
    snapshots: string[];
  };

  // Cached stats
  stats: {
    hosts_count: number;
    ports_open_count: number;
    ports_total_count: number;
  };

  created_at: string;            // When ingested
}

interface Host {
  ip: string;                    // "192.168.254.14"
  hostname: string | null;       // "WattBox"
  mac_address: string | null;    // "00:15:26:0E:FF:05"
  vendor: string | null;         // "Remote Technologies"
  run_uid: string;               // FK to ScanRun
}

interface PortFinding {
  id: string;                    // UUID
  run_uid: string;               // FK to ScanRun
  ip: string;
  hostname: string;
  protocol: 'tcp' | 'udp';
  port: number;
  state: 'open' | 'closed' | 'filtered';
  service: string;
  product: string;
  version: string;
  source_xml: string;            // Which XML file
}

// ============ COMPARISON ENTITIES ============

interface DiffResult {
  diff_uid: string;              // SHA256(run_a_uid + run_b_uid)
  run_a_uid: string;             // Baseline (older)
  run_b_uid: string;             // Comparison (newer)
  network_id: string;

  // Delta counts
  new_hosts_count: number;
  removed_hosts_count: number;
  ports_opened_count: number;
  ports_closed_count: number;

  // Risk counts
  risk_p0_count: number;
  risk_p1_count: number;
  risk_p2_count: number;

  // S3 references to full data
  new_hosts_key: string;         // S3 key to JSON array
  removed_hosts_key: string;
  ports_opened_key: string;      // S3 key to PortFinding[]
  ports_closed_key: string;
  risky_opened_key: string;      // S3 key to RiskFlag[]

  computed_at: string;
  ttl: number;                   // DynamoDB TTL
}

interface RiskFlag {
  priority: 'P0' | 'P1' | 'P2';
  reason: string;                // "SMB (Windows file sharing) | service=microsoft-ds"
  ip: string;
  protocol: string;
  port: number;
  service: string;
  product: string;
  version: string;
}

// ============ REPORTING ============

interface Report {
  report_uid: string;
  diff_uid: string;              // FK to DiffResult
  type: 'changes' | 'watchlist';
  format: 'md' | 'csv';
  s3_key: string;
  generated_at: string;
}

// ============ CONFIGURATION (v1) ============

interface WatchlistRule {
  id: string;
  network_id: string | null;     // null = global
  priority: 'P0' | 'P1' | 'P2';
  port: number;
  protocol: 'tcp' | 'udp' | 'any';
  note: string;
  enabled: boolean;
  created_by: string;
  created_at: string;
}
```

### Security Plan

| Threat | Mitigation | Implementation |
|--------|------------|----------------|
| **Zip Slip** | Validate all entry paths before extraction | `lib/services/ingest.ts`: reject absolute paths, `..`, symlinks |
| **File size abuse** | Enforce 500MB upload limit | S3 presigned URL with content-length condition |
| **Path traversal** | Sanitize all user-provided paths | `path.basename()`, reject `/` and `..` |
| **SSRF** | No URL-based file fetching | Only accept direct uploads |
| **XSS in exports** | Escape markdown content | Use `DOMPurify` if rendering HTML |
| **S3 credential exposure** | Signed URLs, no public buckets | Presigned URLs expire in 15 min |
| **Least privilege IAM** | Scoped S3 permissions | `s3:PutObject`, `s3:GetObject` on specific prefix only |
| **Rate limiting** | Vercel Edge middleware | 10 uploads/hour/IP, 100 API calls/min/IP |
| **Audit logging** | Log all uploads and comparisons | CloudWatch Logs via API routes |

```typescript
// lib/services/ingest.ts - Zip Slip Prevention

function validateZipEntry(entryName: string): boolean {
  // Reject absolute paths
  if (path.isAbsolute(entryName)) return false;

  // Reject parent traversal
  if (entryName.includes('..')) return false;

  // Reject backslash (Windows paths in *nix)
  if (entryName.includes('\\')) return false;

  // Normalize and verify stays within extraction root
  const normalized = path.normalize(entryName);
  if (normalized.startsWith('..')) return false;

  return true;
}

async function extractZipSafely(zipBuffer: Buffer, targetPrefix: string): Promise<string[]> {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const extractedKeys: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    // SECURITY: Validate every entry path
    if (!validateZipEntry(entry.entryName)) {
      throw new Error(`Unsafe ZIP entry rejected: ${entry.entryName}`);
    }

    const key = `${targetPrefix}/${entry.entryName}`;
    await uploadToS3(key, entry.getData());
    extractedKeys.push(key);
  }

  return extractedKeys;
}
```

---

## Step 4: Repository Structure & Python vs TypeScript Decision

### Recommended Structure

```
psec-baseline-hunter/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Lint, type-check, test
│       └── deploy.yml                # Vercel preview + production
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Redirect to /upload
│   │   ├── globals.css
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx            # Shell with nav sidebar
│   │   │   ├── upload/
│   │   │   │   └── page.tsx
│   │   │   ├── scorecard/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [runId]/page.tsx
│   │   │   └── diff/
│   │   │       ├── page.tsx
│   │   │       └── [runAId]/[runBId]/page.tsx
│   │   │
│   │   └── api/
│   │       ├── upload/
│   │       │   └── route.ts          # Presigned URL generation
│   │       ├── ingest/
│   │       │   └── route.ts          # Extract + detect + parse
│   │       ├── runs/
│   │       │   ├── route.ts          # GET: list runs
│   │       │   └── [runId]/
│   │       │       ├── route.ts      # GET: run details
│   │       │       └── ports/
│   │       │           └── route.ts  # GET: parsed ports
│   │       ├── diff/
│   │       │   └── route.ts          # POST: compute diff
│   │       └── export/
│   │           └── route.ts          # POST: generate reports
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives
│   │   ├── upload/
│   │   │   ├── dropzone.tsx
│   │   │   ├── upload-progress.tsx
│   │   │   └── run-detection-status.tsx
│   │   ├── runs/
│   │   │   ├── network-selector.tsx
│   │   │   ├── run-type-selector.tsx
│   │   │   ├── run-list.tsx
│   │   │   └── run-card.tsx
│   │   ├── scorecard/
│   │   │   ├── port-summary-table.tsx
│   │   │   └── host-metrics.tsx
│   │   ├── diff/
│   │   │   ├── comparison-selector.tsx
│   │   │   ├── diff-summary-metrics.tsx
│   │   │   ├── diff-tabs.tsx
│   │   │   ├── hosts-delta-panel.tsx
│   │   │   ├── ports-delta-table.tsx
│   │   │   ├── risk-flags-panel.tsx
│   │   │   └── export-panel.tsx
│   │   └── layout/
│   │       ├── nav-sidebar.tsx
│   │       ├── page-header.tsx
│   │       └── loading-skeleton.tsx
│   │
│   ├── lib/
│   │   ├── types/
│   │   │   ├── index.ts              # Re-exports
│   │   │   ├── network.ts
│   │   │   ├── run.ts
│   │   │   ├── port.ts
│   │   │   ├── diff.ts
│   │   │   └── api.ts
│   │   │
│   │   ├── parsers/
│   │   │   ├── nmap-xml.ts           # fast-xml-parser
│   │   │   ├── folder-name.ts        # Regex: YYYY-MM-DD_HHMM_type
│   │   │   └── hosts-up.ts           # hosts_up.txt parser
│   │   │
│   │   ├── services/
│   │   │   ├── ingest.ts             # Upload, extract, validate
│   │   │   ├── run-registry.ts       # Run CRUD, deduplication
│   │   │   ├── diff-engine.ts        # Set operations, comparison
│   │   │   ├── risk-rules.ts         # P0/P1/P2 flagging
│   │   │   └── markdown-export.ts    # Report generation
│   │   │
│   │   ├── aws/
│   │   │   ├── s3.ts                 # S3Client wrapper
│   │   │   └── config.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── ip-sort.ts
│   │   │   ├── set-operations.ts
│   │   │   └── hash.ts               # run_uid generation
│   │   │
│   │   └── constants/
│   │       ├── risk-ports.ts
│   │       ├── file-patterns.ts
│   │       └── limits.ts
│   │
│   ├── hooks/
│   │   ├── use-runs.ts
│   │   ├── use-run-details.ts
│   │   ├── use-diff.ts
│   │   └── use-upload.ts
│   │
│   └── store/
│       ├── diff-store.ts             # Zustand
│       └── ui-store.ts
│
├── public/
│   └── favicon.ico
│
├── tests/                            # Vitest tests
│   ├── parsers/
│   │   └── nmap-xml.test.ts
│   ├── services/
│   │   ├── diff-engine.test.ts
│   │   └── risk-rules.test.ts
│   └── fixtures/
│       ├── sample-ports.xml
│       └── sample-hosts-up.txt
│
├── scripts/
│   └── migrate-data.ts               # One-time migration from local data/
│
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── vitest.config.ts
├── .env.example
├── .gitignore
└── README.md
```

### Python vs TypeScript Decision

**Recommendation: Full TypeScript rewrite**

| Factor | Python Worker | TypeScript Rewrite | Winner |
|--------|---------------|-------------------|--------|
| **Deployment complexity** | Need separate Lambda/ECS + cold starts | Single Vercel deployment | **TS** |
| **Type safety** | Runtime type hints only | Compile-time type checking | **TS** |
| **Code volume** | ~700 lines Python | ~800 lines TS (similar) | Tie |
| **XML parsing** | ElementTree (built-in) | fast-xml-parser (well-maintained) | Tie |
| **DataFrame ops** | Pandas (powerful) | Arrays + reduce (sufficient) | Python slight edge |
| **Maintenance** | Two languages, two runtimes | Single codebase | **TS** |
| **Cold start** | Python Lambda: 500-800ms | Vercel Edge: <50ms | **TS** |
| **Team skills** | Requires Python maintainer | Full-stack TS | **TS** |

**Justification:**

1. **The logic is not complex**: The core algorithms are:
   - Regex parsing (identical in both)
   - XML traversal (fast-xml-parser is mature)
   - Set difference (trivial in any language)
   - String concatenation for markdown (trivial)

2. **No heavy computation**: We're not doing ML, numerical analysis, or anything pandas-specific. The "DataFrame" is just arrays of objects with groupBy/filter.

3. **Deployment simplicity**: A Python worker means:
   - Separate AWS Lambda or container
   - Cold start latency
   - Cross-service communication (S3 events or API calls)
   - Two CI pipelines

4. **The Python code is portable**: Looking at `core/diff.py`, the most complex function is `compare_runs()` which is ~40 lines of straightforward logic.

**Exception case (keep Python):**
- If parsing needs to handle >100MB XML files with streaming
- If future features need pandas/numpy (ML-based anomaly detection)
- If existing Python tests/validation must be preserved exactly

---

## Step 5: Build Plan

### Phase 0: Scaffolding & CI/UI Shell

**Duration estimate:** Foundation work

**Tasks:**

| # | Task | DoD |
|---|------|-----|
| 0.1 | Initialize Next.js 14 with App Router + TypeScript | `npm run dev` shows blank page |
| 0.2 | Configure Tailwind CSS + shadcn/ui | Button component renders correctly |
| 0.3 | Set up ESLint + Prettier + strict tsconfig | `npm run lint` passes with no errors |
| 0.4 | Set up Vitest for testing | `npm test` runs sample test |
| 0.5 | Create GitHub Actions CI workflow | PR checks run lint + type-check + test |
| 0.6 | Create dashboard layout shell | Nav sidebar with Upload/Scorecard/Diff links |
| 0.7 | Create page stubs for all routes | Each route renders placeholder content |
| 0.8 | Configure environment variables template | `.env.example` with all required vars |
| 0.9 | Set up Vercel project (preview deployments) | Push to branch → preview URL |

**Definition of Done:**
- `npm run build` succeeds
- Vercel preview deployment works
- Navigate between all 3 pages via sidebar

---

### Phase 1: Upload/Validate/Store/Show Status

**Tasks:**

| # | Task | DoD |
|---|------|-----|
| 1.1 | Configure AWS SDK + S3 client | Can list S3 bucket contents from API route |
| 1.2 | Create `/api/upload` route (presigned URL) | Returns presigned URL with 15min expiry |
| 1.3 | Build Dropzone component with react-dropzone | Drag-drop area accepts .zip files |
| 1.4 | Implement client-side S3 upload with progress | Progress bar shows 0-100% during upload |
| 1.5 | Add ZIP validation (magic bytes, size limit) | Rejects non-ZIP files, files >500MB |
| 1.6 | Add Zip Slip prevention validation | Rejects ZIPs with malicious paths |
| 1.7 | Build upload status display | Shows: uploading → validating → complete/error |
| 1.8 | Write tests for validation logic | 100% coverage on validation functions |

**Definition of Done:**
- Can upload a ZIP file via drag-drop
- Progress bar shows upload progress
- Invalid files rejected with clear error message
- File appears in S3 `uploads/` prefix

---

### Phase 2: Run Detection + Registry + Dedupe

**Tasks:**

| # | Task | DoD |
|---|------|-----|
| 2.1 | Create `/api/ingest` route scaffold | Accepts uploadId, returns placeholder |
| 2.2 | Implement ZIP extraction to S3 | Files extracted to `extracted/{id}/` prefix |
| 2.3 | Port folder name parser (`YYYY-MM-DD_HHMM_type`) | Parses correctly, returns null on invalid |
| 2.4 | Implement run folder detection (scan S3 prefix) | Finds all `rawscans/*` folders |
| 2.5 | Implement key file detection patterns | Identifies ports, hosts_up, discovery files |
| 2.6 | Implement `run_uid` hash generation | SHA256 of network+timestamp+type+ports_hash |
| 2.7 | Build run manifest storage (`runs/{run_uid}/manifest.json`) | Manifest saved to S3 |
| 2.8 | Implement deduplication check | Existing run_uid skips re-processing |
| 2.9 | Create `/api/runs` route (list runs) | Returns all runs, filterable by network |
| 2.10 | Build run list component | Displays runs grouped by network |
| 2.11 | Build run card component | Shows timestamp, type, stats |
| 2.12 | Write tests for folder name parsing | Edge cases: no timestamp, bad format |

**Definition of Done:**
- Upload ZIP → see detected runs in list
- Re-upload same ZIP → no duplicate runs created
- API returns runs filterable by network

---

### Phase 3: Parse Nmap XML + Scorecard

**Tasks:**

| # | Task | DoD |
|---|------|-----|
| 3.1 | Install + configure fast-xml-parser | Can parse sample XML in test |
| 3.2 | Port Nmap XML parser | Extracts all PortFinding fields |
| 3.3 | Store parsed ports JSON to S3 | `runs/{run_uid}/parsed/ports.json` |
| 3.4 | Port hosts_up.txt parser | Extracts IP list |
| 3.5 | Create `/api/runs/[runId]/ports` route | Returns PortFinding[] with pagination |
| 3.6 | Implement top ports aggregation | GroupBy (proto, port, service) → host count |
| 3.7 | Build network selector component | Dropdown populated from /api/runs |
| 3.8 | Build run type selector component | Filters to selected network's run types |
| 3.9 | Build port summary table (TanStack Table) | Sortable columns, pagination |
| 3.10 | Build host metrics display | Cards showing host count, port count |
| 3.11 | Wire up Scorecard page | Full workflow: select run → see analysis |
| 3.12 | Write tests for XML parser | Various Nmap output formats |

**Definition of Done:**
- Select run → see top 25 ports table
- Table is sortable and paginated
- Metrics show correct counts

---

### Phase 4: Diff + Risk Flags + Exports

**Tasks:**

| # | Task | DoD |
|---|------|-----|
| 4.1 | Port set operations utilities | `setDifference()`, `toPortKey()` |
| 4.2 | Implement host diff logic | new_hosts = B - A, removed = A - B |
| 4.3 | Implement port diff logic | Same pattern for PortKey sets |
| 4.4 | Port risk flagging rules | P0/P1/P2 classification |
| 4.5 | Create `/api/diff` route | Accepts runAId, runBId, returns DiffResult |
| 4.6 | Store diff results to S3 | `comparisons/{network}/{a}__VS__{b}/` |
| 4.7 | Build comparison selector component | Presets: "Latest vs Previous" + manual |
| 4.8 | Build diff summary metrics row | 5 metric cards (new hosts, removed, etc.) |
| 4.9 | Build diff tabs component | Summary, Hosts, Ports, Risk, Export |
| 4.10 | Build hosts delta panel | New/removed hosts lists |
| 4.11 | Build ports delta tables | Opened/closed ports with all columns |
| 4.12 | Build risk flags panel | P0/P1/P2 grouped with badges |
| 4.13 | Port CHANGES.md generator | Identical output format |
| 4.14 | Port WATCHLIST.md generator | Identical output format |
| 4.15 | Implement CSV export | Same data as MD, CSV format |
| 4.16 | Build export panel | Download buttons + preview |
| 4.17 | Create `/api/export` route | Generates + returns download URL |
| 4.18 | Wire up Diff page | Full workflow end-to-end |
| 4.19 | Write tests for diff engine | Known inputs → expected outputs |
| 4.20 | Write tests for risk rules | All port classifications |

**Definition of Done:**
- Select two runs → see comparison results
- All 5 tabs show correct data
- Download CHANGES.md matches Python output format
- Download WATCHLIST.md matches Python output format
- CSV export works

---

### Phase 5: Configs + Improved Reporting

**Tasks:**

| # | Task | DoD |
|---|------|-----|
| 5.1 | Design WatchlistRule data model | TypeScript interface finalized |
| 5.2 | Create rules management API routes | CRUD for custom rules |
| 5.3 | Build rules configuration UI | Add/edit/delete risk rules |
| 5.4 | Integrate custom rules into diff engine | Per-network rules override defaults |
| 5.5 | Add comparison history storage | Track past comparisons |
| 5.6 | Build comparison history UI | List past comparisons, re-open |
| 5.7 | Add shareable comparison URLs | `/diff/{runAId}/{runBId}` deep links |
| 5.8 | Improve report formatting | Better markdown tables, sections |
| 5.9 | Add PDF export option | CHANGES.pdf via @react-pdf/renderer |

**Definition of Done:**
- Can create custom P0 rule for port 9000
- Custom rule appears in diff results
- Can share URL to specific comparison
- PDF export generates readable document

---

### Phase 6: Hardening

**Tasks:**

| # | Task | DoD |
|---|------|-----|
| 6.1 | Add rate limiting middleware | 10 uploads/hour, 100 API calls/min |
| 6.2 | Add request logging | All API calls logged with timestamp, IP |
| 6.3 | Add audit logging for uploads | Who uploaded what, when |
| 6.4 | Add audit logging for comparisons | Who compared what, when |
| 6.5 | Implement run deletion | Soft delete with 30-day retention |
| 6.6 | Implement run archival | Move old runs to S3 Glacier |
| 6.7 | Add S3 lifecycle policies | Auto-archive after 90 days |
| 6.8 | Add error tracking (Sentry) | Errors reported with context |
| 6.9 | Add performance monitoring | API latency metrics |
| 6.10 | Security audit | Review all input validation |
| 6.11 | Write deployment documentation | README with setup instructions |
| 6.12 | Create production checklist | Pre-launch verification steps |

**Definition of Done:**
- Rate limiting blocks excessive requests
- Audit logs queryable for last 30 days
- Old runs auto-archived
- Sentry captures errors
- Documentation complete

---

## Step 6: GitHub Issues

### Phase 0 Issues

```markdown
### Issue #1: Initialize Next.js project with TypeScript
**Labels:** phase-0, setup
**Description:**
- Create Next.js 14 project with App Router
- Enable strict TypeScript
- Configure path aliases (@/)
- Verify `npm run dev` works

### Issue #2: Configure Tailwind CSS and shadcn/ui
**Labels:** phase-0, setup, ui
**Description:**
- Install Tailwind CSS
- Initialize shadcn/ui
- Add Button, Card, Tabs components
- Create globals.css with base styles

### Issue #3: Set up linting and formatting
**Labels:** phase-0, dx
**Description:**
- Configure ESLint with Next.js rules
- Add Prettier with Tailwind plugin
- Add lint-staged + husky for pre-commit
- Ensure `npm run lint` passes

### Issue #4: Set up testing with Vitest
**Labels:** phase-0, testing
**Description:**
- Install Vitest + testing-library
- Configure vitest.config.ts
- Add sample test to verify setup
- Add `npm test` script

### Issue #5: Create GitHub Actions CI workflow
**Labels:** phase-0, ci
**Description:**
- Create .github/workflows/ci.yml
- Run lint, type-check, test on PR
- Cache node_modules
- Fail on any error

### Issue #6: Create dashboard layout shell
**Labels:** phase-0, ui
**Description:**
- Create (dashboard) route group
- Build NavSidebar component
- Add Upload, Scorecard, Diff nav links
- Style with Tailwind

### Issue #7: Create page stubs for all routes
**Labels:** phase-0, ui
**Description:**
- Create /upload/page.tsx
- Create /scorecard/page.tsx
- Create /diff/page.tsx
- Add placeholder content to each

### Issue #8: Configure environment variables
**Labels:** phase-0, setup
**Description:**
- Create .env.example with:
  - AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
  - S3_BUCKET
  - NEXT_PUBLIC_APP_URL
- Add .env.local to .gitignore
- Document in README

### Issue #9: Set up Vercel deployment
**Labels:** phase-0, deploy
**Description:**
- Connect GitHub repo to Vercel
- Configure environment variables
- Verify preview deployment on PR
- Verify production deployment on merge to main
```

### Phase 1 Issues (Summary)

```
#10: Configure AWS SDK and S3 client
#11: Create /api/upload route with presigned URLs
#12: Build Dropzone component
#13: Implement S3 upload with progress
#14: Add ZIP validation (magic bytes, size)
#15: Add Zip Slip prevention
#16: Build upload status display
#17: Write validation tests
```

---

## First 3 Commits (Phase 0)

### Commit 1: Initialize Next.js project

```bash
# Commands to run:
npx create-next-app@latest psec-baseline-hunter --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd psec-baseline-hunter

# Files created/modified:
# - package.json
# - tsconfig.json
# - next.config.ts
# - tailwind.config.ts
# - src/app/layout.tsx
# - src/app/page.tsx
# - src/app/globals.css
```

**Commit message:**
```
feat: initialize Next.js 14 with TypeScript and Tailwind

- Create Next.js project with App Router
- Enable strict TypeScript configuration
- Configure Tailwind CSS
- Set up path aliases (@/)
```

### Commit 2: Add shadcn/ui and dashboard layout

```bash
# Commands to run:
npx shadcn@latest init
npx shadcn@latest add button card tabs badge

# Files to create:
# - src/app/(dashboard)/layout.tsx
# - src/components/layout/nav-sidebar.tsx
# - src/components/ui/button.tsx (generated)
# - src/components/ui/card.tsx (generated)
```

**Commit message:**
```
feat: add shadcn/ui and dashboard layout shell

- Initialize shadcn/ui with default theme
- Add Button, Card, Tabs, Badge components
- Create dashboard route group with shared layout
- Build NavSidebar with Upload/Scorecard/Diff links
```

### Commit 3: Add page stubs and CI workflow

```bash
# Files to create:
# - src/app/(dashboard)/upload/page.tsx
# - src/app/(dashboard)/scorecard/page.tsx
# - src/app/(dashboard)/diff/page.tsx
# - .github/workflows/ci.yml
# - .env.example
```

**Commit message:**
```
feat: add page stubs and GitHub Actions CI

- Create Upload, Scorecard, Diff page placeholders
- Add CI workflow (lint, type-check, build)
- Create .env.example with AWS config template
- Update README with setup instructions
```

---

## Verification Plan

1. **Phase 0 complete:** `npm run build` succeeds, Vercel preview works
2. **Phase 1 complete:** Upload ZIP → see in S3, invalid files rejected
3. **Phase 2 complete:** Upload → runs detected and listed, no duplicates
4. **Phase 3 complete:** Select run → see top ports table with correct data
5. **Phase 4 complete:** Compare runs → all tabs work, exports match Python format
6. **Phase 5 complete:** Custom rules work, shareable URLs work
7. **Phase 6 complete:** Rate limits active, audit logs visible, docs complete

**Final acceptance:** Upload `batman_last2.zip`, compare runs, verify CHANGES.md output matches current Python implementation byte-for-byte (excluding timestamps).
