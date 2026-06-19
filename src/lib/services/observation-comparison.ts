import { hashString } from "@/lib/utils/hash";
import type {
  DeviceIdentityEvidence,
  ObservationBundleV1,
  ObservationDevice,
  ObservationEvidenceKind,
  ObservationOpenPort,
} from "@/lib/types/observation-bundle";
import type {
  ObservationChangeEvent,
  ObservationChangeEventDetails,
  ObservationChangeEventType,
  ObservationComparisonCoverageContext,
  ObservationComparisonCoverageSnapshot,
  ObservationComparisonDeviceRef,
  ObservationComparisonFreshnessContext,
  ObservationComparisonGuardrail,
  ObservationComparisonIdentityEvidence,
  ObservationComparisonObservationRef,
  ObservationComparisonResult,
  ObservationComparisonRuleMetadata,
  ObservationIdentityConfidence,
} from "@/lib/types/observation-comparison";

export const OBSERVATION_COMPARISON_RULE_VERSION = "psec.observation-comparison.v1" as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_STALE_AFTER_DAYS = 37;

export type ObservationComparisonErrorCode =
  | "different_sites"
  | "identical_observations"
  | "missing_timestamp"
  | "reversed_chronology"
  | "ambiguous_comparison";

export class ObservationComparisonError extends Error {
  code: ObservationComparisonErrorCode;

  constructor(code: ObservationComparisonErrorCode, message: string) {
    super(message);
    this.name = "ObservationComparisonError";
    this.code = code;
  }
}

export function isObservationComparisonError(
  error: unknown
): error is ObservationComparisonError {
  return (
    error instanceof ObservationComparisonError ||
    (error instanceof Error && error.name === "ObservationComparisonError")
  );
}

export interface ObservationComparisonOptions {
  evaluatedAt?: string | Date;
  staleAfterDays?: number;
}

interface DeviceInfo {
  bundle: ObservationBundleV1;
  device: ObservationDevice;
  ref: ObservationComparisonDeviceRef;
  sortKey: string;
  explicitIdentityKeys: string[];
  macKeys: string[];
  hashedMacKeys: string[];
  hostnameVendorKeys: string[];
  ipKeys: string[];
}

interface CandidateMatch {
  baseline: DeviceInfo;
  current: DeviceInfo;
  confidence: ObservationIdentityConfidence;
  identityRuleId: string;
  values: string[];
  evidenceKinds: ObservationEvidenceKind[];
  summary: string;
}

type ConfirmedMatch = CandidateMatch;

interface MatchPlan {
  confirmed: ConfirmedMatch[];
  uncertain: CandidateMatch[];
  ambiguousIdentity: boolean;
}

export function compareObservationBundlesV1(
  baseline: ObservationBundleV1,
  current: ObservationBundleV1,
  options: ObservationComparisonOptions = {}
): ObservationComparisonResult {
  const baselineRef = observationRef(baseline);
  const currentRef = observationRef(current);
  validateComparisonInputs(baseline, current, baselineRef, currentRef);

  const staleAfterDays = positiveInteger(options.staleAfterDays) ?? DEFAULT_STALE_AFTER_DAYS;
  const evaluatedAt = optionIsoOrNull(options.evaluatedAt) ?? currentRef.observedAt!;
  const coverageContext = buildCoverageContext(baseline, current, evaluatedAt, staleAfterDays);
  const guardrails = buildGuardrails(coverageContext);
  const baselineDevices = baseline.devices.map((device) => buildDeviceInfo(baseline, device));
  const currentDevices = current.devices.map((device) => buildDeviceInfo(current, device));
  const matchPlan = planDeviceMatches(baselineDevices, currentDevices);

  if (matchPlan.ambiguousIdentity) {
    guardrails.push({
      code: "ambiguous-identity",
      severity: "warning",
      message:
        "One or more devices had overlapping identity evidence with multiple candidates; those devices were left as uncertain matches.",
    });
  }

  const events: ObservationChangeEvent[] = [];
  const matchedBaselineIds = new Set(matchPlan.confirmed.map((match) => deviceKey(match.baseline)));
  const matchedCurrentIds = new Set(matchPlan.confirmed.map((match) => deviceKey(match.current)));
  const uncertainBaselineIds = new Set(matchPlan.uncertain.map((match) => deviceKey(match.baseline)));
  const uncertainCurrentIds = new Set(matchPlan.uncertain.map((match) => deviceKey(match.current)));

  for (const match of matchPlan.uncertain) {
    events.push(
      buildEvent({
        eventType: "identity-uncertain-possibly-same-device",
        summary: uncertainSummary(match),
        baselineRef,
        currentRef,
        baselineDevice: match.baseline,
        currentDevice: match.current,
        identityEvidence: identityEvidenceForCandidate(match),
        confidence: match.confidence,
        coverageContext,
        ruleId: "identity.uncertain",
        details: {
          notes: [
            "The engine did not treat these observations as the same device without stronger evidence.",
          ],
        },
      })
    );
  }

  for (const match of matchPlan.confirmed) {
    events.push(
      ...buildPortChangeEvents(match, baselineRef, currentRef, coverageContext),
      ...buildMetadataChangeEvents(match, baselineRef, currentRef, coverageContext)
    );
  }

  for (const info of currentDevices) {
    const key = deviceKey(info);
    if (matchedCurrentIds.has(key) || uncertainCurrentIds.has(key)) continue;

    const identityEvidence = unmatchedIdentityEvidence(info, "identity.no-baseline-match");
    events.push(
      buildEvent({
        eventType: "new-device-observed",
        summary: "A device was observed in the current observation without a confirmed baseline match.",
        baselineRef,
        currentRef,
        baselineDevice: null,
        currentDevice: info,
        identityEvidence,
        confidence: confidenceForNewDevice(info, coverageContext),
        coverageContext,
        ruleId: "device.new-observed",
        details: {
          notes: [
            "This means the device was observed in the current data; it is not a malware or intrusion verdict.",
          ],
        },
      })
    );
  }

  if (currentCoverageSupportsAbsence(current)) {
    for (const info of baselineDevices) {
      const key = deviceKey(info);
      if (matchedBaselineIds.has(key) || uncertainBaselineIds.has(key)) continue;

      const identityEvidence = unmatchedIdentityEvidence(info, "identity.no-current-match");
      events.push(
        buildEvent({
          eventType: "previously-observed-device-not-observed",
          summary:
            "A baseline device was not observed in the current observation with the available coverage.",
          baselineRef,
          currentRef,
          baselineDevice: info,
          currentDevice: null,
          identityEvidence,
          confidence: identityEvidence.confidence,
          coverageContext,
          ruleId: "device.not-observed",
          details: {
            notes: [
              "This event is limited to observation evidence and does not prove the device was removed.",
            ],
          },
        })
      );
    }
  }

  const sortedEvents = events
    .map(assignDeterministicEventId)
    .sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)));

  return {
    ruleVersion: OBSERVATION_COMPARISON_RULE_VERSION,
    site: {
      siteId: baseline.site.siteId,
      networkName: baseline.site.networkName,
      networkScope: baseline.site.networkScope,
    },
    observations: {
      baseline: baselineRef,
      current: currentRef,
    },
    coverageContext,
    guardrails: sortGuardrails(guardrails),
    events: sortedEvents,
  };
}

function validateComparisonInputs(
  baseline: ObservationBundleV1,
  current: ObservationBundleV1,
  baselineRef: ObservationComparisonObservationRef,
  currentRef: ObservationComparisonObservationRef
): void {
  if (baseline.site.siteId.toLowerCase() !== current.site.siteId.toLowerCase()) {
    throw new ObservationComparisonError(
      "different_sites",
      "Observation comparison requires both observations to reference the same site."
    );
  }

  if (
    baseline.observationId === current.observationId ||
    stableStringify(baseline) === stableStringify(current)
  ) {
    throw new ObservationComparisonError(
      "identical_observations",
      "Observation comparison requires two distinct observations."
    );
  }

  if (!baselineRef.observedAt || !currentRef.observedAt) {
    throw new ObservationComparisonError(
      "missing_timestamp",
      "Observation comparison requires usable collection timestamps for both observations."
    );
  }

  if (baselineRef.observedAt > currentRef.observedAt) {
    throw new ObservationComparisonError(
      "reversed_chronology",
      "Observation comparison requires the baseline observation to be earlier than the current observation."
    );
  }

  if (baselineRef.observedAt === currentRef.observedAt) {
    throw new ObservationComparisonError(
      "ambiguous_comparison",
      "Observation comparison is ambiguous because both observations have the same collection timestamp."
    );
  }
}

function planDeviceMatches(
  baselineDevices: DeviceInfo[],
  currentDevices: DeviceInfo[]
): MatchPlan {
  const confirmed: ConfirmedMatch[] = [];
  const uncertain: CandidateMatch[] = [];
  const matchedBaseline = new Set<string>();
  const matchedCurrent = new Set<string>();
  const blockedBaseline = new Set<string>();
  const blockedCurrent = new Set<string>();
  let ambiguousIdentity = false;

  const tiers: Array<{
    confidence: ObservationIdentityConfidence;
    ruleId: string;
    keys: (device: DeviceInfo) => string[];
    evidenceKinds: ObservationEvidenceKind[];
    summary: string;
  }> = [
    {
      confidence: "strongest",
      ruleId: "identity.persisted-device-id",
      keys: (device) => device.explicitIdentityKeys,
      evidenceKinds: [],
      summary: "Device identity matched by an explicit persisted device identifier.",
    },
    {
      confidence: "strong",
      ruleId: "identity.mac",
      keys: (device) => device.macKeys,
      evidenceKinds: ["mac-address"],
      summary: "Device identity matched by exact MAC address evidence.",
    },
    {
      confidence: "strong",
      ruleId: "identity.hashed-mac",
      keys: (device) => device.hashedMacKeys,
      evidenceKinds: ["mac-address"],
      summary: "Device identity matched by stable hashed-MAC evidence.",
    },
  ];

  for (const tier of tiers) {
    const candidates = buildCandidates(
      baselineDevices,
      currentDevices,
      combinedSet(matchedBaseline, blockedBaseline),
      combinedSet(matchedCurrent, blockedCurrent),
      tier.confidence,
      tier.ruleId,
      tier.keys,
      tier.evidenceKinds,
      tier.summary
    );
    const selected = selectUniqueCandidates(candidates);

    for (const match of selected.confirmed) {
      confirmed.push(match);
      matchedBaseline.add(deviceKey(match.baseline));
      matchedCurrent.add(deviceKey(match.current));
    }

    if (selected.ambiguous.length > 0) {
      ambiguousIdentity = true;
      uncertain.push(...selected.ambiguous);
      for (const match of selected.ambiguous) {
        blockedBaseline.add(deviceKey(match.baseline));
        blockedCurrent.add(deviceKey(match.current));
      }
    }
  }

  const hostnameVendorCandidates = buildCandidates(
    baselineDevices,
    currentDevices,
    combinedSet(matchedBaseline, blockedBaseline),
    combinedSet(matchedCurrent, blockedCurrent),
    "medium",
    "identity.hostname-vendor",
    (device) => device.hostnameVendorKeys,
    ["hostname", "vendor"],
    "Hostname and vendor evidence overlapped, but reported labels alone are not stable identity proof."
  );
  const hostnameVendorSelected = selectUniqueCandidates(hostnameVendorCandidates);
  const hostnameVendorUncertain = [
    ...hostnameVendorSelected.confirmed,
    ...hostnameVendorSelected.ambiguous,
  ];
  if (hostnameVendorSelected.ambiguous.length > 0) {
    ambiguousIdentity = true;
  }
  uncertain.push(...hostnameVendorUncertain);
  for (const match of hostnameVendorUncertain) {
    blockedBaseline.add(deviceKey(match.baseline));
    blockedCurrent.add(deviceKey(match.current));
  }

  const lowConfidenceCandidates = buildCandidates(
    baselineDevices,
    currentDevices,
    combinedSet(matchedBaseline, blockedBaseline),
    combinedSet(matchedCurrent, blockedCurrent),
    "low",
    "identity.ip-continuity",
    (device) => device.ipKeys,
    ["ip-address"],
    "The observations share IP address continuity only."
  );
  uncertain.push(...lowConfidenceCandidates);

  return {
    confirmed: uniqueCandidates(confirmed),
    uncertain: uniqueCandidates(uncertain),
    ambiguousIdentity,
  };
}

function buildCandidates(
  baselineDevices: DeviceInfo[],
  currentDevices: DeviceInfo[],
  matchedBaseline: Set<string>,
  matchedCurrent: Set<string>,
  confidence: ObservationIdentityConfidence,
  identityRuleId: string,
  keysFor: (device: DeviceInfo) => string[],
  evidenceKinds: ObservationEvidenceKind[],
  summary: string
): CandidateMatch[] {
  const candidates: CandidateMatch[] = [];

  for (const baseline of baselineDevices) {
    if (matchedBaseline.has(deviceKey(baseline))) continue;

    const baselineKeys = keysFor(baseline);
    if (baselineKeys.length === 0) continue;

    for (const current of currentDevices) {
      if (matchedCurrent.has(deviceKey(current))) continue;

      const values = sortedIntersection(baselineKeys, keysFor(current));
      if (values.length === 0) continue;

      candidates.push({
        baseline,
        current,
        confidence,
        identityRuleId,
        values,
        evidenceKinds,
        summary,
      });
    }
  }

  return candidates.sort((a, b) => candidateSortKey(a).localeCompare(candidateSortKey(b)));
}

function selectUniqueCandidates(candidates: CandidateMatch[]): {
  confirmed: ConfirmedMatch[];
  ambiguous: CandidateMatch[];
} {
  const byBaseline = new Map<string, CandidateMatch[]>();
  const byCurrent = new Map<string, CandidateMatch[]>();

  for (const candidate of candidates) {
    addMapValue(byBaseline, deviceKey(candidate.baseline), candidate);
    addMapValue(byCurrent, deviceKey(candidate.current), candidate);
  }

  const confirmed: ConfirmedMatch[] = [];
  const ambiguous: CandidateMatch[] = [];

  for (const candidate of candidates) {
    const baselineCandidates = byBaseline.get(deviceKey(candidate.baseline)) ?? [];
    const currentCandidates = byCurrent.get(deviceKey(candidate.current)) ?? [];
    if (baselineCandidates.length === 1 && currentCandidates.length === 1) {
      confirmed.push(candidate);
    } else {
      ambiguous.push(candidate);
    }
  }

  return {
    confirmed: uniqueCandidates(confirmed),
    ambiguous: uniqueCandidates(ambiguous),
  };
}

function buildPortChangeEvents(
  match: ConfirmedMatch,
  baselineRef: ObservationComparisonObservationRef,
  currentRef: ObservationComparisonObservationRef,
  coverageContext: ObservationComparisonCoverageContext
): ObservationChangeEvent[] {
  const events: ObservationChangeEvent[] = [];
  const baselinePorts = portMap(match.baseline.device.openPorts);
  const currentPorts = portMap(match.current.device.openPorts);
  const identityEvidence = identityEvidenceForCandidate(match);

  for (const [key, currentPort] of sortedMapEntries(currentPorts)) {
    if (baselinePorts.has(key)) continue;
    events.push(
      buildEvent({
        eventType: "service-or-port-opened",
        summary: `Port ${currentPort.port}/${currentPort.protocol} was observed open on a matched device in the current observation.`,
        baselineRef,
        currentRef,
        baselineDevice: match.baseline,
        currentDevice: match.current,
        identityEvidence,
        confidence: match.confidence,
        coverageContext,
        ruleId: "port.opened",
        details: {
          baselinePort: null,
          currentPort: portRef(currentPort),
          notes: ["The event reports observed port state only; service intent is not inferred."],
        },
      })
    );
  }

  for (const [key, baselinePort] of sortedMapEntries(baselinePorts)) {
    if (currentPorts.has(key)) continue;
    events.push(
      buildEvent({
        eventType: "service-or-port-closed",
        summary: `Port ${baselinePort.port}/${baselinePort.protocol} was not observed open on the matched device in the current observation.`,
        baselineRef,
        currentRef,
        baselineDevice: match.baseline,
        currentDevice: match.current,
        identityEvidence,
        confidence: match.confidence,
        coverageContext,
        ruleId: "port.closed",
        details: {
          baselinePort: portRef(baselinePort),
          currentPort: null,
          notes: ["The current observation did not report this port as open."],
        },
      })
    );
  }

  return events;
}

function buildMetadataChangeEvents(
  match: ConfirmedMatch,
  baselineRef: ObservationComparisonObservationRef,
  currentRef: ObservationComparisonObservationRef,
  coverageContext: ObservationComparisonCoverageContext
): ObservationChangeEvent[] {
  const changedFields = [
    ["ips", match.baseline.device.ips, match.current.device.ips],
    ["macs", match.baseline.device.macs, match.current.device.macs],
    ["hostnames", match.baseline.device.hostnames, match.current.device.hostnames],
    ["vendors", match.baseline.device.vendors, match.current.device.vendors],
  ]
    .filter(([, baselineValues, currentValues]) =>
      !sameStringSet(baselineValues as string[], currentValues as string[])
    )
    .map(([field]) => field as string);

  if (changedFields.length === 0) return [];

  return [
    buildEvent({
      eventType: "important-device-metadata-changed",
      summary: `Matched device metadata changed: ${changedFields.join(", ")}.`,
      baselineRef,
      currentRef,
      baselineDevice: match.baseline,
      currentDevice: match.current,
      identityEvidence: identityEvidenceForCandidate(match),
      confidence: match.confidence,
      coverageContext,
      ruleId: "metadata.changed",
      details: {
        changedFields,
        notes: ["Metadata changes are evidence fields from observations, not asset ownership changes."],
      },
    }),
  ];
}

function buildEvent(input: {
  eventType: ObservationChangeEventType;
  summary: string;
  baselineRef: ObservationComparisonObservationRef;
  currentRef: ObservationComparisonObservationRef;
  baselineDevice: DeviceInfo | null;
  currentDevice: DeviceInfo | null;
  identityEvidence: ObservationComparisonIdentityEvidence;
  confidence: ObservationIdentityConfidence;
  coverageContext: ObservationComparisonCoverageContext;
  ruleId: string;
  details: ObservationChangeEventDetails;
}): ObservationChangeEvent {
  return {
    eventId: "pending",
    eventType: input.eventType,
    summary: input.summary,
    observations: {
      baseline: input.baselineRef,
      current: input.currentRef,
    },
    baselineDevice: input.baselineDevice?.ref ?? null,
    currentDevice: input.currentDevice?.ref ?? null,
    identityEvidence: input.identityEvidence,
    confidence: input.confidence,
    coverageContext: input.coverageContext,
    rule: ruleMetadata(input.ruleId),
    details: {
      notes: input.details.notes,
      changedFields: input.details.changedFields,
      baselinePort: input.details.baselinePort,
      currentPort: input.details.currentPort,
    },
  };
}

function assignDeterministicEventId(event: ObservationChangeEvent): ObservationChangeEvent {
  const seed = {
    eventType: event.eventType,
    baselineObservationId: event.observations.baseline.observationId,
    currentObservationId: event.observations.current.observationId,
    baselineDeviceId: event.baselineDevice?.deviceId ?? null,
    currentDeviceId: event.currentDevice?.deviceId ?? null,
    ruleId: event.rule.ruleId,
    details: event.details,
    identityRuleId: event.identityEvidence.ruleId,
    identityValues: event.identityEvidence.values,
  };

  return {
    ...event,
    eventId: `chg-${hashString(stableStringify(seed)).slice(0, 16)}`,
  };
}

function identityEvidenceForCandidate(
  candidate: CandidateMatch
): ObservationComparisonIdentityEvidence {
  return {
    ruleId: candidate.identityRuleId,
    confidence: candidate.confidence,
    summary: candidate.summary,
    values: candidate.values,
    evidenceKinds: candidate.evidenceKinds,
    baselineEvidenceIds: evidenceIdsFor(candidate.baseline.device, candidate.evidenceKinds, candidate.values),
    currentEvidenceIds: evidenceIdsFor(candidate.current.device, candidate.evidenceKinds, candidate.values),
  };
}

function unmatchedIdentityEvidence(
  info: DeviceInfo,
  ruleId: string
): ObservationComparisonIdentityEvidence {
  const confidence = bestDeviceConfidence(info);
  const identity = bestIdentityValues(info);

  return {
    ruleId,
    confidence,
    summary: "No confirmed cross-observation device identity match was found.",
    values: identity.values,
    evidenceKinds: identity.evidenceKinds,
    baselineEvidenceIds: ruleId === "identity.no-current-match" ? identity.evidenceIds : [],
    currentEvidenceIds: ruleId === "identity.no-baseline-match" ? identity.evidenceIds : [],
  };
}

function bestIdentityValues(info: DeviceInfo): {
  values: string[];
  evidenceKinds: ObservationEvidenceKind[];
  evidenceIds: string[];
} {
  if (info.explicitIdentityKeys.length > 0) {
    return {
      values: info.explicitIdentityKeys,
      evidenceKinds: [],
      evidenceIds: [],
    };
  }
  if (info.macKeys.length > 0) {
    return {
      values: info.macKeys,
      evidenceKinds: ["mac-address"],
      evidenceIds: evidenceIdsFor(info.device, ["mac-address"], info.macKeys),
    };
  }
  if (info.hashedMacKeys.length > 0) {
    return {
      values: info.hashedMacKeys,
      evidenceKinds: ["mac-address"],
      evidenceIds: evidenceIdsFor(info.device, ["mac-address"], info.hashedMacKeys),
    };
  }
  if (info.hostnameVendorKeys.length > 0) {
    return {
      values: info.hostnameVendorKeys,
      evidenceKinds: ["hostname", "vendor"],
      evidenceIds: evidenceIdsFor(info.device, ["hostname", "vendor"], info.hostnameVendorKeys),
    };
  }
  return {
    values: info.ipKeys,
    evidenceKinds: ["ip-address"],
    evidenceIds: evidenceIdsFor(info.device, ["ip-address"], info.ipKeys),
  };
}

function evidenceIdsFor(
  device: ObservationDevice,
  kinds: ObservationEvidenceKind[],
  values: string[]
): string[] {
  if (kinds.length === 0 || values.length === 0) return [];

  const normalizedValues = new Set(values.map(normalizeIdentityValue));
  const matchingIds = device.identityEvidence
    .filter((evidence) => kinds.includes(evidence.kind))
    .filter((evidence) => evidenceMatchesValues(evidence, normalizedValues))
    .map((evidence) => evidence.evidenceId)
    .sort();

  return [...new Set(matchingIds)];
}

function evidenceMatchesValues(
  evidence: DeviceIdentityEvidence,
  normalizedValues: Set<string>
): boolean {
  const normalizedValue = normalizeIdentityValue(evidence.value);
  if (normalizedValues.has(normalizedValue)) return true;

  const hashedMacValue = normalizeHashedMacKey(evidence.value);
  if (hashedMacValue && normalizedValues.has(hashedMacValue)) return true;

  for (const value of normalizedValues) {
    if (value.includes("|") && value.split("|").includes(normalizedValue)) {
      return true;
    }
  }

  return false;
}

function bestDeviceConfidence(info: DeviceInfo): ObservationIdentityConfidence {
  if (info.explicitIdentityKeys.length > 0) return "strongest";
  if (info.macKeys.length > 0 || info.hashedMacKeys.length > 0) return "strong";
  if (info.hostnameVendorKeys.length > 0) return "medium";
  return "low";
}

function confidenceForNewDevice(
  info: DeviceInfo,
  coverageContext: ObservationComparisonCoverageContext
): ObservationIdentityConfidence {
  if (coverageContext.baseline.partial || coverageContext.baseline.status !== "complete") {
    return "low";
  }
  return bestDeviceConfidence(info);
}

function buildDeviceInfo(bundle: ObservationBundleV1, device: ObservationDevice): DeviceInfo {
  const macEvidenceValues = device.identityEvidence
    .filter((evidence) => evidence.kind === "mac-address")
    .map((evidence) => evidence.value);
  const macKeys = uniqueSorted([
    ...device.macs.map(normalizeMacKey).filter((mac): mac is string => Boolean(mac)),
    ...macEvidenceValues.map(normalizeMacKey).filter((mac): mac is string => Boolean(mac)),
  ]);
  const hashedMacKeys = uniqueSorted(
    macEvidenceValues
      .map(normalizeHashedMacKey)
      .filter((mac): mac is string => Boolean(mac))
  );
  const hostnames = uniqueSorted(device.hostnames.map(normalizeIdentityValue).filter(Boolean));
  const vendors = uniqueSorted(device.vendors.map(normalizeIdentityValue).filter(Boolean));
  const hostnameVendorKeys = uniqueSorted(
    hostnames.flatMap((hostname) => vendors.map((vendor) => `${hostname}|${vendor}`))
  );
  const explicitIdentityKeys = explicitDeviceIdentityKey(device);
  const ref: ObservationComparisonDeviceRef = {
    observationId: bundle.observationId,
    deviceId: device.deviceId,
    ips: [...device.ips].sort(),
    macs: [...device.macs].sort(),
    hostnames: [...device.hostnames].sort(),
    vendors: [...device.vendors].sort(),
  };

  return {
    bundle,
    device,
    ref,
    sortKey: [
      device.deviceId,
      device.ips[0] ?? "",
      device.macs[0] ?? "",
      device.hostnames[0] ?? "",
    ].join("|"),
    explicitIdentityKeys,
    macKeys,
    hashedMacKeys,
    hostnameVendorKeys,
    ipKeys: uniqueSorted(device.ips.map(normalizeIdentityValue).filter(Boolean)),
  };
}

function explicitDeviceIdentityKey(device: ObservationDevice): string[] {
  const id = normalizeIdentityValue(device.deviceId);
  if (!id || /^dev-(?:[a-f0-9]{12}|unknown)$/i.test(id) || looksLikeIpDerivedDeviceId(id)) {
    return [];
  }
  return [id];
}

function looksLikeIpDerivedDeviceId(value: string): boolean {
  return containsIpv4DerivedToken(value) || containsIpv6LikeToken(value);
}

function containsIpv4DerivedToken(value: string): boolean {
  const matches = value.matchAll(
    /(?:^|[^0-9])(\d{1,3})[._-](\d{1,3})[._-](\d{1,3})[._-](\d{1,3})(?=$|[^0-9])/g
  );

  for (const match of matches) {
    const octets = match.slice(1, 5).map((part) => Number.parseInt(part, 10));
    if (octets.every((octet) => octet >= 0 && octet <= 255)) {
      return true;
    }
  }

  return false;
}

function containsIpv6LikeToken(value: string): boolean {
  return value.split(/[^0-9a-f:]+/i).some(isIpv6LikeToken);
}

function isIpv6LikeToken(value: string): boolean {
  if (!value.includes(":") || !/^[0-9a-f:]+$/i.test(value)) return false;
  const parts = value.split(":");
  if (value.includes("::")) {
    return parts.some(Boolean);
  }
  return parts.length >= 3 && parts.every((part) => part.length > 0 && part.length <= 4);
}

function observationRef(bundle: ObservationBundleV1): ObservationComparisonObservationRef {
  return {
    observationId: bundle.observationId,
    batchId: bundle.batch.batchId,
    sourceRunUid: bundle.batch.sourceRunUid,
    siteId: bundle.site.siteId,
    networkName: bundle.site.networkName,
    observedAt: latestObservationTime(bundle),
  };
}

function buildCoverageContext(
  baseline: ObservationBundleV1,
  current: ObservationBundleV1,
  evaluatedAt: string,
  staleAfterDays: number
): ObservationComparisonCoverageContext {
  const baselineSnapshot = coverageSnapshot(baseline, evaluatedAt, staleAfterDays);
  const currentSnapshot = coverageSnapshot(current, evaluatedAt, staleAfterDays);
  const notes: string[] = [];

  if (baselineSnapshot.partial || currentSnapshot.partial) {
    notes.push(
      "At least one observation has partial coverage; absence and newness are bounded by available sources."
    );
  }
  if (baselineSnapshot.freshness.status === "stale" || currentSnapshot.freshness.status === "stale") {
    notes.push("At least one observation is stale relative to the evaluation time.");
  }

  return {
    baseline: baselineSnapshot,
    current: currentSnapshot,
    notes,
  };
}

function coverageSnapshot(
  bundle: ObservationBundleV1,
  evaluatedAt: string,
  staleAfterDays: number
): ObservationComparisonCoverageSnapshot {
  return {
    status: bundle.coverage.status,
    score: bundle.coverage.score,
    partial: bundle.batch.partial || bundle.coverage.status !== "complete" || bundle.coverage.missingSources.length > 0,
    expectedSources: [...bundle.coverage.expectedSources],
    presentSources: [...bundle.coverage.presentSources],
    missingSources: [...bundle.coverage.missingSources],
    freshness: freshnessContext(bundle, evaluatedAt, staleAfterDays),
    notes: [...bundle.coverage.notes],
  };
}

function freshnessContext(
  bundle: ObservationBundleV1,
  evaluatedAt: string,
  staleAfterDays: number
): ObservationComparisonFreshnessContext {
  const observedAt = latestObservationTime(bundle);
  if (!observedAt) {
    return {
      status: "unknown",
      evaluatedAt,
      observedAt,
      staleAfterDays,
      ageDays: null,
    };
  }

  const ageDays = wholeDaysBetween(observedAt, evaluatedAt);
  return {
    status: ageDays > staleAfterDays ? "stale" : "fresh",
    evaluatedAt,
    observedAt,
    staleAfterDays,
    ageDays,
  };
}

function buildGuardrails(
  coverageContext: ObservationComparisonCoverageContext
): ObservationComparisonGuardrail[] {
  const guardrails: ObservationComparisonGuardrail[] = [];

  if (coverageContext.baseline.partial || coverageContext.current.partial) {
    guardrails.push({
      code: "partial-coverage",
      severity: "warning",
      message:
        "One or more observations are partial; the comparison avoids treating missing current devices as removals when current coverage is incomplete.",
    });
  }

  if (
    coverageContext.baseline.freshness.status === "stale" ||
    coverageContext.current.freshness.status === "stale"
  ) {
    guardrails.push({
      code: "stale-data",
      severity: "warning",
      message:
        "One or more observations are stale relative to the evaluation time; changes should be read with that age context.",
    });
  }

  return guardrails;
}

function currentCoverageSupportsAbsence(current: ObservationBundleV1): boolean {
  return (
    current.coverage.status === "complete" &&
    current.batch.partial !== true &&
    current.coverage.missingSources.length === 0
  );
}

function uncertainSummary(match: CandidateMatch): string {
  if (match.identityRuleId === "identity.ip-continuity") {
    return "Two observations share IP continuity only, so the engine left identity uncertain.";
  }

  return "Overlapping identity evidence matched more than one candidate, so the engine left identity uncertain.";
}

function ruleMetadata(ruleId: string): ObservationComparisonRuleMetadata {
  return {
    engine: "observation-comparison",
    version: OBSERVATION_COMPARISON_RULE_VERSION,
    ruleId,
    deterministic: true,
  };
}

function portMap(ports: ObservationOpenPort[]): Map<string, ObservationOpenPort> {
  const map = new Map<string, ObservationOpenPort>();
  for (const port of ports) {
    map.set(portKey(port), port);
  }
  return map;
}

function portKey(port: { protocol: string; port: number }): string {
  return `${port.protocol.toLowerCase()}:${port.port}`;
}

function portRef(port: ObservationOpenPort) {
  return {
    protocol: port.protocol,
    port: port.port,
    service: port.service,
    product: port.product,
    version: port.version,
    sourceId: port.sourceId,
  };
}

function latestObservationTime(bundle: ObservationBundleV1): string | null {
  return firstValidIso(bundle.batch.endedAt) ?? firstValidIso(bundle.batch.startedAt) ?? firstValidIso(bundle.batch.generatedAt);
}

function firstValidIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function optionIsoOrNull(value: string | Date | undefined): string | null {
  if (value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function wholeDaysBetween(startIso: string, endIso: string): number {
  const diff = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(diff)) return 0;
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}

function normalizeMacKey(value: string): string | null {
  const cleaned = value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (cleaned.length !== 12) return null;
  return cleaned.match(/.{2}/g)?.join(":").toLowerCase() ?? null;
}

function normalizeHashedMacKey(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const match = /^(?:sha256:|hash:)?([a-f0-9]{32,128})$/.exec(normalized);
  return match ? `hash:${match[1]}` : null;
}

function normalizeIdentityValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sortedIntersection(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return uniqueSorted(left.filter((value) => rightSet.has(value)));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function sameStringSet(left: string[], right: string[]): boolean {
  const leftSorted = uniqueSorted(left);
  const rightSorted = uniqueSorted(right);
  return leftSorted.length === rightSorted.length && leftSorted.every((value, index) => value === rightSorted[index]);
}

function addMapValue<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function combinedSet<T>(left: Set<T>, right: Set<T>): Set<T> {
  return new Set([...left, ...right]);
}

function uniqueCandidates<T extends CandidateMatch>(candidates: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const candidate of candidates) {
    const key = candidateSortKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }

  return unique.sort((a, b) => candidateSortKey(a).localeCompare(candidateSortKey(b)));
}

function sortedMapEntries<T>(map: Map<string, T>): Array<[string, T]> {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function candidateSortKey(candidate: CandidateMatch): string {
  return [
    candidate.identityRuleId,
    deviceKey(candidate.baseline),
    deviceKey(candidate.current),
    candidate.values.join(","),
  ].join("|");
}

function deviceKey(info: DeviceInfo): string {
  return `${info.bundle.observationId}|${info.device.deviceId}|${info.sortKey}`;
}

function eventSortKey(event: ObservationChangeEvent): string {
  const typeOrder: Record<ObservationChangeEventType, number> = {
    "identity-uncertain-possibly-same-device": 10,
    "new-device-observed": 20,
    "previously-observed-device-not-observed": 30,
    "service-or-port-opened": 40,
    "service-or-port-closed": 50,
    "important-device-metadata-changed": 60,
  };

  return [
    String(typeOrder[event.eventType]).padStart(2, "0"),
    event.baselineDevice?.deviceId ?? "",
    event.currentDevice?.deviceId ?? "",
    event.details.baselinePort ? portKey(event.details.baselinePort) : "",
    event.details.currentPort ? portKey(event.details.currentPort) : "",
    event.eventId,
  ].join("|");
}

function sortGuardrails(
  guardrails: ObservationComparisonGuardrail[]
): ObservationComparisonGuardrail[] {
  const seen = new Set<string>();
  return guardrails
    .filter((guardrail) => {
      if (seen.has(guardrail.code)) return false;
      seen.add(guardrail.code);
      return true;
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}
