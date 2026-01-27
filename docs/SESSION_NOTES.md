# Session Notes - PSEC Baseline Hunter Migration

## Session: 2026-01-26

**Duration:** Single session
**Goal:** Implement personalized plain-English summaries and persona system
**Outcome:** Phase 3 complete - Personalized Summaries v0.3.0

---

### What Was Accomplished

#### 1. Personalized Plain-English Summaries

Implemented LLM-powered explanations that adapt to user profile:

**New Files Created:**
- `src/lib/types/userProfile.ts` - User profile types (technical level, profession, context, tone)
- `src/lib/llm/provider.ts` - LLM abstraction supporting Anthropic Claude and OpenAI
- `src/lib/llm/prompt-scorecard.ts` - Prompt templates for scorecard summaries
- `src/lib/llm/prompt-diff.ts` - Prompt templates for diff summaries
- `src/app/api/llm/scorecard-summary/route.ts` - API endpoint for scorecard explanations
- `src/app/api/llm/diff-summary/route.ts` - API endpoint for diff explanations
- `src/components/ui/dialog.tsx` - shadcn Dialog component
- `src/components/scorecard/MarkdownViewer.tsx` - Markdown display with copy/download
- `src/components/scorecard/PersonalizedSummaryModal.tsx` - 4-step profile capture wizard
- `src/components/scorecard/PersonalizedSummaryCard.tsx` - "Explain This" card for Health Overview
- `src/components/diff/PersonalizedDiffCard.tsx` - "Explain This" card for Changes page

**Key Features:**
- Dual LLM support (Anthropic preferred, OpenAI fallback)
- Rule-based fallback when no API key configured
- Privacy-first (IPs redacted by default, opt-in to include)
- Markdown output with copy/download buttons

#### 2. Persona System

Created shared persona state management:

**New Files:**
- `src/lib/context/persona-context.tsx` - React Context for user profile
- `src/components/layout/persona-toggle.tsx` - Sidebar persona viewer

**Key Features:**
- Profile persisted to localStorage
- Shared across all pages via Context
- Sidebar displays current profile (viewer-only with guidance)
- Profile captured via wizard modal on main pages

#### 3. Page Renames (UX Improvement)

Updated navigation and page titles:
- Upload → "Start Scan Review"
- Scorecard → "Health Overview"
- Diff → "Changes"

#### 4. Bug Fixes

**Persona State Synchronization:**
- Fixed: Changing persona in modal didn't update sidebar
- Solution: Updated modal to use `usePersona()` hook instead of local state

**CI Build Failures:**
- Fixed: `let html` should be `const html` in MarkdownViewer.tsx
- Fixed: setState in useEffect issue in persona-context.tsx (refactored to lazy initialization)
- Fixed: Removed unused imports and variables

---

### Git History

```
main branch:
├── ead531a Merge pull request #6 from itprodirect/feature/phase2-run-registry
├── 9028544 fix: remove remaining setUploadPath calls
├── d4dcf16 fix: resolve ESLint errors and warnings for CI
├── ebbdd2d feat: add single-page dashboard and demo mode (Phase 3)
└── ... (personalized summaries commits)
```

---

### Technical Notes

#### LLM Provider Selection

```typescript
// Environment variables checked in order:
1. ANTHROPIC_API_KEY → Uses Claude claude-sonnet-4-20250514
2. OPENAI_API_KEY → Uses GPT-4o
3. Neither → Falls back to rule-based summary
```

#### Persona Context Pattern

Used lazy initialization to avoid useEffect setState issues:

```typescript
function getInitialProfile(): { profile: UserProfile; hasProfile: boolean } {
  if (typeof window === "undefined") {
    return { profile: DEFAULT_USER_PROFILE, hasProfile: false };
  }
  const saved = localStorage.getItem(USER_PROFILE_STORAGE_KEY);
  // ... parse and return
}

const [{ profile, hasProfile }, setProfileData] = useState(() => getInitialProfile());
```

---

### Files Changed This Session

| File | Change |
|------|--------|
| `src/lib/types/userProfile.ts` | Created |
| `src/lib/llm/provider.ts` | Created |
| `src/lib/llm/prompt-scorecard.ts` | Created |
| `src/lib/llm/prompt-diff.ts` | Created |
| `src/lib/context/persona-context.tsx` | Created |
| `src/app/api/llm/scorecard-summary/route.ts` | Created |
| `src/app/api/llm/diff-summary/route.ts` | Created |
| `src/components/ui/dialog.tsx` | Created |
| `src/components/scorecard/MarkdownViewer.tsx` | Created |
| `src/components/scorecard/PersonalizedSummaryModal.tsx` | Created |
| `src/components/scorecard/PersonalizedSummaryCard.tsx` | Created |
| `src/components/diff/PersonalizedDiffCard.tsx` | Created |
| `src/components/layout/persona-toggle.tsx` | Created |
| `src/components/layout/nav-sidebar.tsx` | Updated (page renames, persona display) |
| `src/app/(dashboard)/layout.tsx` | Updated (added PersonaProvider) |
| `src/app/(dashboard)/scorecard/page.tsx` | Updated (added summary card, title) |
| `src/app/(dashboard)/diff/page.tsx` | Updated (added summary card, title) |
| `src/app/(dashboard)/upload/page.tsx` | Updated (title) |

---

### Next Session: Phase 4 Tasks

1. **Wire Diff to Real Data**
   - Connect Changes page to actual parsed run data
   - Implement run selector for baseline + comparison
   - Compute real host/port differences

---

## Session: 2026-01-25

**Duration:** Single session
**Goal:** Plan and begin Streamlit → Next.js migration
**Outcome:** Phase 0 complete, comprehensive plan documented

---

## What Was Accomplished

### 1. Codebase Analysis

Thoroughly explored the existing Streamlit application:

**Files Analyzed:**
- `app/Home.py` (125 lines) - ZIP upload, run detection
- `app/pages/2_Scorecard.py` (59 lines) - Single run analysis
- `app/pages/3_Diff.py` (244 lines) - Run comparison, tabs, export
- `core/ingest.py` (168 lines) - Upload, extract, detect runs
- `core/nmap_parse.py` (83 lines) - XML parsing to DataFrames
- `core/diff.py` (449 lines) - Comparison engine, risk flags, markdown export
- `requirements.txt` - 45 Python dependencies
- `CLAUDE.md` - Project documentation
- `NOTES_SESSION3.md` - Known issues documentation

**Key Findings:**
- Run folder naming: `YYYY-MM-DD_HHMM_{run_type}`
- Risk ports: P0 (23, 445, 3389, etc.), P1 (8080, 8443, 8888), P2 (22, 80, 443)
- Data flow: ZIP → extract → detect runs → parse XML → compare → export
- Known issues: Run identity collisions, no deduplication, local filesystem only

### 2. Architecture Design

Created comprehensive migration plan with:
- Text architecture diagrams (Client → Vercel → AWS)
- 7-stage file ingest pipeline with deduplication
- Data model (7 entities: Network, ScanRun, Host, PortFinding, DiffResult, Report, WatchlistRule)
- Security plan (Zip Slip prevention, rate limiting, least privilege IAM)
- API route specifications (6 endpoints)

### 3. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Python vs TypeScript | TypeScript rewrite | Single deployment, no cold starts, type safety |
| Authentication | None needed | Internal tool |
| Storage | AWS S3 | User has AWS ready |
| State management | SWR + Zustand | Server vs client state separation |
| Components | shadcn/ui | Modern, accessible, customizable |

### 4. Phase 0 Implementation

Created Next.js project structure:

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Dashboard shell
│   │   ├── upload/page.tsx     # Upload page stub
│   │   ├── scorecard/page.tsx  # Scorecard page stub
│   │   └── diff/page.tsx       # Diff page with tabs
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Redirect to /upload
│   └── globals.css
├── components/
│   ├── layout/nav-sidebar.tsx  # Navigation
│   └── ui/                     # shadcn components
└── lib/utils.ts
```

**Also created:**
- `.github/workflows/ci.yml` - Lint, type-check, build
- `.env.example` - AWS configuration template
- Updated `.gitignore` for Node.js

### 5. Git History

```
feature/nextjs-migration branch:
└── 70f38f1 feat: add Next.js scaffolding with shadcn/ui dashboard (Phase 0)
```

---

## User Preferences Confirmed

1. **No authentication** - Internal tool, anyone with access can use
2. **AWS ready** - Has existing AWS account, can create S3 buckets
3. **All three pages** - Full feature parity with Streamlit (Upload, Scorecard, Diff)

---

## Technical Notes

### Windows/Git Bash Environment

- Node.js: 22.14.0
- npm: 11.1.0 (via npx)
- npx: Requires full path `/c/Program Files/nodejs/npx.cmd` for reliable execution
- Bash profile has harmless conda error (conda not installed)

### Next.js Configuration

- Next.js 16.1.4 with Turbopack
- Workspace root warning due to multiple package-lock.json files (user home dir)
- Build and lint passing

### ESLint Configuration

Updated `eslint.config.mjs` to ignore:
- `.venv/**` (Python virtualenv with JS files)
- `app/**`, `core/**`, `scripts/**`, `tests/**` (legacy Python)

---

## Files Created This Session

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/layout.tsx` | Dashboard layout with sidebar |
| `src/app/(dashboard)/upload/page.tsx` | Upload page stub |
| `src/app/(dashboard)/scorecard/page.tsx` | Scorecard page stub |
| `src/app/(dashboard)/diff/page.tsx` | Diff page stub with tabs |
| `src/app/page.tsx` | Root redirect to /upload |
| `src/app/layout.tsx` | Updated metadata |
| `src/components/layout/nav-sidebar.tsx` | Navigation sidebar |
| `src/components/ui/*.tsx` | shadcn components (6 files) |
| `src/lib/utils.ts` | cn() utility |
| `.github/workflows/ci.yml` | CI pipeline |
| `.env.example` | Environment template |
| `docs/PROJECT_STATUS.md` | Project status overview |
| `docs/MIGRATION_PLAN.md` | Full migration plan |
| `docs/RESOURCES_NEEDED.md` | Setup resources |
| `docs/SESSION_NOTES.md` | This file |

---

## Next Session: Phase 1 Tasks

1. **Configure AWS SDK**
   ```bash
   npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner
   ```
   - Create `src/lib/aws/s3.ts`

2. **Create /api/upload route**
   - `src/app/api/upload/route.ts`
   - Return presigned URL for direct S3 upload

3. **Build Dropzone component**
   ```bash
   npm install react-dropzone
   ```
   - Create `src/components/upload/dropzone.tsx`

4. **Implement upload with progress**
   - Track 0-100% progress
   - Update Upload page UI

5. **Add ZIP validation**
   ```bash
   npm install adm-zip && npm install -D @types/adm-zip
   ```
   - Magic bytes check
   - Size limit (500MB)
   - Zip Slip prevention

---

## Commands to Resume

```bash
# Navigate to project
cd C:\Users\user\Desktop\psec-baseline-hunter

# Ensure on correct branch
git checkout feature/nextjs-migration

# Check status
git status
npm run build

# Start development
npm run dev
```

---

## Reference: Original Python Functions to Port

### From `core/ingest.py`
- `save_upload()` → `/api/upload` route
- `extract_zip()` → `/api/ingest` route
- `detect_run_folders()` → `src/lib/services/ingest.ts`
- `find_key_files()` → `src/lib/constants/file-patterns.ts`
- `_parse_run_folder_name()` → `src/lib/parsers/folder-name.ts`

### From `core/nmap_parse.py`
- `parse_ports()` → `src/lib/parsers/nmap-xml.ts` (use fast-xml-parser)
- `top_ports()` → same file, array reduce operations

### From `core/diff.py`
- `discover_runs()` → `src/lib/services/run-registry.ts`
- `compare_runs()` → `src/lib/services/diff-engine.ts`
- `risk_flags()` → `src/lib/services/risk-rules.ts`
- `render_changes_md()` → `src/lib/services/markdown-export.ts`
- `render_watchlist_md()` → same file
- `RISK_PORTS` → `src/lib/constants/risk-ports.ts`
