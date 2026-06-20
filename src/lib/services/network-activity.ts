import {
  compareObservationBundlesV1,
  isObservationComparisonError,
} from "./observation-comparison";
import {
  buildDeviceResponseTarget,
  getDeviceResponseForTarget,
  statementFromDeviceResponse,
} from "./device-responses";
import {
  getObservationById,
  listObservations,
} from "./observation-registry";
import type {
  CollectionVantage,
  DeviceIdentityEvidence,
  ObservationBundleV1,
  ObservationDevice,
  ObservationOpenPort,
  ObservationSourceKind,
  ObservationSourceRef,
} from "@/lib/types/observation-bundle";
import type {
  ObservationChangeEvent,
  ObservationChangeEventType,
  ObservationComparisonCoverageSnapshot,
  ObservationComparisonPortRef,
  ObservationComparisonResult,
  ObservationIdentityConfidence,
} from "@/lib/types/observation-comparison";
import type {
  ObservationFreshnessOptions,
  ObservationRegistryEntry,
  ObservationRegistryRecord,
} from "@/lib/types/observation-registry";
import type {
  ActivityDeviceResponse,
  DeviceResponseCarryForward,
  DeviceResponseRecord,
  DeviceResponseTarget,
} from "@/lib/types/device-response";
import type {
  NetworkActivityCoverage,
  NetworkActivityEvent,
  NetworkActivityLatestObservation,
  NetworkActivityLimitation,
  NetworkActivityModel,
  NetworkActivityScenario,
  NetworkActivitySource,
  NetworkActivityTechnicalDevice,
  NetworkActivityTechnicalPort,
} from "@/lib/types/network-activity";

const ACTIVITY_PERIOD_ANCHOR = "#comparison-period" as const;
const DEFAULT_ACTIVITY_TITLE = "Network Activity";

interface BuildNetworkActivityOptions extends ObservationFreshnessOptions {
  source?: NetworkActivitySource;
}

interface ShapeComparisonInput {
  baseline: ObservationRegistryRecord;
  current: ObservationRegistryRecord;
  comparison: ObservationComparisonResult;
  generatedAt: string;
  source: NetworkActivitySource;
  scenario?: NetworkActivityScenario | null;
  availableObservationCount?: number;
}

export function buildNetworkActivity(
  options: BuildNetworkActivityOptions = {}
): NetworkActivityModel {
  const generatedAt = optionIsoOrNow(options.evaluatedAt);
  const freshnessOptions = { ...options, evaluatedAt: generatedAt };
  const entries = listObservations({}, freshnessOptions);

  if (entries.length === 0) {
    return emptyActivity(generatedAt, options.source ?? "registry");
  }

  const latestSiteEntries = entriesForLatestSite(entries);
  const latestEntry = latestSiteEntries[0];
  if (!latestEntry) {
    return emptyActivity(generatedAt, options.source ?? "registry");
  }

  if (latestSiteEntries.length === 1) {
    return oneObservationActivity(latestEntry, generatedAt, options.source ?? "registry", entries.length);
  }

  const pair = findLatestValidObservationPair(latestSiteEntries, freshnessOptions);
  if (!pair) {
    return noComparisonActivity(
      latestEntry,
      generatedAt,
      options.source ?? "registry",
      entries.length
    );
  }

  return shapeNetworkActivityComparison({
    ...pair,
    generatedAt,
    source: options.source ?? "registry",
    availableObservationCount: entries.length,
  });
}

export function shapeNetworkActivityComparison(
  input: ShapeComparisonInput
): NetworkActivityModel {
  const events = input.comparison.events
    .map((event) => shapeActivityEvent(event, input.comparison.site.siteId))
    .sort(compareActivityEvents);
  const limitations = buildLimitations(input.comparison, input.current);
  const period = {
    label: `${formatShortDate(input.comparison.observations.baseline.observedAt)} to ${formatShortDate(input.comparison.observations.current.observedAt)}`,
    baselineObservedAt: input.comparison.observations.baseline.observedAt,
    currentObservedAt: input.comparison.observations.current.observedAt,
    baselineObservationId: input.comparison.observations.baseline.observationId,
    currentObservationId: input.comparison.observations.current.observationId,
    baselineRunUid: input.comparison.observations.baseline.sourceRunUid,
    currentRunUid: input.comparison.observations.current.sourceRunUid,
  };

  return {
    status: "ready",
    source: input.source,
    generatedAt: input.generatedAt,
    title: DEFAULT_ACTIVITY_TITLE,
    summary: buildActivitySummary(events.length, limitations.length),
    site: {
      networkName: input.current.networkName,
      networkScope: input.current.site.networkScope,
    },
    latestObservation: latestObservationFromRecord(input.current),
    period,
    coverage: coverageFromComparison(input.comparison.coverageContext.current, input.current.vantage),
    limitations,
    reviewCount: events.length,
    events,
    availableObservationCount: input.availableObservationCount ?? 2,
    scenario: input.scenario ?? null,
  };
}

export function buildSyntheticNetworkActivityScenario(
  options: BuildNetworkActivityOptions = {}
): NetworkActivityModel {
  const generatedAt = optionIsoOrNow(options.evaluatedAt ?? "2026-06-19T16:00:00.000Z");
  const baseline = syntheticRecord(
    createSyntheticObservationBundle({
      observationId: "obs-guided-baseline",
      batchId: "batch-guided-baseline",
      sourceRunUid: "run-guided-baseline",
      observedAt: "2026-06-18T15:00:00.000Z",
      devices: [
        syntheticDevice({
          deviceId: "family-laptop",
          ips: ["192.0.2.10"],
          macs: ["02:00:00:00:00:10"],
          hostnames: ["family-laptop.local"],
          vendors: ["Example Devices"],
          ports: [
            syntheticPort(22, "tcp", "ssh"),
            syntheticPort(80, "tcp", "http"),
          ],
        }),
        syntheticDevice({
          deviceId: "office-printer",
          ips: ["192.0.2.20"],
          macs: ["02:00:00:00:00:20"],
          hostnames: ["office-printer.local"],
          vendors: ["Example Printers"],
          ports: [syntheticPort(9100, "tcp", "jetdirect")],
        }),
        syntheticDevice({
          deviceId: "guest-speaker-baseline",
          ips: ["192.0.2.50"],
          hostnames: ["guest-speaker.local"],
          vendors: ["Example Audio"],
          ports: [],
        }),
      ],
    }),
    generatedAt
  );
  const current = syntheticRecord(
    createSyntheticObservationBundle({
      observationId: "obs-guided-current",
      batchId: "batch-guided-current",
      sourceRunUid: "run-guided-current",
      observedAt: "2026-06-19T15:00:00.000Z",
      devices: [
        syntheticDevice({
          deviceId: "family-laptop",
          ips: ["192.0.2.14"],
          macs: ["02:00:00:00:00:10"],
          hostnames: ["family-laptop.local", "family-laptop-wifi.local"],
          vendors: ["Example Devices"],
          ports: [
            syntheticPort(80, "tcp", "http"),
            syntheticPort(443, "tcp", "https"),
          ],
        }),
        syntheticDevice({
          deviceId: "guest-tablet",
          ips: ["192.0.2.30"],
          macs: ["02:00:00:00:00:30"],
          hostnames: ["guest-tablet.local"],
          vendors: ["Example Mobile"],
          ports: [],
        }),
        syntheticDevice({
          deviceId: "guest-speaker-current",
          ips: ["192.0.2.50"],
          hostnames: ["guest-speaker.local"],
          vendors: ["Example Audio"],
          ports: [],
        }),
      ],
    }),
    generatedAt
  );
  const comparison = compareObservationBundlesV1(baseline.bundle, current.bundle, {
    evaluatedAt: generatedAt,
  });

  return shapeNetworkActivityComparison({
    baseline,
    current,
    comparison,
    generatedAt,
    source: "synthetic-guided-scenario",
    scenario: {
      title: "One-minute guided scenario",
      steps: [
        "Start with the review count and limitations.",
        "Scan the event titles without opening technical evidence.",
        "Open one evidence section to confirm the comparison period and source-backed identifiers.",
      ],
    },
    availableObservationCount: 2,
  });
}

function findLatestValidObservationPair(
  entries: ObservationRegistryEntry[],
  freshnessOptions: ObservationFreshnessOptions
): Pick<ShapeComparisonInput, "baseline" | "current" | "comparison"> | null {
  for (let currentIndex = 0; currentIndex < entries.length; currentIndex += 1) {
    const currentEntry = entries[currentIndex];
    const currentObservedAt = observationTime(currentEntry);
    if (!currentObservedAt) continue;

    for (let baselineIndex = currentIndex + 1; baselineIndex < entries.length; baselineIndex += 1) {
      const baselineEntry = entries[baselineIndex];
      const baselineObservedAt = observationTime(baselineEntry);
      if (!baselineObservedAt || baselineObservedAt >= currentObservedAt) continue;

      const baseline = getObservationById(baselineEntry.registryId, freshnessOptions);
      const current = getObservationById(currentEntry.registryId, freshnessOptions);
      if (!baseline || !current) continue;

      try {
        return {
          baseline,
          current,
          comparison: compareObservationBundlesV1(baseline.bundle, current.bundle, {
            evaluatedAt: freshnessOptions.evaluatedAt,
          }),
        };
      } catch (error) {
        if (isObservationComparisonError(error)) continue;
        throw error;
      }
    }
  }

  return null;
}

function entriesForLatestSite(entries: ObservationRegistryEntry[]): ObservationRegistryEntry[] {
  const sorted = [...entries].sort((a, b) => compareEntryTimeDesc(a, b));
  const latest = sorted[0];
  if (!latest) return [];
  return sorted.filter(
    (entry) => entry.site.siteId.toLowerCase() === latest.site.siteId.toLowerCase()
  );
}

function emptyActivity(generatedAt: string, source: NetworkActivitySource): NetworkActivityModel {
  return {
    status: "empty",
    source,
    generatedAt,
    title: DEFAULT_ACTIVITY_TITLE,
    summary:
      "No observations are available yet. Import observation bundles to compare what changed, or open the guided scenario.",
    site: null,
    latestObservation: null,
    period: null,
    coverage: null,
    limitations: [
      {
        code: "no-observations",
        severity: "info",
        message: "A comparison requires at least two observations for the same site.",
      },
    ],
    reviewCount: 0,
    events: [],
    availableObservationCount: 0,
    scenario: null,
  };
}

function oneObservationActivity(
  entry: ObservationRegistryEntry,
  generatedAt: string,
  source: NetworkActivitySource,
  availableObservationCount: number
): NetworkActivityModel {
  return {
    status: "one-observation",
    source,
    generatedAt,
    title: DEFAULT_ACTIVITY_TITLE,
    summary: "One observation is available. A useful comparison requires at least two observations for the same site.",
    site: {
      networkName: entry.networkName,
      networkScope: entry.site.networkScope,
    },
    latestObservation: latestObservationFromEntry(entry),
    period: null,
    coverage: coverageFromEntry(entry),
    limitations: [
      {
        code: "one-observation",
        severity: "info",
        message: "No change timeline is shown until there is an earlier observation to compare against.",
      },
      ...limitationsFromFreshness(entry),
    ],
    reviewCount: 0,
    events: [],
    availableObservationCount,
    scenario: null,
  };
}

function noComparisonActivity(
  entry: ObservationRegistryEntry,
  generatedAt: string,
  source: NetworkActivitySource,
  availableObservationCount: number
): NetworkActivityModel {
  return {
    status: "no-comparison",
    source,
    generatedAt,
    title: DEFAULT_ACTIVITY_TITLE,
    summary:
      "Observations are available, but the latest site does not yet have two observations with a usable earlier-to-later comparison.",
    site: {
      networkName: entry.networkName,
      networkScope: entry.site.networkScope,
    },
    latestObservation: latestObservationFromEntry(entry),
    period: null,
    coverage: coverageFromEntry(entry),
    limitations: [
      {
        code: "no-valid-comparison",
        severity: "warning",
        message:
          "The activity page only compares distinct observations from the same site with usable collection times.",
      },
      ...limitationsFromFreshness(entry),
    ],
    reviewCount: 0,
    events: [],
    availableObservationCount,
    scenario: null,
  };
}

function buildActivitySummary(eventCount: number, limitationCount: number): string {
  if (eventCount > 0) {
    return `${eventCount} evidence-bounded ${pluralize("change", eventCount)} need review since the prior useful observation.`;
  }

  if (limitationCount > 0) {
    return "No meaningful changes were found in this comparison. Read the coverage and freshness limitations before treating that as complete.";
  }

  return "No meaningful changes were found in this comparison. This is not an all-clear; it only reflects the available observation evidence.";
}

function buildLimitations(
  comparison: ObservationComparisonResult,
  current: ObservationRegistryRecord
): NetworkActivityLimitation[] {
  const limitations: NetworkActivityLimitation[] = comparison.guardrails.map((guardrail) => ({
    code: guardrail.code,
    severity: guardrail.severity,
    message: guardrail.message,
  }));

  limitations.push(...limitationsFromFreshness(current));
  limitations.push(
    ...coverageLimitations("baseline", comparison.coverageContext.baseline),
    ...coverageLimitations("current", comparison.coverageContext.current)
  );

  for (const note of comparison.coverageContext.notes) {
    limitations.push({
      code: `coverage-note-${hashCode(note)}`,
      severity: "info",
      message: note,
    });
  }

  return uniqueLimitations(limitations);
}

function limitationsFromFreshness(
  entry: ObservationRegistryEntry | ObservationRegistryRecord
): NetworkActivityLimitation[] {
  if (entry.freshness.status === "fresh") return [];

  return [
    {
      code: `freshness-${entry.freshness.status}`,
      severity: entry.freshness.status === "aging" ? "info" : "warning",
      message: entry.freshness.reason,
    },
  ];
}

function coverageLimitations(
  side: "baseline" | "current",
  snapshot: ObservationComparisonCoverageSnapshot
): NetworkActivityLimitation[] {
  const limitations: NetworkActivityLimitation[] = [];
  if (snapshot.missingSources.length > 0) {
    limitations.push({
      code: `${side}-missing-sources`,
      severity: "warning",
      message: `${capitalize(side)} observation is missing ${formatSourceList(snapshot.missingSources)}.`,
    });
  }

  for (const note of snapshot.notes) {
    limitations.push({
      code: `${side}-coverage-note-${hashCode(note)}`,
      severity: "info",
      message: note,
    });
  }

  return limitations;
}

function shapeActivityEvent(
  event: ObservationChangeEvent,
  siteId: string
): NetworkActivityEvent {
  const copy = eventCopy(event.eventType);
  const deviceResponse = shapeActivityDeviceResponse(event, siteId);
  const technicalEvidence = {
    ruleId: event.rule.ruleId,
    ruleVersion: event.rule.version,
    baselineObservationId: event.observations.baseline.observationId,
    currentObservationId: event.observations.current.observationId,
    identityRuleId: event.identityEvidence.ruleId,
    identityEvidenceIds: {
      baseline: event.identityEvidence.baselineEvidenceIds,
      current: event.identityEvidence.currentEvidenceIds,
    },
    identityValues: event.identityEvidence.values,
    baselineDevice: technicalDevice(event.baselineDevice),
    currentDevice: technicalDevice(event.currentDevice),
    port: technicalPort(event),
    changedFields: event.details.changedFields ?? [],
    notes: event.details.notes,
  };

  return {
    eventId: event.eventId,
    type: event.eventType,
    title: copy.title,
    summary: copy.summary,
    reviewReason: copy.reviewReason,
    confidence: event.confidence,
    confidenceLabel: confidenceLabel(event.confidence),
    workflowPriority: workflowPriorityFor(deviceResponse),
    deviceResponse,
    periodHref: ACTIVITY_PERIOD_ANCHOR,
    evidenceId: `evidence-${event.eventId}`,
    evidenceSummary:
      "Evidence includes deterministic comparison rules, identity confidence, observation references, and source-backed details.",
    technicalEvidence,
  };
}

function shapeActivityDeviceResponse(
  event: ObservationChangeEvent,
  siteId: string
): ActivityDeviceResponse {
  if (event.eventType === "identity-uncertain-possibly-same-device") {
    return {
      target: null,
      statement: null,
      carriedForward: null,
      unavailableReason:
        "Device identity is uncertain, so no persisted user response is applied to this event.",
    };
  }

  const subjectDevice = event.currentDevice ?? event.baselineDevice;
  if (!subjectDevice) {
    return {
      target: null,
      statement: null,
      carriedForward: null,
      unavailableReason: "No device target is available for this event.",
    };
  }

  const target = buildDeviceResponseTarget({
    siteId,
    observationId: subjectDevice.observationId,
    deviceId: subjectDevice.deviceId,
    macs: subjectDevice.macs,
    identityRuleId: event.identityEvidence.ruleId,
    identityValues: event.identityEvidence.values,
  });

  if (!target) {
    return {
      target: null,
      statement: null,
      carriedForward: null,
      unavailableReason:
        "This device does not have stable identity evidence for a persisted response.",
    };
  }

  const record = getDeviceResponseForTarget(target);
  if (!record) {
    return {
      target,
      statement: null,
      carriedForward: null,
      unavailableReason: null,
    };
  }

  const sameObservation = record.updatedFrom.observationId === target.observationId;
  if (sameObservation) {
    return {
      target,
      statement: statementFromDeviceResponse(record),
      carriedForward: null,
      unavailableReason: null,
    };
  }

  const carriedForward = carryForwardFor(event, target, record);
  if (!carriedForward) {
    return {
      target,
      statement: null,
      carriedForward: null,
      unavailableReason: null,
    };
  }

  return {
    target,
    statement: statementFromDeviceResponse(record),
    carriedForward,
    unavailableReason: null,
  };
}

function carryForwardFor(
  event: ObservationChangeEvent,
  target: DeviceResponseTarget,
  record: DeviceResponseRecord
): DeviceResponseCarryForward | null {
  if (!isStrongConfirmedIdentityEvent(event, target)) return null;

  return {
    fromObservationId: record.updatedFrom.observationId,
    updatedAt: record.updatedAt,
    reason: `Carried forward because ${target.identity.label} matched with ${target.confidence} identity confidence.`,
  };
}

function isStrongConfirmedIdentityEvent(
  event: ObservationChangeEvent,
  target: DeviceResponseTarget
): boolean {
  if (event.eventType === "identity-uncertain-possibly-same-device") return false;
  if (event.confidence !== "strongest" && event.confidence !== "strong") return false;

  const expectedRule: Record<DeviceResponseTarget["identity"]["kind"], string> = {
    "persisted-device-id": "identity.persisted-device-id",
    "mac-address": "identity.mac",
    "hashed-mac": "identity.hashed-mac",
  };

  return event.identityEvidence.ruleId === expectedRule[target.identity.kind];
}

function workflowPriorityFor(
  deviceResponse: ActivityDeviceResponse
): NetworkActivityEvent["workflowPriority"] {
  if (deviceResponse.statement?.state === "investigate") {
    return {
      level: "user-investigate",
      label: "Investigate requested",
      reason: "A user response raised this item for review. It does not change technical evidence or safety status.",
      responseState: "investigate",
    };
  }

  return {
    level: "normal",
    label: "Normal review",
    reason: "Priority is based on the comparison event and any user response.",
    responseState: deviceResponse.statement?.state ?? null,
  };
}

function compareActivityEvents(a: NetworkActivityEvent, b: NetworkActivityEvent): number {
  const priorityDiff = priorityRank(a) - priorityRank(b);
  if (priorityDiff !== 0) return priorityDiff;
  return 0;
}

function priorityRank(event: NetworkActivityEvent): number {
  return event.workflowPriority.level === "user-investigate" ? 0 : 1;
}

function eventCopy(eventType: ObservationChangeEventType): {
  title: string;
  summary: string;
  reviewReason: string;
} {
  switch (eventType) {
    case "new-device-observed":
      return {
        title: "New device observed",
        summary:
          "A device appeared in the current observation without a confirmed match in the prior observation.",
        reviewReason:
          "Confirm whether this device is expected. The label only means it was not confirmed against the prior observation.",
      };
    case "previously-observed-device-not-observed":
      return {
        title: "Previously observed device not seen",
        summary:
          "A device from the prior observation was not observed this time with the available coverage.",
        reviewReason: "Check whether it was offline, removed, or outside the current collection coverage.",
      };
    case "identity-uncertain-possibly-same-device":
      return {
        title: "Device identity uncertain",
        summary:
          "Two observations shared weak or overlapping identity evidence, so the engine did not merge them.",
        reviewReason: "Review before treating this as a new or missing device.",
      };
    case "service-or-port-opened":
      return {
        title: "Service appeared on a matched device",
        summary: "A network service was observed this time that was not observed before.",
        reviewReason: "Confirm whether the newly observed service is expected.",
      };
    case "service-or-port-closed":
      return {
        title: "Service no longer observed",
        summary: "A previously observed network service was not observed this time.",
        reviewReason: "No action may be needed; check whether the change was planned.",
      };
    case "important-device-metadata-changed":
      return {
        title: "Device metadata changed",
        summary: "A matched device reported different metadata between observations.",
        reviewReason: "Confirm whether the observed label or address evidence changed as expected.",
      };
  }
}

function coverageFromComparison(
  snapshot: ObservationComparisonCoverageSnapshot,
  vantage: CollectionVantage
): NetworkActivityCoverage {
  return {
    status: snapshot.status,
    score: snapshot.score,
    freshnessStatus: snapshot.freshness.status,
    sources: {
      present: snapshot.presentSources.map(sourceLabel),
      missing: snapshot.missingSources.map(sourceLabel),
      expected: snapshot.expectedSources.map(sourceLabel),
    },
    vantage: {
      label: vantageLabel(vantage),
      runType: vantage.runType,
      networkName: vantage.networkName,
    },
    technicalVantage: {
      collectorHost: vantage.collectorHost,
      target: vantage.target,
      notes: vantage.notes,
    },
  };
}

function coverageFromEntry(entry: ObservationRegistryEntry): NetworkActivityCoverage {
  return {
    status: entry.coverage.status,
    score: entry.coverage.score,
    freshnessStatus: entry.freshness.cadenceStatus === "stale" ? "stale" : "fresh",
    sources: {
      present: entry.coverage.presentSources.map(sourceLabel),
      missing: entry.coverage.missingSources.map(sourceLabel),
      expected: entry.coverage.expectedSources.map(sourceLabel),
    },
    vantage: {
      label: vantageLabel(entry.vantage),
      runType: entry.vantage.runType,
      networkName: entry.vantage.networkName,
    },
    technicalVantage: {
      collectorHost: entry.vantage.collectorHost,
      target: entry.vantage.target,
      notes: entry.vantage.notes,
    },
  };
}

function latestObservationFromRecord(
  record: ObservationRegistryRecord
): NetworkActivityLatestObservation {
  return latestObservationFromEntry(record);
}

function latestObservationFromEntry(
  entry: ObservationRegistryEntry
): NetworkActivityLatestObservation {
  return {
    observationId: entry.observationId,
    checkedAt: observationTime(entry),
    freshnessStatus: entry.freshness.status,
    freshnessReason: entry.freshness.reason,
    deviceCount: entry.deviceCount,
  };
}

function technicalDevice(
  device: ObservationChangeEvent["baselineDevice"]
): NetworkActivityTechnicalDevice | null {
  if (!device) return null;

  return {
    deviceId: device.deviceId,
    ips: device.ips,
    macs: device.macs,
    hostnames: device.hostnames,
    vendors: device.vendors,
  };
}

function technicalPort(event: ObservationChangeEvent): NetworkActivityTechnicalPort | null {
  if (event.details.currentPort) {
    return portEvidence(event.details.currentPort, "opened");
  }
  if (event.details.baselinePort) {
    return portEvidence(event.details.baselinePort, "closed");
  }
  return null;
}

function portEvidence(
  port: ObservationComparisonPortRef,
  direction: "opened" | "closed"
): NetworkActivityTechnicalPort {
  return {
    direction,
    protocol: port.protocol,
    port: port.port,
    service: port.service,
    product: port.product,
    version: port.version,
    sourceId: port.sourceId,
  };
}

function createSyntheticObservationBundle(input: {
  observationId: string;
  batchId: string;
  sourceRunUid: string;
  observedAt: string;
  devices: ObservationDevice[];
}): ObservationBundleV1 {
  const sources: ObservationSourceRef[] = [
    syntheticSource("src-synthetic-ports", "nmap-xml", "ports", input.devices.length),
    syntheticSource("src-synthetic-discovery", "nmap-xml", "discovery", input.devices.length),
    syntheticSource("src-synthetic-hosts-up", "hosts-up", "hosts_up", input.devices.length),
    syntheticSource("src-synthetic-arp", "arp-snapshot", "arp_snapshot", input.devices.length),
    syntheticSource("src-synthetic-metadata", "scan-metadata", "scan_metadata", 1),
  ];

  return {
    schemaVersion: "psec.observation-bundle.v1",
    observationId: input.observationId,
    site: {
      siteId: "site-guided-home",
      networkName: "Guided home network",
      networkScope: "192.0.2.0/24",
    },
    collector: {
      collectorId: "synthetic-guided-collector",
      kind: "registered-scan-run",
      name: "Synthetic guided collector",
      version: "issue-32",
    },
    batch: {
      batchId: input.batchId,
      sourceRunUid: input.sourceRunUid,
      startedAt: input.observedAt,
      endedAt: input.observedAt,
      generatedAt: input.observedAt,
      partial: false,
      notes: ["Synthetic guided scenario; no real household data is included."],
    },
    sources,
    vantage: {
      type: "active-scan-upload",
      runType: "guided-scenario",
      networkName: "Guided home network",
      collectorHost: "synthetic-collector",
      target: "192.0.2.0/24",
      notes: ["Fully synthetic TEST-NET evidence for the guided activity page."],
    },
    coverage: {
      status: "complete",
      score: 1,
      expectedSources: ["ports", "discovery", "hosts_up", "arp_snapshot", "scan_metadata"],
      presentSources: ["ports", "discovery", "hosts_up", "arp_snapshot", "scan_metadata"],
      missingSources: [],
      notes: [],
    },
    devices: input.devices,
    notes: ["Synthetic guided scenario."],
  };
}

function syntheticRecord(
  bundle: ObservationBundleV1,
  evaluatedAt: string
): ObservationRegistryRecord {
  return {
    registryId: `synthetic-${bundle.observationId}`,
    observationId: bundle.observationId,
    contentHash: `synthetic-${bundle.observationId}`,
    importedAt: bundle.batch.generatedAt,
    site: bundle.site,
    networkName: bundle.site.networkName,
    batch: bundle.batch,
    sources: bundle.sources,
    vantage: bundle.vantage,
    coverage: bundle.coverage,
    timeRange: {
      startedAt: bundle.batch.startedAt,
      endedAt: bundle.batch.endedAt,
      generatedAt: bundle.batch.generatedAt,
    },
    freshness: {
      status: "fresh",
      cadenceStatus: "fresh",
      evaluatedAt,
      observedAt: bundle.batch.endedAt,
      dueAt: "2026-07-19T15:00:00.000Z",
      graceEndsAt: "2026-07-26T15:00:00.000Z",
      ageDays: 0,
      cadenceDays: 30,
      graceDays: 7,
      reason: "Observation is within the collection cadence.",
    },
    deviceCount: bundle.devices.length,
    notes: bundle.notes,
    bundle,
  };
}

function syntheticDevice(input: {
  deviceId: string;
  ips?: string[];
  macs?: string[];
  hostnames?: string[];
  vendors?: string[];
  ports?: ObservationOpenPort[];
}): ObservationDevice {
  const sourceId = "src-synthetic-ports";
  const identityEvidence: DeviceIdentityEvidence[] = [
    ...(input.ips ?? []).map((value) => syntheticEvidence("ip-address", value, sourceId)),
    ...(input.macs ?? []).map((value) => syntheticEvidence("mac-address", value, sourceId)),
    ...(input.hostnames ?? []).map((value) =>
      syntheticEvidence("hostname", value, sourceId, "reported")
    ),
    ...(input.vendors ?? []).map((value) =>
      syntheticEvidence("vendor", value, sourceId, "reported")
    ),
  ];

  return {
    deviceId: input.deviceId,
    firstSeen: null,
    lastSeen: null,
    ips: input.ips ?? [],
    macs: input.macs ?? [],
    hostnames: input.hostnames ?? [],
    vendors: input.vendors ?? [],
    identityEvidence,
    openPorts: input.ports ?? [],
    notes: [],
  };
}

function syntheticPort(
  port: number,
  protocol: string,
  service: string
): ObservationOpenPort {
  return {
    protocol,
    port,
    state: "open",
    service,
    product: null,
    version: null,
    sourceId: "src-synthetic-ports",
  };
}

function syntheticSource(
  sourceId: string,
  kind: ObservationSourceKind,
  artifactLabel: string,
  recordCount: number
): ObservationSourceRef {
  return {
    sourceId,
    kind,
    artifactLabel,
    fileName: `${artifactLabel}.synthetic`,
    parsed: true,
    recordCount,
    notes: [],
  };
}

function syntheticEvidence(
  kind: DeviceIdentityEvidence["kind"],
  value: string,
  sourceId: string,
  confidence: DeviceIdentityEvidence["confidence"] = "observed"
): DeviceIdentityEvidence {
  return {
    evidenceId: `ev-${kind}-${value.replace(/[^a-z0-9]/gi, "-").slice(0, 40)}`,
    kind,
    value,
    sourceId,
    confidence,
  };
}

function observationTime(entry: ObservationRegistryEntry): string | null {
  return entry.timeRange.endedAt ?? entry.timeRange.startedAt ?? entry.timeRange.generatedAt;
}

function compareEntryTimeDesc(a: ObservationRegistryEntry, b: ObservationRegistryEntry): number {
  const aTime = timeValue(observationTime(a));
  const bTime = timeValue(observationTime(b));
  const diff = bTime - aTime;
  if (diff !== 0) return diff;
  return a.registryId.localeCompare(b.registryId);
}

function timeValue(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatShortDate(value: string | null): string {
  if (!value) return "unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function optionIsoOrNow(value: string | Date | undefined): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date().toISOString() : value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

function confidenceLabel(confidence: ObservationIdentityConfidence): string {
  const labels: Record<ObservationIdentityConfidence, string> = {
    strongest: "Strongest identity confidence",
    strong: "Strong identity confidence",
    medium: "Medium identity confidence",
    low: "Low identity confidence",
  };
  return labels[confidence];
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    ports: "port scan",
    discovery: "discovery scan",
    hosts_up: "host-up list",
    arp_snapshot: "ARP snapshot",
    scan_metadata: "scan metadata",
  };
  return labels[source] ?? source.replace(/_/g, " ");
}

function vantageLabel(vantage: CollectionVantage): string {
  if (vantage.type === "active-scan-upload") return "Active scan upload";
  return "Collection";
}

function formatSourceList(sources: string[]): string {
  return sources.map(sourceLabel).join(", ");
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function uniqueLimitations(limitations: NetworkActivityLimitation[]): NetworkActivityLimitation[] {
  const seen = new Set<string>();
  const unique: NetworkActivityLimitation[] = [];

  for (const limitation of limitations) {
    const key = `${limitation.code}|${limitation.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(limitation);
  }

  return unique;
}

function hashCode(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}
