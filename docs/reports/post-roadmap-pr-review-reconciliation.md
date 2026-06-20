# Post-Roadmap PR Review Reconciliation

Date: 2026-06-20
Branch: `codex/post-roadmap-review-reconciliation`
Current-main audit base: `origin/main` at `2630bf4fce413e8323ad8947c48b3ca1cf950d35`

## Assumptions Before Editing

- Current `origin/main`, not old PR diffs or notifications, is the source of truth.
- Exact content-hash observation dedupe remains the first duplicate check.
- Stable matching `batch.sourceRunUid` is valid compatibility evidence for same-run dedupe.
- `observationId` alone is not stable identity when either bundle has a different stable source run UID.
- Non-week Network Statements should not show week-specific coverage warnings or collection actions.
- Free-form Network Statement text may include user or source notes and must redact IPv4 and common MAC formats before JSON, print, or Markdown output.
- PR #40's privacy and evidence UX notes remain non-blocking for local single-user dogfooding and belong in a focused follow-up issue, not a hosted-access redesign in this cleanup.

## Audit Matrix

| PR | Review-comment URL | Priority | Concise finding | Current-main status | Evidence | Action taken or follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| #37 | https://github.com/itprodirect/psec-baseline-hunter/pull/37#discussion_r3440200122 | P2 | Missing expected low-weight sources could still mark an Observation Bundle complete. | resolved | Follow-up commit `7279c75`; current tests `observation bundle adapter treats missing optional artifacts as partial coverage`, `observation bundle adapter marks runs partial when only ARP or metadata is missing`, and `observation registry records preserve metadata and classify partial observations`. | No code change. Proven resolved on current main. |
| #37 | https://github.com/itprodirect/psec-baseline-hunter/pull/37#discussion_r3440200125 | P2 | Imported invalid/missing/negative port values were coerced to port 0. | resolved | Follow-up commit `7279c75`; current test `observation bundle import drops invalid open ports but preserves boundary ports`. | No code change. Proven resolved on current main. |
| #37 | https://github.com/itprodirect/psec-baseline-hunter/pull/37#discussion_r3440200127 | P2 | Sanitized text did not block all absolute filesystem paths. | resolved | Follow-up commit `7279c75`; current tests `observation bundle scan metadata sanitizes path-shaped target and collector fields`, `observation bundle import drops absolute paths from text fields without dropping safe values`, and `observation registry sanitizes imports before persistence and omits unsafe bodies`. | No code change. Proven resolved on current main. |
| #38 | https://github.com/itprodirect/psec-baseline-hunter/pull/38#discussion_r3444334082 | P2 | Offset-less or invalid bundle timestamps could be sanitized before save. | resolved | Follow-up commit `67e301f`; current `registerObservationBundle` calls `assertRegistryImportTimestamps` before sanitization, and test `observation registry rejects ambiguous or invalid import timestamps before persistence` covers missing, offset-less, malformed, and invalid timestamps. | No code change. Proven resolved on current main. |
| #38 | https://github.com/itprodirect/psec-baseline-hunter/pull/38#discussion_r3444334089 | P2 | Raw scan bodies in ID fields could be normalized before raw-body detection. | resolved | Follow-up commit `67e301f`; current tests `observation registry sanitizes imports before persistence and omits unsafe bodies` and `observations API imports, reads, lists, and returns safe bounded errors` cover raw XML and normalized raw-scan ID markers in registry/API output. | No code change. Proven resolved on current main. |
| #39 | https://github.com/itprodirect/psec-baseline-hunter/pull/39#discussion_r3444667609 | P2 | Hostname/vendor-only matches were treated as confirmed identity. | resolved | PR #39 final clean Codex review at https://github.com/itprodirect/psec-baseline-hunter/pull/39#issuecomment-4755352021 for commit `cd9bfc2`; current tests `observation comparison keeps unique hostname vendor evidence uncertain` and `observation comparison keeps hostname vendor evidence with different MAC and IP uncertain`. | No code change. Proven resolved on current main. |
| #39 | https://github.com/itprodirect/psec-baseline-hunter/pull/39#discussion_r3444729338 | P1 | IP-like imported `deviceId` values could become persisted identity. | resolved | PR #39 final clean Codex review at `cd9bfc2`; current tests `observation comparison does not treat IP-like device IDs as persisted identity` and `observation comparison keeps IP-like device IDs with changed MAC evidence uncertain`. | No code change. Proven resolved on current main. |
| #39 | https://github.com/itprodirect/psec-baseline-hunter/pull/39#discussion_r3444763968 | P2 | Port diffs were emitted when one side lacked port-source coverage. | resolved | PR #39 final clean Codex review at `cd9bfc2`; current tests `observation comparison suppresses closed ports without current port coverage`, `observation comparison suppresses opened ports without baseline port coverage`, and `network activity surfaces partial and stale limitations near no-change results`. | No code change. Proven resolved on current main. |
| #39 | https://github.com/itprodirect/psec-baseline-hunter/pull/39#discussion_r3444798821 | P2 | MAC evidence IDs were not linked after hyphen/dot normalization. | resolved | PR #39 final clean Codex review at `cd9bfc2`; current test `observation comparison links normalized MAC evidence IDs`. | No code change. Proven resolved on current main. |
| #39 | https://github.com/itprodirect/psec-baseline-hunter/pull/39#discussion_r3444834743 | P2 | Stale status waited almost a full day after the threshold. | resolved | PR #39 final clean Codex review at `cd9bfc2`; current test `observation comparison uses exact stale threshold boundary`. | No code change. Proven resolved on current main. |
| #40 | https://github.com/itprodirect/psec-baseline-hunter/pull/40#discussion_r3445001181 | P1 | `/api/activity` was disconnected from the normal `/api/ingest` upload flow. | resolved | Later PR #41, merge commit `5711036`, bridges ingest runs to observations; current tests `ingest POST creates observation records that populate network activity` and `network activity chooses the latest valid same-site observation comparison`. | No code change. Proven resolved by later work. |
| #40 | https://github.com/itprodirect/psec-baseline-hunter/pull/40#issuecomment-4755552412 | follow-up | Future hosted/shareable `/api/activity` should default to redacted output with explicit reveal. | intentionally deferred | Current local model is single-user; no hosted/shareable access exists in this cleanup. | Created follow-up issue https://github.com/itprodirect/psec-baseline-hunter/issues/48. |
| #40 | https://github.com/itprodirect/psec-baseline-hunter/pull/40#issuecomment-4755552412 | follow-up | `coverage.technicalVantage` should be removed or gated before broader exposure. | intentionally deferred | Current `src/lib/types/network-activity.ts` and `src/lib/services/network-activity.ts` still expose `technicalVantage`; not rendered as a user-facing Activity detail today. | Tracked in https://github.com/itprodirect/psec-baseline-hunter/issues/48. |
| #40 | https://github.com/itprodirect/psec-baseline-hunter/pull/40#issuecomment-4755552412 | follow-up | Supporting-evidence anchors can land inside collapsed `<details>`. | intentionally deferred | Current `NetworkActivityView` still renders evidence details in collapsed `<details id={event.evidenceId}>`. | Tracked in https://github.com/itprodirect/psec-baseline-hunter/issues/48. |
| #41 | https://github.com/itprodirect/psec-baseline-hunter/pull/41#discussion_r3445072605 | P2 | Duplicate scan uploads could register duplicate observations because generatedAt changed. | resolved | Later PR #42, merge commit `d324a84`, made ingest observation imports deterministic/idempotent; current test `ingest POST is idempotent for duplicate scan uploads`. | No code change. Proven resolved by later work. |
| #42 | https://github.com/itprodirect/psec-baseline-hunter/pull/42#discussion_r3445120431 | P2 | Existing old-style ingested observations could duplicate after deterministic generatedAt change. | resolved | Later PR #43, merge commit `1e9ec87`, added source-run compatibility dedupe; current tests `ingest POST dedupes old-style observations by source run identity` and `ingest POST backfills a missing observation for an existing run idempotently`. | No code change to the compatibility goal; narrowed in this cleanup to avoid over-broad observationId fallback. |
| #43 | https://github.com/itprodirect/psec-baseline-hunter/pull/43#discussion_r3445190973 | P2 | ObservationId-only duplicate matching could discard distinct corrected or third-party bundles. | still applies | Current main `findExistingObservationBySourceRunIdentity` matched either stable source run UID or observation ID. New regression `observation registry dedupes by stable source run without collapsing reused observation IDs` reproduces the needed distinct-record case. | Fixed in this branch: source-run match still dedupes old-style same-run records, but observationId fallback only applies when both records lack stable sourceRunUid. |
| #44 | n/a | n/a | No substantive GitHub/Codex review findings. | resolved | Connector returned no PR comments and no review threads for PR #44. | No action. |
| #45 | https://github.com/itprodirect/psec-baseline-hunter/pull/45#discussion_r3445410037 | P2 | Non-string `site.networkName` caused `.trim()` TypeError and 500. | still applies | Current main called `site.networkName?.trim()` before type validation. New regression `packet highway save API rejects malformed network names with safe validation errors` covers number, array, object, null, missing, and valid trimmed input. | Fixed in this branch: validate `networkName` is a string before trimming; malformed values return safe 400. |
| #46 | n/a | n/a | No substantive GitHub/Codex review findings. | resolved | Connector returned no PR comments and no review threads for PR #46. | No action. |
| #47 | https://github.com/itprodirect/psec-baseline-hunter/pull/47#discussion_r3445487164 | P2 | Weekly coverage warnings/actions appeared for non-week Network Statement ranges. | still applies | Current main used `!period.weeklyTitleSupported` for all non-week ranges. New regression `network statement omits weekly collection warnings for non-week ranges` covers one-day, short non-week, and monthly ranges; existing week-insufficient test retains week downgrade/action. | Fixed in this branch: week warnings/actions now require `period.requestedWeeklyRange && !period.weeklyTitleSupported`. |
| #47 | https://github.com/itprodirect/psec-baseline-hunter/pull/47#discussion_r3445487165 | P2 | Exported free-form statement text could expose IPv4/MAC identifiers. | still applies | Current main statement sanitizer redacted paths/secrets/raw payloads but not IPv4 or common MAC formats. New regression `network statement API Markdown matches print sections and redacts export-sensitive text` covers coverage notes, user-friendly response text, JSON sections, and Markdown. | Fixed in this branch: free-form statement text redacts IPv4 plus colon, hyphen, and dotted MAC formats without damaging dates, counts, rule IDs, observation IDs, or safe relative links. |

## Current-Main Fixes In This Branch

- Narrowed observation compatibility dedupe in `src/lib/services/observation-registry.ts` so stable matching `sourceRunUid` dedupes old-style same-run observations, while same `observationId` with a different stable `sourceRunUid` and different content remains distinct.
- Hardened `src/app/api/packet-highway/observations/route.ts` so malformed `site.networkName` values return 400 instead of a 500.
- Gated Network Statement weekly coverage warnings/actions in `src/lib/services/network-statement.ts` to requested week-sized ranges only.
- Added IPv4 and common MAC redaction to Network Statement free-form export text before JSON/Markdown/print rendering.

## Focused Regression Tests Added

- `observation registry dedupes by stable source run without collapsing reused observation IDs`
- `packet highway save API rejects malformed network names with safe validation errors`
- `network statement omits weekly collection warnings for non-week ranges`
- Expanded `network statement API Markdown matches print sections and redacts export-sensitive text`

## Validation

- `npm ci` passed: 425 packages installed/audited, 0 vulnerabilities reported by the install audit.
- `npm audit --audit-level=moderate` passed: 0 vulnerabilities.
- `npm test` passed: 110 service/route tests and 44 Packet Highway tests.
- `npm run test:browser` passed with escalated browser process execution after sandboxed Playwright spawn returned `EPERM`: 6 Chromium tests.
- `npm run lint` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed.
- `git diff --check` passed.

## Deferred Issue

- https://github.com/itprodirect/psec-baseline-hunter/issues/48 - `Pre-hosting Activity privacy and evidence UX hardening`

## Dogfood Readiness Verdict

Ready for local single-user dogfooding after this cleanup PR merges. Hosted/shareable Activity exposure remains intentionally deferred to issue #48.