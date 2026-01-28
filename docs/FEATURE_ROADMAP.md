# PSEC Baseline Hunter — Feature Roadmap

> Prioritized feature list based on Codex reviews and "instant value" analysis.
> Updated: January 2026

---

## Guiding Principles

1. **Demo-first** — Every feature should make demos easier, not harder
2. **Plain English** — Non-technical users are the primary audience
3. **Sticky > Shiny** — Build features that bring users back, not just impress once
4. **Incremental** — Ship small, validate, iterate

---

## Priority Tiers

### 🔴 P0: Fix Before Next Demo
Issues that break the demo flow or erode trust.

| Issue | Impact | Effort | Status |
|-------|--------|--------|--------|
| Persona state disconnected (sidebar doesn't update) | High — breaks demo | 2-3 hrs | 🔴 Open |
| Hardcoded "Top 3 Actions" in diff summary | Medium — looks fake | 30 min | 🔴 Open |
| Demo risk score always shows "55 / Fair" | Medium — inconsistent | 30 min | 🔴 Open |

---

### 🟡 P1: High-Impact Features (Next 2-4 Weeks)
Features that add stickiness and differentiation.

| Feature | Why It Matters | Effort | Status |
|---------|---------------|--------|--------|
| **New Device Alert + "Mark Known"** | "Baby monitor" moment — something changed | 4-6 hrs | 📋 Planned |
| **Fix-It Checklist** | Turns insights into action, progress tracking | 4-6 hrs | 📋 Planned |
| **Device Identification** (HTTP titles, MAC vendor) | Makes IPs meaningful | 3-4 hrs | 📋 Planned |
| **One-Click Scan Templates** (Safe/Standard/Deep) | Lowers barrier to generate data | 4-6 hrs | 📋 Planned |
| **3-Step Guided Flow Banner** | Orients non-technical users | 1-2 hrs | 📋 Planned |

---

### 🟢 P2: Enhancement & Polish (Month 2)
Features that improve experience but aren't blockers.

| Feature | Why It Matters | Effort | Status |
|---------|---------------|--------|--------|
| **Executive Overview as default** | Hide tables, show summary first | 2-3 hrs | 📋 Planned |
| **Collapse tables by default** | Reduce cognitive load | 1-2 hrs | 📋 Planned |
| **Risk legend** (Critical/High/Watch instead of P0/P1/P2) | Clearer for non-technical | 1 hr | 📋 Planned |
| **"Why This Matters" micro-lessons** | Education builds trust | 4-6 hrs | 📋 Planned |
| **Share Report for Spouse/IT Friend** | Makes app a communication tool | 2-3 hrs | 📋 Planned |
| **Profession-specific language templates** | Attorney, healthcare, exec framing | 3-4 hrs | 📋 Planned |

---

### 🔵 P3: Future Vision (Month 3+)
Features that create a platform, not just a tool.

| Feature | Why It Matters | Effort | Status |
|---------|---------------|--------|--------|
| **Scheduled Scans + Weekly Digest** | Brings users back automatically | 8-12 hrs | 💭 Idea |
| **Household Device Map** (rooms, owners) | Emotional connection, "my home" | 8-12 hrs | 💭 Idea |
| **Kid Shield Mode** (DNS filtering, unknown device alerts) | Parents pay attention to safety | 12-16 hrs | 💭 Idea |
| **Panic Button Playbook** | "I think something is wrong" response | 6-8 hrs | 💭 Idea |
| **Security Score History** (trend over time) | People come back to see improvement | 6-8 hrs | 💭 Idea |

---

## Feature Details

### New Device Alert (P1)

**What:** When a new host appears in diff, show prominent alert:
```
┌────────────────────────────────────────────────────┐
│ 🆕 New Device Detected                             │
│                                                    │
│ Apple iPhone (192.168.1.47)                        │
│ First seen: Today at 2:30 PM                       │
│                                                    │
│ [Mark Known] [Guest Device] [Investigate]          │
└────────────────────────────────────────────────────┘
```

**Why:** This is the "baby monitor moment" — the app caught something that changed.

**Implementation:**
1. Extract new hosts from diff data
2. Create `NewDeviceAlert.tsx` component
3. Add device labeling with localStorage persistence
4. Show alert above diff tables

---

### Fix-It Checklist (P1)

**What:** Turn recommended actions into trackable tasks:
```
┌────────────────────────────────────────────────────┐
│ 📋 Your Security Tasks (2 of 5 complete)           │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━          │
│ [============================-------] 60%          │
│                                                    │
│ ☑ Block RDP from WAN                               │
│ ☑ Update router firmware                           │
│ ☐ Disable UPnP on router                           │
│ ☐ Move IoT devices to guest VLAN                   │
│ ☐ Change default admin password                    │
└────────────────────────────────────────────────────┘
```

**Why:** People love checking boxes. Progress feels like the app is working with them.

**Implementation:**
1. Create `FixItChecklist.tsx` component
2. Map findings → tasks automatically
3. Persist completion state to localStorage
4. Show progress bar

---

### One-Click Scan Templates (P1)

**What:** Big button that generates scan command with presets:
```
┌────────────────────────────────────────────────────┐
│ 🔍 Scan Your Network                               │
│                                                    │
│ [🟢 Quick Check]  [🟡 Standard]  [🔴 Deep Scan]    │
│    ~2 min           ~5 min         ~15 min         │
│                                                    │
│ Network: 192.168.1.0/24 (auto-detected)            │
│ [Copy Command]  [Download Script]                  │
└────────────────────────────────────────────────────┘
```

**Why:** Becomes a ritual — "tap → reassurance."

**Implementation:**
1. Add scan template modal to Upload page
2. Auto-detect network range (or let user input)
3. Generate PowerShell/bash commands
4. Offer downloadable script

---

### 3-Step Guided Flow Banner (P1)

**What:** Thin stepper at top of each page:
```
┌────────────────────────────────────────────────────┐
│ Step 1: Upload ──▶ Step 2: Review ──▶ Step 3: Act  │
│   [Done]              [Current]          [Next]    │
└────────────────────────────────────────────────────┘
```

**Why:** Orients non-technical users, makes flow obvious.

**Implementation:**
1. Create `GuidedFlowBanner.tsx` component
2. Track current step via route
3. Add to dashboard layout

---

## Codex Review Summary (Key Themes)

### Consistent Feedback Across All Reviews:

1. **Dashboard is too large** — Split into hooks and smaller components
2. **Personalized explanations are the differentiator** — Surface them first
3. **Demo mode is well-designed** — Make it the default for first-time users
4. **Tables should be collapsed by default** — Summary → Actions → Details
5. **Professional language translation works** — Expand templates for attorney, healthcare, exec
6. **Hardcoded values erode trust** — Dynamic data everywhere

### Architecture Recommendations:

- Extract export logic from UI layer into templates
- Replace custom dropdowns with accessible select components
- Move async flows into custom hooks
- Use single state management for persona (context or zustand)

---

## Next 3 Sessions Plan

### Session 1: Bug Fixes + Quick Wins
- [ ] Fix persona state disconnection
- [ ] Replace hardcoded "Top 3 Actions"
- [ ] Fix demo mode risk score
- [ ] Add 3-step guided flow banner
- **Commit:** `fix(persona): unify state + quick UX wins`

### Session 2: Sticky Feature #1
- [ ] New Device Alert component
- [ ] Device labeling (Known/Guest/Suspicious)
- [ ] localStorage persistence for labels
- **Commit:** `feat(devices): add new device alerts with labeling`

### Session 3: Sticky Feature #2
- [ ] Fix-It Checklist component
- [ ] Task completion tracking
- [ ] Progress visualization
- **Commit:** `feat(tasks): add fix-it checklist with progress`

---

## Success Metrics

### Demo Quality
- [ ] Can complete a demo in under 3 minutes
- [ ] Non-technical user understands value without explanation
- [ ] No "blank screens" or placeholder data

### Stickiness
- [ ] Users return within 7 days (measure via local telemetry)
- [ ] Users complete at least 2 fix-it tasks
- [ ] Users label at least 1 device

### Code Quality
- [ ] Dashboard page < 300 lines
- [ ] All components have TypeScript types
- [ ] No ESLint errors

---

*Last updated: January 27, 2026*
