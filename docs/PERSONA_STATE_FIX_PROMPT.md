# Claude Code: Fix Persona State Disconnection

## The Bug

We added a Persona feature with multiple UI entry points, but the state is disconnected:

**Components involved:**
1. **Quick Persona Switch modal** — 4 cards (Executive / Security / Legal / Operations)
2. **Personalize Your Security Report wizard** — multi-step popup (Steps 1-4)
3. **Sidebar persona header** — shows current persona (e.g., "Attorney / Law Firm" + "Somewhat Technical")

**What's broken:**
- Changing persona in the modal/wizard does NOT update the sidebar
- Sidebar appears to read from a different state than the modal/wizard writes to
- Inconsistent behavior depending on which UI you use to change persona

**Repro:**
1. Go to `/scorecard`
2. Open Quick Persona Switch → select "Operations"
3. Observe: modal shows selection, but sidebar still shows old persona
4. Try the wizard instead → same problem

---

## Root Cause Investigation

Before fixing, trace the current state flow:

```
1. Find where persona state is stored:
   - Search for "persona" in src/
   - Look for useState, useContext, zustand stores, localStorage calls

2. Check each component's state source:
   - Sidebar.tsx (or layout component) — where does it READ persona?
   - PersonaModal.tsx / QuickPersonaSwitch — where does it WRITE persona?
   - PersonalizedSummaryModal.tsx (wizard) — where does it WRITE persona?

3. Look for these red flags:
   - Multiple useState() calls for persona in different components
   - localStorage.getItem() without a reactive subscription
   - Server component reading state (missing "use client")
   - useEffect that only runs on mount (empty deps array)
```

---

## The Fix: Single Source of Truth

### Option A: React Context (simpler)

Create `src/context/PersonaContext.tsx`:

```tsx
"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface UserProfile {
  technicalLevel: 'non_technical' | 'some_technical' | 'technical';
  professionOrRole: string;
  context: string[];
  audience: 'self' | 'spouse_family' | 'IT_vendor' | 'executive_summary';
  tone: 'concise' | 'normal' | 'detailed';
  includeSensitiveDetails: boolean;
}

const DEFAULT_PROFILE: UserProfile = {
  technicalLevel: 'non_technical',
  professionOrRole: '',
  context: [],
  audience: 'self',
  tone: 'normal',
  includeSensitiveDetails: false,
};

interface PersonaContextType {
  profile: UserProfile;
  setProfile: (profile: UserProfile) => void;
  updateProfile: (partial: Partial<UserProfile>) => void;
  resetProfile: () => void;
}

const PersonaContext = createContext<PersonaContextType | null>(null);

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount (client-side only)
  useEffect(() => {
    const saved = localStorage.getItem('psec-user-profile');
    if (saved) {
      try {
        setProfileState(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved profile:', e);
      }
    }
    setIsHydrated(true);
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem('psec-user-profile', JSON.stringify(profile));
    }
  }, [profile, isHydrated]);

  const setProfile = (newProfile: UserProfile) => {
    setProfileState(newProfile);
  };

  const updateProfile = (partial: Partial<UserProfile>) => {
    setProfileState(prev => ({ ...prev, ...partial }));
  };

  const resetProfile = () => {
    setProfileState(DEFAULT_PROFILE);
    localStorage.removeItem('psec-user-profile');
  };

  return (
    <PersonaContext.Provider value={{ profile, setProfile, updateProfile, resetProfile }}>
      {children}
    </PersonaContext.Provider>
  );
}

export function usePersona() {
  const context = useContext(PersonaContext);
  if (!context) {
    throw new Error('usePersona must be used within PersonaProvider');
  }
  return context;
}
```

### Option B: Zustand (if you prefer stores)

```tsx
// src/stores/usePersonaStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Same interface, but with zustand persist middleware
```

---

## Implementation Steps (with Git Commits)

### Step 1: Investigate current state
```bash
# Before changing anything, understand what we have
grep -r "persona" src/ --include="*.tsx" --include="*.ts" | head -50
```

**Commit checkpoint:** None yet (just investigation)

---

### Step 2: Create the unified context

1. Create `src/context/PersonaContext.tsx` (code above)
2. Wrap the app in `PersonaProvider` (in layout or providers file)

```bash
git add src/context/PersonaContext.tsx
git commit -m "feat(persona): add PersonaContext for unified state management"
```

---

### Step 3: Update Sidebar to use context

Find the Sidebar component and replace any local state with `usePersona()`:

```tsx
"use client";

import { usePersona } from '@/context/PersonaContext';

export function Sidebar() {
  const { profile } = usePersona();
  
  // Now profile is reactive — updates when context changes
  return (
    <div>
      <span>{profile.professionOrRole || 'Not set'}</span>
      <span>{profile.technicalLevel}</span>
    </div>
  );
}
```

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "fix(sidebar): subscribe to PersonaContext for reactive updates"
```

---

### Step 4: Update Quick Persona Switch modal

Replace local state with context:

```tsx
"use client";

import { usePersona } from '@/context/PersonaContext';

export function QuickPersonaSwitch() {
  const { profile, updateProfile } = usePersona();
  
  const handleSelect = (persona: string) => {
    // Map persona card to profile fields
    updateProfile({ 
      professionOrRole: persona,
      // ... other fields based on selection
    });
  };
  
  // ...
}
```

```bash
git add src/components/scorecard/QuickPersonaSwitch.tsx
git commit -m "fix(persona-modal): write to PersonaContext instead of local state"
```

---

### Step 5: Update Wizard modal

Same pattern — use `usePersona()` hook:

```bash
git add src/components/scorecard/PersonalizedSummaryModal.tsx
git commit -m "fix(wizard): unify persona state with PersonaContext"
```

---

### Step 6: Verify hydration safety

Make sure components that use persona are marked `"use client"` and handle the initial render gracefully:

```tsx
// In any component using persona
const { profile } = usePersona();

// Optionally show skeleton during hydration
if (!profile) return <PersonaSkeleton />;
```

```bash
git add -A
git commit -m "fix(persona): ensure hydration-safe rendering across components"
```

---

### Step 7: Final integration test

```bash
# Test the fix
npm run dev

# Manual test checklist:
# [ ] Change persona via Quick Switch → sidebar updates immediately
# [ ] Change persona via Wizard → sidebar updates immediately
# [ ] Refresh page → persona persists from localStorage
# [ ] Clear localStorage → defaults load correctly
```

```bash
git add -A
git commit -m "feat(persona): complete unified state implementation

- Added PersonaContext with localStorage persistence
- Sidebar now subscribes to context (reactive updates)
- Quick Switch and Wizard both write to same state
- Hydration-safe with client-side loading"
```

---

## Sanity Checklist (Acceptance Criteria)

- [ ] Persona is stored in ONE place (PersonaContext or Zustand store)
- [ ] Quick Switch modal writes to that store
- [ ] Wizard writes to that store  
- [ ] Sidebar READS from that store (subscribed, not just on mount)
- [ ] localStorage persists the selection
- [ ] Page refresh loads persisted persona
- [ ] No hydration mismatch warnings in console

---

## Files to Inspect First

Run this to find all persona-related code:

```bash
grep -rn "persona\|Persona\|profile\|Profile" src/ --include="*.tsx" | grep -v node_modules
```

Then specifically check:
- `src/components/layout/Sidebar.tsx` (or wherever sidebar lives)
- `src/components/scorecard/PersonalizedSummaryModal.tsx`
- `src/components/scorecard/QuickPersonaSwitch.tsx` (if separate)
- `src/components/scorecard/PersonalizedSummaryCard.tsx`
- Any existing context or store files

Report back what you find and we'll confirm the fix approach.
