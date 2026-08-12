# Security hardening roadmap

This roadmap converts the sanitized 2026-08-11 Daybreak review into bounded,
independently reviewable work. It does not approve a hosted or multi-user
deployment and does not replace issue-level acceptance criteria.

## Deployment gates

| Gate | Required state |
| --- | --- |
| Continued local dogfooding | Explicit loopback binding and the operating boundaries in `SECURITY.md`; outputs remain advisory |
| Local Safety & Evidence Integrity milestone complete | Every issue assigned to the local milestone is closed with required regression tests and documentation aligned to behavior |
| Pre-hosting review may begin | Local milestone complete; pre-hosting architecture decisions documented; threat model updated |
| Hosted/shared deployment | Every pre-hosting blocker closed and verified in the actual deployment environment |
| Multi-user/multi-tenant deployment | Separate approved tenant architecture, isolation tests, audit model, abuse controls, and deployment review |

## 1. Current local safety and evidence integrity

Milestone:
[Security V0.7 — Local Safety & Evidence Integrity](https://github.com/itprodirect/psec-baseline-hunter/milestone/1)

| Order | Work item | Finding IDs | Dependency | Completion signal |
| --- | --- | --- | --- | --- |
| 1 | [#54](https://github.com/itprodirect/psec-baseline-hunter/issues/54) — frozen DB-01 umbrella | DB-01 | Five bounded children below | Close only after every child, normal-path regression, cross-surface verification, and independent-review gate passes |
| 1a | [#65](https://github.com/itprodirect/psec-baseline-hunter/issues/65) — Observation authority and loss-aware normalization | DB-01 F01–F07 | Canonical main | Imported bundles remain review-only and evidence loss is monotonic |
| 1b | [#66](https://github.com/itprodirect/psec-baseline-hunter/issues/66) — canonical evidence semantics | DB-01 F08–F12 | #65 | One evaluator authorizes conclusions from origin, coverage, identity, chronology, and vantage |
| 1c | [#67](https://github.com/itprodirect/psec-baseline-hunter/issues/67) — saved-comparison recomputation or quarantine | DB-01 F13–F14 | #66 | Serialized conclusions are never authoritative |
| 1d | [#68](https://github.com/itprodirect/psec-baseline-hunter/issues/68) — current-result mutation ownership | DB-01 F15–F17 | #66 | Mutations require the same still-current supported evaluation |
| 1e | [#69](https://github.com/itprodirect/psec-baseline-hunter/issues/69) — cross-surface integration | DB-01 F18–F20 | #66, #67, #68 | Every active output sink preserves canonical evidence status |
| 2 | [#56](https://github.com/itprodirect/psec-baseline-hunter/issues/56) — contain scanner output, archive, and cleanup paths | DB-02 | None | Only the unique run workspace can be archived or removed; path and target validation regressions pass |
| 3 | [#57](https://github.com/itprodirect/psec-baseline-hunter/issues/57) — enforce loopback startup and safe mutation origins | DB-03 local subset | None | Default local commands bind to loopback and rejected origins/content types are stopped before mutation |
| 4 | [#55](https://github.com/itprodirect/psec-baseline-hunter/issues/55) — replace potentially sensitive documentation fixtures and local paths | DB-06 | None | Tracked documentation contains only unmistakably synthetic examples and repository-relative references |
| 5 | [#58](https://github.com/itprodirect/psec-baseline-hunter/issues/58) — neutralize spreadsheet formulas in CSV exports | DB-08 | None | All string exports remain inert in formula-capable spreadsheets without corrupting numeric fields |
| 6 | [#60](https://github.com/itprodirect/psec-baseline-hunter/issues/60) — bound request, archive, parser, and retained-storage resources | DB-04; DB-07/DB-11 resource subsets | Loopback issue defines local edge assumption | Requests, synchronous work, retained bytes, concurrency, and cleanup have tested limits |
| 7 | [#61](https://github.com/itprodirect/psec-baseline-hunter/issues/61) — make filesystem registries atomic and collision-safe | DB-10 | None | Interrupted and concurrent writes preserve the prior valid index; identifiers remain unique under a frozen clock |
| 8 | [#59](https://github.com/itprodirect/psec-baseline-hunter/issues/59) — refresh the Node dependency and CI security baseline | DB-12 | None | A clean checkout has a documented, passing dependency/security gate and full CI validation |

Items may be developed independently where their issue says so. Changes must
remain separated by concern; dependency upgrades must not be silently bundled
into evidence-integrity or parser behavior PRs.

### DB-01 decomposition

Externally imported Observation Bundles are
`UNSUPPORTED_FOR_NEGATIVE_CONCLUSIONS_IN_LOCAL_V0`. They may contribute bounded
positive review observations, but may not establish identity continuity,
completeness, device absence, service or port closure, stability, persistence
eligibility, authoritative summary eligibility, or external reachability. Only
server-derived provenance from canonical local artifacts may authorize supported
negative conclusions.

The approved implementation sequence is:

```text
canonical main
    ↓
#65 — Observation authority
    ↓
#66 — Evidence semantics
    ├────────────────┐
    ↓                ↓
#67              #68
Saved data       Mutation ownership
    └───────┬────────┘
            ↓
#69 — Cross-surface integration
```

[#61](https://github.com/itprodirect/psec-baseline-hunter/issues/61) may
proceed in parallel. It is not a blanket prerequisite for #68; a slice may
reuse a merged persistence primitive or name one precise small dependency.
[#60](https://github.com/itprodirect/psec-baseline-hunter/issues/60) proceeds
independently, and [#48](https://github.com/itprodirect/psec-baseline-hunter/issues/48)
remains the separate pre-hosting Activity privacy/evidence-UX concern.

[PR #64](https://github.com/itprodirect/psec-baseline-hunter/pull/64) is a
superseded security design spike and adversarial-test source, not a merge
candidate. Neither full commit is approved for whole-commit cherry-picking;
its branch and history remain preserved while selected concepts or tests may
be manually reimplemented under #65–#69.

### Local milestone completion criteria

- All five DB-01 replacement issues are closed through independently reviewed
  PRs, the #54 umbrella completion gate passes, and all other local-milestone
  implementation issues are complete.
- Required regression tests pass from a clean checkout.
- Local startup enforces the documented loopback boundary.
- Scorecard/Diff uncertainty is visible and consistent in every output channel.
- Scanner and persistence tests demonstrate confinement and crash-safe behavior.
- Public documentation contains no environment-specific private data.
- The supported deployment statement remains local and single-user.

## 2. Pre-hosting blockers

Milestone and parent tracker:

- [Pre-hosting Security Gate](https://github.com/itprodirect/psec-baseline-hunter/milestone/2)
- [Parent tracker #62](https://github.com/itprodirect/psec-baseline-hunter/issues/62)

Existing issue [#48](https://github.com/itprodirect/psec-baseline-hunter/issues/48)
owns Activity privacy and evidence UX hardening and must be reused rather than
duplicated.

The parent tracker retains the following architecture-gated work until a
hosted product boundary is explicitly approved:

- authentication and session policy;
- per-object ownership and authorization for every read, write, and delete;
- tenant-scoped persistence, identifiers, exports, and audit provenance;
- explicit, expiring sharing grants rather than identifiers as capabilities;
- privacy-safe default DTOs and authorized technical-data reveal paths;
- origin, CSRF, content-type, secure-header, TLS, and trusted-proxy policy at
  the real deployment edge;
- distributed request, storage, concurrency, provider-rate, and cost quotas;
- provider disclosure, pseudonymization, output validation, and redacted logs;
- authoritative imported-observation identity, coverage, continuity,
  negative-conclusion authority, and hosted provenance beyond the local-V0
  review-only decision; and
- deployment-specific abuse, backup, restore, retention, and deletion tests.

These are intentionally not decomposed into implementation issues yet. Doing
so would prematurely choose an authentication, hosting, storage, or tenancy
architecture.

### Pre-hosting completion criteria

- An approved threat model names users, tenants, administrators, providers,
  storage, sharing, and deployment-edge trust boundaries.
- Every API operation has authenticated actor, authorization, ownership, and
  audit tests.
- Default client responses and logs contain only data authorized for that
  actor and purpose.
- Request, retained-storage, provider-cost, and concurrency budgets hold across
  multiple application instances.
- Backup, restore, deletion, incident-response, and tenant-isolation tests pass
  in the intended hosted environment.
- A separate security review changes the hosted verdict from STOP.

## 3. Maintenance and defense-in-depth

- Keep the Node dependency advisory baseline and lockfile current without using
  automated fixes that silently expand scope.
- Pin GitHub Actions to reviewed revisions, declare least-privilege permissions,
  and set timeouts.
- Keep the legacy Streamlit/Python runtime disabled or archive it; do not imply
  that current Next.js controls cover it.
- Complete residual PCAPNG and Nmap semantic-validation hardening before using
  parser output as high-assurance evidence.
- Add deployed security-header and origin-policy integration checks when an
  edge environment is selected.
- Re-run targeted security reconciliation after parser, persistence, sharing,
  authentication, or provider-boundary changes.

## Finding-to-work traceability

| Finding | Primary owner | Residual/deferred work |
| --- | --- | --- |
| DB-01 | Frozen umbrella [#54](https://github.com/itprodirect/psec-baseline-hunter/issues/54), decomposed into [#65](https://github.com/itprodirect/psec-baseline-hunter/issues/65), [#66](https://github.com/itprodirect/psec-baseline-hunter/issues/66), [#67](https://github.com/itprodirect/psec-baseline-hunter/issues/67), [#68](https://github.com/itprodirect/psec-baseline-hunter/issues/68), and [#69](https://github.com/itprodirect/psec-baseline-hunter/issues/69) | [PR #64](https://github.com/itprodirect/psec-baseline-hunter/pull/64) is a superseded design spike; #61 is parallel rather than a blanket #68 prerequisite |
| DB-02 | [#56](https://github.com/itprodirect/psec-baseline-hunter/issues/56) | Reassess only if scanner execution model changes |
| DB-03 | [#57](https://github.com/itprodirect/psec-baseline-hunter/issues/57) | Authentication, ownership, tenancy, sharing, and edge policy remain under the pre-hosting tracker |
| DB-04 | [#60](https://github.com/itprodirect/psec-baseline-hunter/issues/60) | Revalidate limits in the selected hosted runtime |
| DB-05 | [#48](https://github.com/itprodirect/psec-baseline-hunter/issues/48) | Non-Activity DTO/log authorization remains under the pre-hosting tracker |
| DB-06 | [#55](https://github.com/itprodirect/psec-baseline-hunter/issues/55) | History treatment requires a separate owner decision if provenance is confirmed |
| DB-07 | [#60](https://github.com/itprodirect/psec-baseline-hunter/issues/60) for input/resource bounds | Provider privacy, distributed budgets, output trust, and log policy remain under the pre-hosting tracker |
| DB-08 | [#58](https://github.com/itprodirect/psec-baseline-hunter/issues/58) | Re-test against supported spreadsheet applications |
| DB-09 | Imported bundles are review-only for negative conclusions in local V0; canonical local authority is enforced through DB-01 | Imported-observation authority beyond local V0 remains under [#62](https://github.com/itprodirect/psec-baseline-hunter/issues/62) |
| DB-10 | [#61](https://github.com/itprodirect/psec-baseline-hunter/issues/61) | Replace filesystem persistence if the hosted architecture selects a transactional store |
| DB-11 | [#60](https://github.com/itprodirect/psec-baseline-hunter/issues/60) for resource bounds | Structural parser evidence work remains a pre-hosting/maintenance gate |
| DB-12 | [#59](https://github.com/itprodirect/psec-baseline-hunter/issues/59) | Legacy Python remains explicitly unsupported |

## Review record

The sanitized source review is
[`reviews/2026-08-11-daybreak-security-posture-summary.md`](reviews/2026-08-11-daybreak-security-posture-summary.md).
The complete raw review is not a repository artifact.
