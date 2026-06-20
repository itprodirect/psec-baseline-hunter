import {
  compareObservationBundlesV1,
  isObservationComparisonError,
} from "./observation-comparison";
import {
  getObservationById,
  listObservations,
} from "./observation-registry";
import { shapeNetworkActivityComparison } from "./network-activity";
import { isPacketHighwayObservationEntry } from "./packet-highway-observation";
import type {
  ObservationComparisonGuardrail,
  ObservationComparisonResult,
} from "@/lib/types/observation-comparison";
import type {
  ObservationFreshnessOptions,
  ObservationRegistryEntry,
  ObservationRegistryRecord,
} from "@/lib/types/observation-registry";
import type {
  NetworkActivityEvent,
  NetworkActivitySupplementalEvidence,
} from "@/lib/types/network-activity";
import type {
  NetworkStatementEvidenceRef,
  NetworkStatementItem,
  NetworkStatementItemSeverity,
  NetworkStatementModel,
  NetworkStatementSection,
} from "@/lib/types/network-statement";

const STATEMENT_SCHEMA_VERSION = "psec.network-statement.v1" as const;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface BuildNetworkStatementOptions {
  siteId: string;
  from: string | Date;
  to: string | Date;
  evaluatedAt?: string | Date;
}

interface StatementComparison {
  index: number;
  baseline: ObservationRegistryRecord;
  current: ObservationRegistryRecord;
  comparison: ObservationComparisonResult;
  events: NetworkActivityEvent[];
}

interface StatementSkippedComparison {
  baselineObservationId: string;
  currentObservationId: string;
  reason: string;
}

interface StatementEvent {
  comparisonIndex: number;
  event: NetworkActivityEvent;
}

export function buildNetworkStatement(
  options: BuildNetworkStatementOptions
): NetworkStatementModel {
  const generatedAt = optionIsoOrNow(options.evaluatedAt);
  const from = requiredIso(options.from, "from");
  const to = requiredIso(options.to, "to");
  if (from > to) {
    throw new NetworkStatementRequestError("from must be before or equal to to");
  }

  const freshnessOptions = { evaluatedAt: generatedAt };
  const selectedEntries = entriesInRange(
    listObservations({ siteId: options.siteId, order: "asc" }, freshnessOptions),
    from,
    to
  );
  const primaryEntries = selectedEntries.filter(
    (entry) => !isPacketHighwayObservationEntry(entry)
  );
  const site = siteFromEntries(options.siteId, primaryEntries, selectedEntries);
  const allEntries = listObservations({}, freshnessOptions);
  const supplementalEvidence = supplementalEvidenceForStatement(
    entriesInRange(allEntries, from, to),
    site,
    freshnessOptions
  );
  const { comparisons, skipped } = buildComparisons(
    primaryEntries,
    freshnessOptions,
    supplementalEvidence
  );
  const statementEvents = comparisons.flatMap((comparison) =>
    comparison.events.map((event) => ({
      comparisonIndex: comparison.index,
      event,
    }))
  );
  const coverageFacts = coverageFactsFor(primaryEntries, comparisons);
  const period = buildSelectedPeriod(from, to, primaryEntries, comparisons.length);
  const title = period.weeklyTitleSupported ? "Weekly Network Statement" : "Network Statement";
  const status = comparisons.length > 0 ? "ready" : "insufficient-evidence";
  const responseCount = statementEvents.filter(
    ({ event }) => event.deviceResponse.statement
  ).length;

  const sections: NetworkStatementSection[] = [
    selectedPeriodSection(period, generatedAt),
    siteSection(site),
    coverageVantageSection(primaryEntries, supplementalEvidence, coverageFacts, period),
    freshnessSection(primaryEntries),
    stableSection(comparisons, statementEvents, coverageFacts),
    changedSection(statementEvents),
    needsReviewSection(statementEvents),
    unresolvedResponsesSection(statementEvents),
    packetHighwaySection(supplementalEvidence),
    cannotConcludeSection(coverageFacts, period, supplementalEvidence.length > 0),
    nextActionsSection(coverageFacts, period, statementEvents, supplementalEvidence.length > 0),
    provenanceSection(comparisons, skipped, primaryEntries.length, responseCount, supplementalEvidence.length),
  ];

  return {
    schemaVersion: STATEMENT_SCHEMA_VERSION,
    status,
    title,
    generatedAt,
    site,
    selectedPeriod: period,
    coverageSummary: {
      primaryObservationCount: primaryEntries.length,
      comparisonCount: comparisons.length,
      supplementalPacketHighwayCount: supplementalEvidence.length,
      hasPartialCoverage: coverageFacts.hasPartialCoverage,
      hasStaleEvidence: coverageFacts.hasStaleEvidence,
      hasInsufficientWeekCoverage: !period.weeklyTitleSupported,
      hasInsufficientComparisonEvidence: comparisons.length === 0,
    },
    privacy: {
      technicalIdentifiersMinimized: true,
      rawPayloadsExcluded: true,
      absolutePathsExcluded: true,
      secretsExcluded: true,
    },
    sections,
  };
}

export function renderNetworkStatementMarkdown(
  statement: NetworkStatementModel
): string {
  const lines: string[] = [
    `# ${markdownText(statement.title)}`,
    "",
    `Generated: ${markdownText(formatDateTime(statement.generatedAt))}`,
    "",
  ];

  for (const section of statement.sections) {
    lines.push(`## ${markdownText(section.title)}`);
    if (section.summary) {
      lines.push("");
      lines.push(markdownText(section.summary));
    }
    lines.push("");
    for (const item of section.items) {
      lines.push(`- ${markdownText(item.text)}`);
      if (item.evidenceRefs.length > 0) {
        lines.push(
          `  Evidence: ${item.evidenceRefs
            .map((ref) => `[${markdownText(ref.label)}](${safeHref(ref.href)})`)
            .join(", ")}`
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export class NetworkStatementRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkStatementRequestError";
  }
}

function buildComparisons(
  primaryEntries: ObservationRegistryEntry[],
  freshnessOptions: ObservationFreshnessOptions,
  supplementalEvidence: NetworkActivitySupplementalEvidence[]
): {
  comparisons: StatementComparison[];
  skipped: StatementSkippedComparison[];
} {
  const comparisons: StatementComparison[] = [];
  const skipped: StatementSkippedComparison[] = [];

  for (let index = 1; index < primaryEntries.length; index += 1) {
    const baselineEntry = primaryEntries[index - 1];
    const currentEntry = primaryEntries[index];
    const baseline = getObservationById(baselineEntry.registryId, freshnessOptions);
    const current = getObservationById(currentEntry.registryId, freshnessOptions);
    if (!baseline || !current) {
      skipped.push({
        baselineObservationId: baselineEntry.observationId,
        currentObservationId: currentEntry.observationId,
        reason: "One observation record could not be reopened from the registry.",
      });
      continue;
    }

    try {
      const comparison = compareObservationBundlesV1(baseline.bundle, current.bundle, {
        evaluatedAt: freshnessOptions.evaluatedAt,
      });
      const activity = shapeNetworkActivityComparison({
        baseline,
        current,
        comparison,
        generatedAt: String(freshnessOptions.evaluatedAt),
        source: "registry",
        availableObservationCount: primaryEntries.length,
        supplementalEvidence,
      });

      comparisons.push({
        index: comparisons.length + 1,
        baseline,
        current,
        comparison,
        events: activity.events,
      });
    } catch (error) {
      skipped.push({
        baselineObservationId: baseline.observationId,
        currentObservationId: current.observationId,
        reason: isObservationComparisonError(error)
          ? error.message
          : "The comparison could not be generated.",
      });
    }
  }

  return { comparisons, skipped };
}

function selectedPeriodSection(
  period: NetworkStatementModel["selectedPeriod"],
  generatedAt: string
): NetworkStatementSection {
  return section("selected-period", "Statement title and selected period", null, [
    item("period-title", `Title: ${period.weeklyTitleSupported ? "Weekly Network Statement" : "Network Statement"}.`),
    item("period-range", `Selected period: ${period.label}.`),
    item("period-generated", `Statement generated: ${formatDateTime(generatedAt)}.`),
    item("period-title-reason", period.titleReason, period.weeklyTitleSupported ? "info" : "warning"),
  ]);
}

function siteSection(site: NetworkStatementModel["site"]): NetworkStatementSection {
  return section("site-network", "Site/network covered", null, [
    item("site-name", `Site/network: ${site.networkName}.`),
    item("site-id", `Selected site ID: ${site.siteId}.`),
    item(
      "site-scope",
      site.networkScopeRecorded
        ? "A network scope is recorded in the observation metadata; exact target identifiers are not repeated in this statement."
        : "No network scope was recorded in the selected observation metadata."
    ),
  ]);
}

function coverageVantageSection(
  primaryEntries: ObservationRegistryEntry[],
  supplementalEvidence: NetworkActivitySupplementalEvidence[],
  facts: CoverageFacts,
  period: NetworkStatementModel["selectedPeriod"]
): NetworkStatementSection {
  const items: NetworkStatementItem[] = [
    item(
      "coverage-counts",
      `Primary observations in period: ${primaryEntries.length}. Comparable observation pairs: ${facts.comparisonCount}. Supplemental Packet Highway records: ${supplementalEvidence.length}.`,
      facts.comparisonCount > 0 ? "info" : "warning"
    ),
  ];

  const vantages = uniqueSorted(
    primaryEntries.map((entry) => vantageLabel(entry.vantage.type, entry.vantage.runType))
  );
  items.push(
    item(
      "coverage-vantage",
      vantages.length > 0
        ? `Collection vantage represented: ${vantages.join("; ")}.`
        : "No primary collection vantage is available for the selected period.",
      vantages.length > 0 ? "info" : "warning"
    )
  );

  if (!period.weeklyTitleSupported) {
    items.push(item("coverage-title-gap", period.titleReason, "warning"));
  }

  const coverageCounts = countBy(primaryEntries.map((entry) => entry.coverage.status));
  items.push(
    item(
      "coverage-statuses",
      primaryEntries.length > 0
        ? `Coverage status counts: ${formatCounts(coverageCounts)}.`
        : "Coverage status counts are unavailable because no primary observations were selected.",
      primaryEntries.length > 0 ? "info" : "warning"
    )
  );

  const missingSources = uniqueSorted(
    primaryEntries.flatMap((entry) => entry.coverage.missingSources.map(sourceLabel))
  );
  items.push(
    item(
      "coverage-missing-sources",
      missingSources.length > 0
        ? `Coverage gaps reported: ${missingSources.join(", ")}.`
        : "No missing coverage sources were reported by selected primary observations.",
      missingSources.length > 0 ? "warning" : "info"
    )
  );

  const coverageNotes = uniqueSorted(
    primaryEntries.flatMap((entry) => entry.coverage.notes)
  ).slice(0, 4);
  for (const [index, note] of coverageNotes.entries()) {
    items.push(item(`coverage-note-${index + 1}`, `Coverage note: ${note}.`));
  }

  return section(
    "coverage-vantage",
    "Observation coverage and collection vantage",
    "Coverage and vantage bound every finding below.",
    items
  );
}

function freshnessSection(primaryEntries: ObservationRegistryEntry[]): NetworkStatementSection {
  const items: NetworkStatementItem[] = [];
  const freshnessCounts = countBy(primaryEntries.map((entry) => entry.freshness.status));
  items.push(
    item(
      "freshness-counts",
      primaryEntries.length > 0
        ? `Evidence freshness counts: ${formatCounts(freshnessCounts)}.`
        : "Evidence freshness is unavailable because no primary observations were selected.",
      primaryEntries.length > 0 ? "info" : "warning"
    )
  );

  const latest = [...primaryEntries]
    .sort((a, b) => timeValue(observationTime(b)) - timeValue(observationTime(a)))[0];
  items.push(
    item(
      "freshness-latest",
      latest
        ? `Latest selected primary observation: ${formatDateTime(observationTime(latest))}; freshness status ${latest.freshness.status}.`
        : "No latest primary observation is available.",
      latest ? freshnessSeverity(latest.freshness.status) : "warning"
    )
  );

  const nonFreshReasons = uniqueSorted(
    primaryEntries
      .filter((entry) => entry.freshness.status !== "fresh")
      .map((entry) => entry.freshness.reason)
  );
  if (nonFreshReasons.length === 0 && primaryEntries.length > 0) {
    items.push(item("freshness-fresh", "Selected primary observations are within the configured freshness cadence."));
  } else {
    for (const [index, reason] of nonFreshReasons.entries()) {
      items.push(item(`freshness-limit-${index + 1}`, reason, "warning"));
    }
  }

  return section("freshness", "Evidence freshness", null, items);
}

function stableSection(
  comparisons: StatementComparison[],
  events: StatementEvent[],
  facts: CoverageFacts
): NetworkStatementSection {
  if (comparisons.length === 0) {
    return section("stable", "What appeared stable", null, [
      item(
        "stable-none",
        "No stable finding is available because the selected period has fewer than two comparable primary observations.",
        "warning"
      ),
    ]);
  }

  if (events.length === 0) {
    return section("stable", "What appeared stable", null, [
      item(
        "stable-no-events",
        `The selected ${pluralize("comparison", comparisons.length)} produced no new-device, not-observed-device, uncertain-identity, service, or metadata change events.`,
        facts.hasPartialCoverage || facts.hasStaleEvidence ? "warning" : "info"
      ),
      item(
        "stable-boundary",
        facts.hasPartialCoverage || facts.hasStaleEvidence
          ? "That stability is bounded by the coverage and freshness limits above and does not establish complete safety."
          : "That stability reflects only the stored observations and does not establish complete safety."
      ),
    ]);
  }

  return section("stable", "What appeared stable", null, [
    item(
      "stable-bounded",
      `${comparisons.length} comparable ${pluralize("observation pair", comparisons.length)} were processed. Stable devices or services are not enumerated; stability means no change event was produced for that evidence.`,
      "info"
    ),
  ]);
}

function changedSection(events: StatementEvent[]): NetworkStatementSection {
  if (events.length === 0) {
    return section("changed", "What changed", null, [
      item("changed-none", "No deterministic change events were produced for the selected comparisons."),
    ]);
  }

  return section(
    "changed",
    "What changed",
    null,
    events.map(({ comparisonIndex, event }, index) =>
      item(
        `changed-${index + 1}`,
        `Comparison ${comparisonIndex}: ${event.title}. ${event.summary}`,
        "review",
        [activityRef(event)]
      )
    )
  );
}

function needsReviewSection(events: StatementEvent[]): NetworkStatementSection {
  if (events.length === 0) {
    return section("needs-review", "What needs user review", null, [
      item("review-none", "No change events require user review from the selected comparisons."),
    ]);
  }

  return section(
    "needs-review",
    "What needs user review",
    null,
    events.map(({ comparisonIndex, event }, index) => {
      const response = event.deviceResponse.statement;
      const responseText = response
        ? ` User response: ${response.stateLabel}; user statement only.`
        : "";
      return item(
        `review-${index + 1}`,
        `Comparison ${comparisonIndex}: ${event.reviewReason}${responseText}`,
        event.workflowPriority.level === "user-investigate" ? "review" : "info",
        [activityRef(event)]
      );
    })
  );
}

function unresolvedResponsesSection(events: StatementEvent[]): NetworkStatementSection {
  const unresolved = events.filter(({ event }) => {
    const state = event.deviceResponse.statement?.state;
    return state === "not_sure" || state === "investigate";
  });

  if (unresolved.length === 0) {
    return section("unresolved-responses", "Unresolved not_sure and investigate responses", null, [
      item(
        "responses-none",
        "No unresolved not_sure or investigate user responses were found in the selected comparison events."
      ),
    ]);
  }

  return section(
    "unresolved-responses",
    "Unresolved not_sure and investigate responses",
    "These are user statements and review cues, not security evidence.",
    unresolved.map(({ comparisonIndex, event }, index) => {
      const response = event.deviceResponse.statement!;
      const friendlyName = response.friendlyName ? ` (${response.friendlyName})` : "";
      return item(
        `response-${index + 1}`,
        `Comparison ${comparisonIndex}: ${response.stateLabel}${friendlyName} remains unresolved for "${event.title}". This does not change the technical finding.`,
        "review",
        [activityRef(event)]
      );
    })
  );
}

function packetHighwaySection(
  supplementalEvidence: NetworkActivitySupplementalEvidence[]
): NetworkStatementSection {
  if (supplementalEvidence.length === 0) {
    return section("packet-highway", "Packet Highway supplemental evidence", null, [
      item("packet-highway-none", "No Packet Highway supplemental evidence was available for the selected period."),
    ]);
  }

  return section(
    "packet-highway",
    "Packet Highway supplemental evidence",
    "Supplemental only; this evidence does not change primary comparison findings.",
    supplementalEvidence.map((evidence, index) =>
      item(
        `packet-highway-${index + 1}`,
        `${evidence.label}: ${evidence.summary} Vantage: ${evidence.vantageLabel}; observed ${formatDateTime(evidence.observedAt)}.`,
        "info",
        [
          {
            label: "Open Packet Highway evidence",
            href: evidence.href,
            kind: "packet-highway",
          },
        ]
      )
    )
  );
}

function cannotConcludeSection(
  facts: CoverageFacts,
  period: NetworkStatementModel["selectedPeriod"],
  hasPacketHighway: boolean
): NetworkStatementSection {
  const items = [
    item(
      "cannot-safety",
      "This statement cannot prove the network is safe, compromised, or compliant."
    ),
    item(
      "cannot-absence",
      "It cannot prove absence of devices or services outside the selected observations, collection vantage, coverage sources, or date range."
    ),
    item(
      "cannot-responses",
      "User device responses describe user knowledge or intent only; they are not security evidence."
    ),
  ];

  if (!period.weeklyTitleSupported) {
    items.push(item("cannot-week", "The selected evidence does not support an unconditional weekly coverage claim.", "warning"));
  }
  if (facts.hasPartialCoverage || facts.hasStaleEvidence || facts.comparisonCount === 0) {
    items.push(item("cannot-limited", "Coverage, freshness, or comparison limits prevent any complete-safety conclusion.", "warning"));
  }
  if (hasPacketHighway) {
    items.push(
      item(
        "cannot-packet-highway",
        "Packet Highway evidence cannot prove complete inventory, device ownership, safety, or causality for comparison changes."
      )
    );
  }

  return section("cannot-conclude", "What cannot be concluded", null, items);
}

function nextActionsSection(
  facts: CoverageFacts,
  period: NetworkStatementModel["selectedPeriod"],
  events: StatementEvent[],
  hasPacketHighway: boolean
): NetworkStatementSection {
  const actions: NetworkStatementItem[] = [];

  if (facts.primaryObservationCount < 2 || facts.comparisonCount === 0) {
    actions.push(
      item(
        "action-observe",
        "Collect at least two primary observations for this site before relying on a change statement.",
        "warning"
      )
    );
  }
  if (!period.weeklyTitleSupported) {
    actions.push(
      item(
        "action-week",
        "Collect primary observations near the beginning and end of the requested week before using a weekly title.",
        "warning"
      )
    );
  }
  if (facts.hasStaleEvidence) {
    actions.push(item("action-fresh", "Run a fresh observation before treating unchanged findings as current.", "warning"));
  }
  if (facts.missingSourceLabels.length > 0) {
    actions.push(
      item(
        "action-missing-sources",
        `Improve coverage by collecting missing sources: ${facts.missingSourceLabels.join(", ")}.`,
        "warning"
      )
    );
  }

  const unresolvedCount = events.filter(({ event }) => {
    const state = event.deviceResponse.statement?.state;
    return state === "not_sure" || state === "investigate";
  }).length;
  if (unresolvedCount > 0) {
    actions.push(item("action-responses", "Review unresolved not_sure and investigate responses and clear or update them when resolved.", "review"));
  }
  if (events.length > 0) {
    actions.push(item("action-events", "Review each changed item in Network Activity and confirm whether observed devices or services are expected.", "review"));
  }
  if (hasPacketHighway) {
    actions.push(item("action-packet-highway", "Use Packet Highway drill-down only as supplemental context for timing, flows, and visual inspection."));
  }
  if (actions.length === 0) {
    actions.push(item("action-cadence", "Keep the observation cadence and compare again after the next primary observation."));
  }

  return section("next-actions", "Practical next actions", null, actions);
}

function provenanceSection(
  comparisons: StatementComparison[],
  skipped: StatementSkippedComparison[],
  primaryObservationCount: number,
  responseCount: number,
  supplementalCount: number
): NetworkStatementSection {
  const items: NetworkStatementItem[] = [
    item(
      "provenance-source",
      `Deterministic generator ${STATEMENT_SCHEMA_VERSION} used Observation Bundle registry entries, observation-comparison rule output, coverage/freshness records, persisted user responses, and supplemental Packet Highway metadata.`
    ),
    item(
      "provenance-counts",
      `Source counts: ${primaryObservationCount} primary observations, ${comparisons.length} generated comparisons, ${responseCount} persisted user response statements, ${supplementalCount} supplemental Packet Highway records.`
    ),
  ];

  for (const comparison of comparisons) {
    items.push(
      item(
        `provenance-comparison-${comparison.index}`,
        `Comparison ${comparison.index}: ${comparison.baseline.observationId} to ${comparison.current.observationId}; rule ${comparison.comparison.ruleVersion}; ${comparison.events.length} ${pluralize("event", comparison.events.length)}; guardrails ${guardrailCodes(comparison.comparison.guardrails)}.`,
        "info",
        [
          {
            label: `Comparison ${comparison.index} activity evidence`,
            href: "/activity",
            kind: "activity",
          },
        ]
      )
    );
  }

  for (const [index, skippedComparison] of skipped.entries()) {
    items.push(
      item(
        `provenance-skipped-${index + 1}`,
        `Skipped comparison ${skippedComparison.baselineObservationId} to ${skippedComparison.currentObservationId}: ${skippedComparison.reason}.`,
        "warning"
      )
    );
  }

  return section(
    "technical-provenance",
    "Technical evidence/provenance summary",
    "Secondary summary only; detailed technical identifiers remain in the underlying observation and activity evidence views.",
    items,
    true
  );
}

interface CoverageFacts {
  primaryObservationCount: number;
  comparisonCount: number;
  hasPartialCoverage: boolean;
  hasStaleEvidence: boolean;
  missingSourceLabels: string[];
}

function coverageFactsFor(
  primaryEntries: ObservationRegistryEntry[],
  comparisons: StatementComparison[]
): CoverageFacts {
  return {
    primaryObservationCount: primaryEntries.length,
    comparisonCount: comparisons.length,
    hasPartialCoverage: primaryEntries.some(
      (entry) =>
        entry.batch.partial ||
        entry.coverage.status !== "complete" ||
        entry.coverage.missingSources.length > 0
    ),
    hasStaleEvidence: primaryEntries.some(
      (entry) => entry.freshness.status === "stale" || entry.freshness.status === "partial"
    ),
    missingSourceLabels: uniqueSorted(
      primaryEntries.flatMap((entry) => entry.coverage.missingSources.map(sourceLabel))
    ),
  };
}

function buildSelectedPeriod(
  from: string,
  to: string,
  primaryEntries: ObservationRegistryEntry[],
  comparisonCount: number
): NetworkStatementModel["selectedPeriod"] {
  const requestedWeeklyRange = isRequestedWeeklyRange(from, to);
  const earliest = primaryEntries[0] ? observationTime(primaryEntries[0]) : null;
  const latest = primaryEntries.length > 0 ? observationTime(primaryEntries[primaryEntries.length - 1]) : null;
  const weekCovered =
    requestedWeeklyRange &&
    comparisonCount > 0 &&
    Boolean(earliest && latest) &&
    timeValue(earliest) <= timeValue(from) + MS_PER_DAY &&
    timeValue(latest) >= timeValue(to) - MS_PER_DAY &&
    timeValue(latest) - timeValue(earliest) >= 5 * MS_PER_DAY;

  let titleReason = "Stored observations span the requested week closely enough to support the weekly title.";
  if (!requestedWeeklyRange) {
    titleReason = "The selected range is not a one-week period, so the statement uses the general title.";
  } else if (comparisonCount === 0) {
    titleReason = "The requested week does not have two comparable primary observations, so the weekly title is not supported.";
  } else if (!weekCovered) {
    titleReason = `Stored observations do not span enough of the requested week. Observed span: ${formatDateTime(earliest)} to ${formatDateTime(latest)}.`;
  }

  return {
    from,
    to,
    label: `${formatDate(from)} to ${formatDate(to)}`,
    requestedWeeklyRange,
    weeklyTitleSupported: weekCovered,
    titleReason,
  };
}

function entriesInRange(
  entries: ObservationRegistryEntry[],
  from: string,
  to: string
): ObservationRegistryEntry[] {
  return entries.filter((entry) => {
    const observedAt = observationTime(entry);
    return Boolean(observedAt && observedAt >= from && observedAt <= to);
  });
}

function supplementalEvidenceForStatement(
  entries: ObservationRegistryEntry[],
  site: NetworkStatementModel["site"],
  freshnessOptions: ObservationFreshnessOptions
): NetworkActivitySupplementalEvidence[] {
  const evidence: NetworkActivitySupplementalEvidence[] = [];
  const seen = new Set<string>();
  const normalizedNetworkName = normalizeText(site.networkName);

  for (const entry of entries) {
    if (!isPacketHighwayObservationEntry(entry) || seen.has(entry.registryId)) continue;
    const matchesSite =
      entry.site.siteId.toLowerCase() === site.siteId.toLowerCase() ||
      normalizeText(entry.networkName) === normalizedNetworkName ||
      normalizeText(entry.site.networkName) === normalizedNetworkName;
    if (!matchesSite) continue;

    seen.add(entry.registryId);
    const record = getObservationById(entry.registryId, freshnessOptions);
    const supplemental = record?.bundle.supplementalEvidence?.find(
      (candidate) => candidate.kind === "packet-highway-analysis" && candidate.packetHighway
    );
    const packetHighway = supplemental?.packetHighway;
    if (!record || !supplemental || !packetHighway) continue;

    evidence.push({
      evidenceId: supplemental.evidenceId,
      kind: "packet-highway-analysis",
      label: supplemental.label,
      summary: supplemental.summary,
      href: `/packet-highway?observation=${encodeURIComponent(record.registryId)}`,
      observationId: record.observationId,
      registryId: record.registryId,
      observedAt: observationTime(record),
      vantageLabel: vantageLabel(record.vantage.type, record.vantage.runType),
      canSupport: packetHighway.canSupport,
      cannotProve: packetHighway.cannotProve,
      limitations: packetHighway.limitations,
    });
  }

  return evidence.sort((a, b) => timeValue(b.observedAt) - timeValue(a.observedAt));
}

function siteFromEntries(
  requestedSiteId: string,
  primaryEntries: ObservationRegistryEntry[],
  selectedEntries: ObservationRegistryEntry[]
): NetworkStatementModel["site"] {
  const entry = primaryEntries[primaryEntries.length - 1] ?? selectedEntries[selectedEntries.length - 1];
  return {
    siteId: sanitizeExportText(entry?.site.siteId ?? requestedSiteId),
    networkName: sanitizeExportText(entry?.networkName ?? entry?.site.networkName ?? requestedSiteId),
    networkScopeRecorded: Boolean(entry?.site.networkScope),
  };
}

function section(
  id: NetworkStatementSection["id"],
  title: string,
  summary: string | null,
  items: NetworkStatementItem[],
  secondary = false
): NetworkStatementSection {
  return {
    id,
    title,
    summary: summary ? sanitizeExportText(summary) : null,
    secondary,
    items,
  };
}

function item(
  id: string,
  text: string,
  severity: NetworkStatementItemSeverity = "info",
  evidenceRefs: NetworkStatementEvidenceRef[] = []
): NetworkStatementItem {
  return {
    id,
    severity,
    text: sanitizeExportText(text),
    evidenceRefs: evidenceRefs.map((ref) => ({
      label: sanitizeExportText(ref.label),
      href: safeHref(ref.href),
      kind: ref.kind,
    })),
  };
}

function activityRef(event: NetworkActivityEvent): NetworkStatementEvidenceRef {
  return {
    label: "Network Activity evidence",
    href: `/activity#${encodeURIComponent(event.evidenceId)}`,
    kind: "activity",
  };
}

function observationTime(entry: ObservationRegistryEntry | ObservationRegistryRecord): string | null {
  return entry.timeRange.endedAt ?? entry.timeRange.startedAt ?? entry.timeRange.generatedAt;
}

function optionIsoOrNow(value: string | Date | undefined): string {
  if (value === undefined) return new Date().toISOString();
  return requiredIso(value, "evaluatedAt");
}

function requiredIso(value: string | Date, field: string): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new NetworkStatementRequestError(`${field} must be a valid date`);
    }
    return value.toISOString();
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new NetworkStatementRequestError(`${field} must be a valid ISO timestamp`);
  }
  return new Date(parsed).toISOString();
}

function isRequestedWeeklyRange(from: string, to: string): boolean {
  const duration = timeValue(to) - timeValue(from);
  return duration >= 6 * MS_PER_DAY && duration <= 8 * MS_PER_DAY;
}

function timeValue(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(value: string | null): string {
  if (!value) return "not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function freshnessSeverity(status: string): NetworkStatementItemSeverity {
  return status === "fresh" ? "info" : "warning";
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    ports: "port scan",
    discovery: "discovery scan",
    hosts_up: "host-up list",
    arp_snapshot: "ARP snapshot",
    scan_metadata: "scan metadata",
    packet_highway_analysis: "Packet Highway analysis",
    collection_vantage: "collection vantage",
    capture_timing: "capture timing",
    parser_limits: "parser limits",
  };
  return labels[source] ?? source.replace(/_/g, " ");
}

function vantageLabel(type: string, runType: string | null): string {
  const label =
    type === "active-scan-upload"
      ? "Active scan upload"
      : type === "packet-highway-this-computer"
        ? "Packet Highway: this computer only"
        : type === "packet-highway-gateway-router"
          ? "Packet Highway: gateway/router"
          : type === "packet-highway-mirror-tap"
            ? "Packet Highway: mirror/tap"
            : type === "packet-highway-unknown"
              ? "Packet Highway: unknown vantage"
              : "Collection";
  return runType ? `${label} (${runType})` : label;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "none";
  return entries.map(([value, count]) => `${value}: ${count}`).join(", ");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => sanitizeExportText(value)).filter(Boolean))].sort();
}

function guardrailCodes(guardrails: ObservationComparisonGuardrail[]): string {
  if (guardrails.length === 0) return "none";
  return guardrails.map((guardrail) => guardrail.code).sort().join(", ");
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function markdownText(value: string): string {
  return sanitizeExportText(value).replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function safeHref(value: string): string {
  if (/^\/(?:activity|packet-highway|observations)(?:[/?#][A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?$/.test(value)) {
    return value;
  }
  if (value === "/activity") return value;
  return "#";
}

function sanitizeExportText(value: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<\??xml\b[^>]*>|<nmaprun\b[^>]*>|<host\b[^>]*>|<packet\b[^>]*>|<\/(?:nmaprun|host|packet)>/gi, "[redacted raw evidence]")
    .replace(/\bpcap(?:ng)?\s+global\s+header\b|\braw\s+(?:packet|payload|scan|capture)\b/gi, "[redacted raw evidence]")
    .replace(/\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*[^\s,;]+/gi, "[redacted secret]")
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[redacted secret]")
    .replace(/BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY/gi, "[redacted secret]")
    .replace(/[A-Za-z]:\\[^\s,;)"']+/g, "[redacted path]")
    .replace(/\\\\[^\\\s]+\\[^\s,;)"']+/g, "[redacted path]")
    .replace(/\/(?:home|tmp|Users|var|etc|workspace|opt)\/[^\s,;)"']*/g, "[redacted path]")
    .trim()
    .replace(/\s+/g, " ");

  return (cleaned || "[redacted]").slice(0, 800);
}
