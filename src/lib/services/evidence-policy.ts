import type {
  EvidenceAssessment,
  EvidenceCoverageSnapshot,
  EvidenceReasonCode,
} from "@/lib/types";
import type {
  ObservationBundleV1,
  ObservationPortRange,
} from "@/lib/types/observation-bundle";

const EVIDENCE_VERSION = "psec.evidence.v1" as const;
const VANTAGE_LIMITATION =
  "The scan vantage records observations only; reachability beyond that vantage was not established.";

/** Build the stable, machine-readable coverage view used by public outputs. */
export function buildEvidenceCoverageSnapshot(
  bundle: ObservationBundleV1
): EvidenceCoverageSnapshot {
  const scopeKnown = Boolean(bundle.site.networkScope?.trim());
  const devicePortCoverageComplete = hasPerDevicePortCoverage(bundle);
  const partial =
    bundle.batch.partial === true ||
    bundle.coverage.status !== "complete" ||
    bundle.coverage.missingSources.length > 0 ||
    !scopeKnown ||
    !devicePortCoverageComplete;

  return {
    status:
      partial && bundle.coverage.status === "complete"
        ? "partial"
        : bundle.coverage.status,
    score: bundle.coverage.score,
    partial,
    deviceCount: bundle.devices.length,
    scopeKnown,
    expectedSources: [...bundle.coverage.expectedSources],
    presentSources: [...bundle.coverage.presentSources],
    missingSources: [...bundle.coverage.missingSources],
  };
}

/** Every observed device must be represented by a usable ports artifact. */
function hasPerDevicePortCoverage(bundle: ObservationBundleV1): boolean {
  if (bundle.devices.length === 0) return true;
  if (!bundle.coverage.presentSources.includes("ports")) return false;
  return portCoverageSignature(bundle) !== null;
}

/** True only when the named device's declared scan range covers this port. */
export function observationDeviceCoversPort(
  bundle: ObservationBundleV1,
  deviceId: string | undefined,
  protocol: string,
  port: number
): boolean {
  if (!deviceId) return false;
  const device = bundle.devices.find((candidate) => candidate.deviceId === deviceId);
  if (!device?.portCoverage) return false;
  const normalizedProtocol = protocol.trim().toLowerCase();
  return device.portCoverage.some(
    (coverage) =>
      coverage.protocol.trim().toLowerCase() === normalizedProtocol &&
      coverage.ranges.some((range) => port >= range.start && port <= range.end)
  );
}

function haveCompatiblePortCoverage(
  baseline: ObservationBundleV1,
  current: ObservationBundleV1
): boolean {
  const baselineSignature = portCoverageSignature(baseline);
  const currentSignature = portCoverageSignature(current);
  return Boolean(
    baselineSignature &&
      currentSignature &&
      baselineSignature === currentSignature
  );
}

function portCoverageSignature(bundle: ObservationBundleV1): string | null {
  if (bundle.devices.length === 0) return null;
  const signatures = bundle.devices.map((device) => {
    if (!device.portCoverage || device.portCoverage.length === 0) return null;
    const byProtocol = new Map<string, ObservationPortRange[]>();
    for (const coverage of device.portCoverage) {
      const protocol = coverage.protocol.trim().toLowerCase();
      if (!protocol) continue;
      byProtocol.set(protocol, [
        ...(byProtocol.get(protocol) ?? []),
        ...coverage.ranges,
      ]);
    }
    if (byProtocol.size === 0) return null;
    return [...byProtocol.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([protocol, ranges]) =>
        `${protocol}:${normalizeRanges(ranges)
          .map((range) => `${range.start}-${range.end}`)
          .join(",")}`
      )
      .join("|");
  });
  if (signatures.some((signature) => signature === null)) return null;
  const unique = new Set(signatures as string[]);
  return unique.size === 1 ? [...unique][0] : null;
}

function normalizeRanges(ranges: ObservationPortRange[]): ObservationPortRange[] {
  const sorted = ranges
    .filter(
      (range) =>
        Number.isInteger(range.start) &&
        Number.isInteger(range.end) &&
        range.start >= 0 &&
        range.end <= 65535 &&
        range.start <= range.end
    )
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const normalized: ObservationPortRange[] = [];
  for (const range of sorted) {
    const previous = normalized[normalized.length - 1];
    if (previous && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      normalized.push({ ...range });
    }
  }
  return normalized;
}

/** Evidence policy for a single-run Scorecard. */
export function buildScorecardEvidenceAssessment(
  current: ObservationBundleV1
): EvidenceAssessment {
  const currentCoverage = buildEvidenceCoverageSnapshot(current);
  const empty = currentCoverage.deviceCount === 0;
  const insufficient = currentCoverage.partial || empty;
  const reasonCodes: EvidenceReasonCode[] = [];
  const limitations: string[] = [];

  if (currentCoverage.partial) {
    reasonCodes.push("partial-coverage");
    limitations.push(
      "Observation coverage is partial; missing evidence cannot support absence, closure, or no-change conclusions."
    );
  }
  if (empty) {
    reasonCodes.push("empty-observation");
    limitations.push(
      "The observation contains no devices; it cannot establish device absence or overall network security."
    );
  }
  reasonCodes.push("external-reachability-not-established");
  limitations.push(VANTAGE_LIMITATION);

  return {
    version: EVIDENCE_VERSION,
    status: insufficient ? "insufficient-evidence" : "supported",
    reasonCodes,
    coverage: { current: currentCoverage },
    identity: {
      status: "not-applicable",
      uncertainCount: 0,
    },
    vantage: {
      kind: "unverified-scan-vantage",
      externalReachability: "not-established",
    },
    supports: {
      deviceAbsence: false,
      portClosure: false,
      stableBaseline: false,
      externalReachability: false,
      comparisonPersistence: false,
      llmSummary: !insufficient,
    },
    limitations,
  };
}

/** Evidence policy for a two-run Diff. */
export function buildDiffEvidenceAssessment(
  baseline: ObservationBundleV1,
  current: ObservationBundleV1,
  identityUncertainCount: number
): EvidenceAssessment {
  let baselineCoverage = buildEvidenceCoverageSnapshot(baseline);
  let currentCoverage = buildEvidenceCoverageSnapshot(current);
  const empty = baselineCoverage.deviceCount === 0 || currentCoverage.deviceCount === 0;
  const portCoverageCompatible = empty || haveCompatiblePortCoverage(baseline, current);
  if (!portCoverageCompatible) {
    baselineCoverage = { ...baselineCoverage, status: "partial", partial: true };
    currentCoverage = { ...currentCoverage, status: "partial", partial: true };
  }
  const coverageInsufficient = baselineCoverage.partial || currentCoverage.partial || empty;
  const identityUncertain = identityUncertainCount > 0;
  const status = coverageInsufficient
    ? "insufficient-evidence"
    : identityUncertain
      ? "uncertain"
      : "supported";
  const reasonCodes: EvidenceReasonCode[] = [];
  const limitations: string[] = [];

  if (baselineCoverage.partial || currentCoverage.partial) {
    reasonCodes.push("partial-coverage");
    limitations.push(
      "At least one observation has partial coverage; missing evidence cannot support device absence, port closure, or no-change conclusions."
    );
  }
  if (empty) {
    reasonCodes.push("empty-observation");
    limitations.push(
      "At least one observation contains no devices; the comparison cannot establish absence, closure, or no change."
    );
  }
  if (identityUncertain) {
    reasonCodes.push("identity-uncertain");
    limitations.push(
      `${identityUncertainCount} device identity relationship${identityUncertainCount === 1 ? " remains" : "s remain"} uncertain.`
    );
  }
  reasonCodes.push("external-reachability-not-established");
  limitations.push(VANTAGE_LIMITATION);

  const supportsNegativeConclusions = status === "supported";

  return {
    version: EVIDENCE_VERSION,
    status,
    reasonCodes,
    coverage: {
      baseline: baselineCoverage,
      current: currentCoverage,
    },
    identity: {
      status: identityUncertain ? "uncertain" : "supported",
      uncertainCount: identityUncertainCount,
    },
    vantage: {
      kind: "unverified-scan-vantage",
      externalReachability: "not-established",
    },
    supports: {
      deviceAbsence: supportsNegativeConclusions,
      portClosure: supportsNegativeConclusions,
      stableBaseline: false,
      externalReachability: false,
      comparisonPersistence: status === "supported",
      llmSummary: status === "supported",
    },
    limitations,
  };
}
