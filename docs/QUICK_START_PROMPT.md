# Quick Start Prompt (Copy into Claude Code)

---

Read the codebase first, then help me implement a "Personalized Plain-English Summary" feature on the Scorecard page.

**What we have:** Working Scorecard showing 12 hosts, 14 ports, 5 risk exposures from a fresh orange-network scan. The data is accurate but reads like a security tool.

**What we need:** A card that lets non-technical users click "Explain this for my situation" and get an LLM-generated report tailored to their technical level, profession (attorney, small business owner, parent), and context (works from home, handles sensitive data, kids at home).

**Key requirements:**
1. Add "Personalized Explanation" card below Analysis Summary on Scorecard page
2. Modal to capture: technical level, profession, context checkboxes, tone
3. API route `POST /api/llm/scorecard-summary` that calls Anthropic/OpenAI
4. **Default to redaction** — don't send IPs/hostnames unless user opts in
5. Fallback to rule-based summary if no API key configured
6. Save preferences to localStorage
7. Output as markdown with Copy/Download buttons

**LLM output sections:**
1. Executive summary (3-5 bullets)
2. Why this matters for you
3. Top 3 actions (do these first)
4. What could happen if ignored
5. What I need from you (questions)
6. Notes / limitations

**Files to create:**
- `src/lib/types/userProfile.ts`
- `src/lib/llm/provider.ts`
- `src/lib/llm/prompt-scorecard.ts`
- `src/app/api/llm/scorecard-summary/route.ts`
- `src/components/scorecard/PersonalizedSummaryCard.tsx`
- `src/components/scorecard/PersonalizedSummaryModal.tsx`
- `src/components/scorecard/MarkdownViewer.tsx`

Start by reading `src/app/(dashboard)/scorecard/page.tsx` and `CLAUDE.md`, then create the types file first.
