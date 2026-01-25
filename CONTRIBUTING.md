# Contributing to PSEC Baseline Hunter

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

---

## Table of Contents

1. [Development Setup](#development-setup)
2. [Project Architecture](#project-architecture)
3. [Coding Standards](#coding-standards)
4. [Git Workflow](#git-workflow)
5. [Adding Features](#adding-features)
6. [Testing](#testing)
7. [Documentation](#documentation)

---

## Development Setup

### Prerequisites

| Tool | Version | Check Command |
|------|---------|---------------|
| Node.js | 20+ | `node --version` |
| npm | 10+ | `npm --version` |
| Git | Any | `git --version` |

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/itprodirect/psec-baseline-hunter.git
cd psec-baseline-hunter

# Install dependencies
npm install

# Create data directories
mkdir -p data/uploads data/extracted

# Start development server
npm run dev
```

### Useful Commands

```bash
npm run dev           # Start dev server (http://localhost:3000)
npm run build         # Production build
npm run lint          # Run ESLint
npx tsc --noEmit      # Type check
```

---

## Project Architecture

### Directory Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Dashboard route group
│   │   ├── layout.tsx      # Shared dashboard layout
│   │   ├── upload/         # Upload page
│   │   ├── scorecard/      # Scorecard page
│   │   └── diff/           # Diff page
│   └── api/                # API route handlers
│       ├── upload/         # POST /api/upload
│       ├── ingest/         # POST /api/ingest
│       ├── runs/           # GET /api/runs
│       └── parse/          # POST /api/parse
├── components/
│   ├── ui/                 # shadcn/ui primitives (don't modify)
│   ├── layout/             # Layout components
│   └── upload/             # Feature-specific components
└── lib/
    ├── types/              # TypeScript interfaces
    ├── constants/          # Configuration values
    ├── services/           # Business logic
    └── utils/              # Helper functions
```

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/types/index.ts` | Core TypeScript interfaces |
| `src/lib/services/ingest.ts` | Run detection and ZIP handling |
| `src/lib/services/nmap-parser.ts` | Nmap XML parsing |
| `src/lib/constants/file-patterns.ts` | File patterns and configuration |

### Data Flow

```
Upload → Validation → Extraction → Detection → Parsing → Display
   │          │            │           │          │         │
   └──────────┴────────────┴───────────┴──────────┴─────────┘
                    All handled by /api/* routes
```

---

## Coding Standards

### TypeScript

- Use strict TypeScript (`"strict": true` in tsconfig.json)
- Define interfaces in `src/lib/types/`
- Avoid `any` - use `unknown` if type is truly unknown
- Use type guards for runtime type checking

```typescript
// Good
interface RunMeta {
  runFolder: string;
  timestamp: Date | null;
  runType: string;
}

// Avoid
const data: any = response.json();
```

### React Components

- Use functional components with hooks
- Place page components in `src/app/(dashboard)/`
- Place reusable components in `src/components/`
- Use "use client" directive only when needed

```typescript
// Client component (needs interactivity)
"use client";

import { useState } from "react";

export function InteractiveComponent() {
  const [state, setState] = useState(false);
  // ...
}

// Server component (default, no directive needed)
export function StaticComponent() {
  // No hooks, no browser APIs
}
```

### API Routes

- Use Next.js App Router route handlers
- Return typed responses
- Handle errors gracefully

```typescript
// src/app/api/example/route.ts
import { NextRequest, NextResponse } from "next/server";

interface ExampleResponse {
  success: boolean;
  data?: SomeType;
  error?: string;
}

export async function GET(): Promise<NextResponse<ExampleResponse>> {
  try {
    const data = await fetchData();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to fetch" },
      { status: 500 }
    );
  }
}
```

### Styling

- Use Tailwind CSS utilities
- Use shadcn/ui components when available
- Keep custom CSS minimal

```tsx
// Good - Tailwind utilities
<div className="flex items-center gap-4 p-4 rounded-lg bg-muted">

// Avoid - custom CSS
<div style={{ display: 'flex', alignItems: 'center' }}>
```

---

## Git Workflow

### Branch Naming

```
feature/phase{N}-{description}    # New features by phase
feature/{description}             # General features
fix/{description}                 # Bug fixes
docs/{description}                # Documentation only
```

Examples:
- `feature/phase2-run-registry`
- `feature/csv-export`
- `fix/xml-parsing-error`
- `docs/api-documentation`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructuring
- `test`: Adding tests
- `chore`: Maintenance

Examples:
```
feat(upload): add drag-and-drop file upload
fix(parser): handle empty XML files gracefully
docs(readme): add quick start guide
refactor(ingest): simplify run detection logic
```

### Pull Request Process

1. Create feature branch from `main`
2. Make changes with descriptive commits
3. Ensure `npm run lint` and `npx tsc --noEmit` pass
4. Create PR with description of changes
5. Request review
6. Squash and merge when approved

---

## Adding Features

### Adding a New Page

1. Create directory: `src/app/(dashboard)/pagename/`
2. Add `page.tsx` with component
3. Update navigation in `src/components/layout/nav-sidebar.tsx`

### Adding a New API Route

1. Create directory: `src/app/api/routename/`
2. Add `route.ts` with handlers
3. Add types to `src/lib/types/index.ts`

### Adding a New Service

1. Create file: `src/lib/services/servicename.ts`
2. Export functions (not classes)
3. Add tests if complex logic

### Adding a New Component

1. Determine scope:
   - Reusable: `src/components/ui/` or `src/components/common/`
   - Feature-specific: `src/components/featurename/`
2. Create component file
3. Export from directory index if needed

---

## Testing

### Current State

No test framework is currently configured. Tests are planned for Phase 6.

### Future Testing Strategy

```bash
# Unit tests (planned)
npm test

# E2E tests (planned)
npm run test:e2e
```

### Manual Testing Checklist

Before submitting a PR:

- [ ] `npm run lint` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` succeeds
- [ ] Feature works in browser
- [ ] No console errors
- [ ] Tested with sample ZIP file

---

## Documentation

### When to Update Docs

| Change | Update |
|--------|--------|
| New feature | README.md, ROADMAP.md |
| API change | CLAUDE.md, relevant docs |
| Breaking change | CHANGELOG.md, README.md |
| Bug fix | CHANGELOG.md |
| Architecture change | PROJECT_STATUS.md, MIGRATION_PLAN.md |

### Documentation Files

| File | Purpose | When to Update |
|------|---------|----------------|
| `README.md` | Project overview | Major features, setup changes |
| `CHANGELOG.md` | Version history | Every release |
| `CLAUDE.md` | Developer reference | Architecture changes |
| `docs/ROADMAP.md` | Feature plans | Planning sessions |
| `docs/PROJECT_STATUS.md` | Current state | After each phase |
| `docs/SCANNING_GUIDE.md` | User guide | UX changes |

---

## Questions?

- Check existing documentation in `docs/`
- Review recent commits for patterns
- Open an issue for discussion

---

*Thank you for contributing to PSEC Baseline Hunter!*
