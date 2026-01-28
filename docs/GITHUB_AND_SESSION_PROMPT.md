# GitHub Repository Settings

## Short Description (for GitHub GUI)

```
Network security made simple — upload scans, get plain-English explanations tailored to your role (executive, attorney, IT, parent). Detects changes, prioritizes risks, suggests fixes.
```

## Topics/Tags (add these in GitHub)

```
network-security
nmap
cybersecurity
next-js
typescript
home-network
security-scanner
risk-assessment
llm
plain-english
```

## About Section

**Website:** (leave blank or add demo URL when deployed)

**Description:** Network security made simple — upload scans, get plain-English explanations tailored to your role (executive, attorney, IT, parent). Detects changes, prioritizes risks, suggests fixes.

---

# Claude Code Session Prompt: Next Session Planning

Copy this into Claude Code to start your next session:

---

## Session Context

We're building PSEC Baseline Hunter — a network security tool that explains scan results in plain English for non-technical users. The app is functional with these features working:

**Completed:**
- ✅ Upload + ZIP ingestion + Nmap XML parsing
- ✅ Scorecard with risk classification (P0/P1/P2)
- ✅ Personalized Summary Card (LLM + rule-based fallback)
- ✅ Persona modal (technical level, profession, context)
- ✅ Demo mode with sample data
- ✅ Diff view for comparing scans
- ✅ Quick Overview panel with plain-language summaries

**Known Issues:**
- ⚠️ Persona state is disconnected — sidebar doesn't update when persona changes in modal/wizard
- ⚠️ Dashboard page is very large (mixes data fetching, state, presentation)
- ⚠️ Some hardcoded strings in diff summary ("Top 3 Actions Required")

---

## Session Options (Pick One)

### Option A: Fix Persona State (Bug Fix)
**Priority: HIGH — This breaks the demo flow**

The persona selection doesn't sync between:
1. Quick Persona Switch modal
2. Personalize wizard
3. Sidebar header

**Task:** Create unified `PersonaContext` with `usePersona()` hook. Make all three components read/write from the same source. Persist to localStorage.

**Deliverables:**
- `src/context/PersonaContext.tsx`
- Update Sidebar to subscribe to context
- Update modals to use context
- Test: change persona → sidebar updates instantly

---

### Option B: Add "New Device Alert" Feature (Sticky Feature)
**Priority: MEDIUM — High user value**

When comparing scans, prominently surface new devices:
- "New device detected: Apple iPhone (approx)"
- Buttons: "Mark Known" / "Guest" / "Investigate"

**Task:** Add a `NewDeviceAlert` component that appears when diff shows new hosts. Store device labels in localStorage.

**Deliverables:**
- `src/components/dashboard/NewDeviceAlert.tsx`
- Device labeling UI (Known/Guest/Suspicious)
- Persistence of device labels
- Integration with diff view

---

### Option C: Add Fix-It Checklist (Sticky Feature)
**Priority: MEDIUM — Converts insights to action**

Turn recommended actions into a trackable checklist:
- ☐ Disable UPnP on router
- ☐ Block RDP from WAN
- ☑ Update router firmware

**Task:** Create a `FixItChecklist` component tied to findings. Persist completion state.

**Deliverables:**
- `src/components/dashboard/FixItChecklist.tsx`
- Task completion tracking (localStorage)
- Visual progress indicator
- Link tasks to specific findings

---

### Option D: Refactor Dashboard (Code Quality)
**Priority: LOW — Technical debt**

The dashboard page.tsx is too large. Split into:
- Data fetching hooks
- Presentation components
- State management

**Task:** Extract logic into custom hooks and smaller components.

**Deliverables:**
- `src/hooks/useDashboardData.ts`
- `src/hooks/useRunSelection.ts`
- Smaller, focused components
- Same functionality, better structure

---

### Option E: Device Identification (Enhancement)
**Priority: MEDIUM — Improves UX**

Parse `http_titles.xml` and show device names:
- Instead of "192.168.1.45" → "TP-Link Router (192.168.1.45)"
- Add MAC vendor lookup

**Task:** Enhance parser to extract HTTP titles, display in risk exposures.

**Deliverables:**
- Update nmap-parser to handle http_titles.xml
- Display device names in Scorecard
- Fallback gracefully if file missing

---

## My Recommendation

**Start with Option A (Fix Persona State)** — it's a bug that breaks the demo flow and erodes trust. Then move to Option B or C for sticky features.

**Suggested session flow:**
1. Fix persona state (45 min)
2. Quick win: Add "Executive Overview" as default collapsed view (15 min)
3. Start on New Device Alert if time permits

---

## Git Commit Strategy

Commit after each logical change:
```bash
git add -A && git commit -m "feat(persona): add PersonaContext for unified state"
git add -A && git commit -m "fix(sidebar): subscribe to PersonaContext"
git add -A && git commit -m "feat(dashboard): add NewDeviceAlert component"
```

Push to feature branch, then PR to main.

---

## Files to Read First

Before making changes, understand current state:
```bash
# Persona-related
grep -rn "persona\|Persona" src/ --include="*.tsx" | head -20

# Dashboard structure
ls -la src/app/\(dashboard\)/

# Current components
ls -la src/components/scorecard/
```

---

Let me know which option you want to tackle, or if you want to do something else entirely.
