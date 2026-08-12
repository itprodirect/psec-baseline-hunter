import type { EvidenceAssessment, EvidenceReasonCode } from "@/lib/types";
import type { ObservationBundleV1 } from "@/lib/types/observation-bundle";
import type {
  ObservationChangeEvent,
  ObservationComparisonResult,
} from "@/lib/types/observation-comparison";
import {
  compareObservationBundlesV1,
  isObservationComparisonError,
} from "./observation-comparison";
import {
  buildDiffEvidenceAssessment,
  observationDeviceCoversPort,
} from "./evidence-policy";

export type EvidenceAwareComparisonOutcome = "supported" | "insufficient" | "rejected";

export type EvidenceAwareComparisonFailureCode =
  | "unknown-site"
  | "different-sites"
  | "different-networks"
  | "conflicting-network-scope"
  | "unknown-collection-interval"
  | "invalid-chronology"
  | "overlapping-collection-intervals"
  | "incompatible-run-type"
  | "incompatible-vantage"
  | "unknown-vantage"
  | "incompatible-collector"
  | "unknown-collector"
  | "incompatible-target-provenance"
  | "unknown-target-provenance"
  | "ambiguous-comparison";

export interface EvidenceAwareComparisonFailure {
  code: EvidenceAwareComparisonFailureCode;
  message: string;
}

export interface EvidenceAwareComparisonEvaluation {
  outcome: EvidenceAwareComparisonOutcome;
  evidence: EvidenceAssessment;
  comparison: ObservationComparisonResult | null;
  failure: EvidenceAwareComparisonFailure | null;
}

export interface EvidenceAwareComparisonOptions {
  evaluatedAt?: string | Date;
  staleAfterDays?: number;
}

/**
 * The single production boundary for temporal observation comparisons.
 * Consumers receive only policy-filtered events and a shared evidence state.
 */
export function evaluateEvidenceAwareComparison(
  baseline: ObservationBundleV1,
  current: ObservationBundleV1,
  options: EvidenceAwareComparisonOptions = {}
): EvidenceAwareComparisonEvaluation {
  const compatibilityFailure = comparisonCompatibilityFailure(baseline, current);
  if (compatibilityFailure && !isInsufficientCompatibility(compatibilityFailure.code)) {
    const evidence = rejectedEvidence(baseline, current, reasonForFailure(compatibilityFailure.code));
    return {
      outcome: "rejected",
      evidence,
      comparison: null,
      failure: compatibilityFailure,
    };
  }

  let rawComparison: ObservationComparisonResult;
  try {
    rawComparison = compareObservationBundlesV1(baseline, current, options);
  } catch (error) {
    if (!isObservationComparisonError(error)) throw error;
    const code = mapObservationComparisonError(error.code);
    return {
      outcome: "rejected",
      evidence: rejectedEvidence(baseline, current, reasonForFailure(code)),
      comparison: null,
      failure: { code, message: safeFailureMessage(code) },
    };
  }

  const uncertainEvents = rawComparison.events.filter(isIdentityUncertainEvent);
  const evidence = buildDiffEvidenceAssessment(
    baseline,
    current,
    uncertainEvents.length
  );
  const boundedEvidence = compatibilityFailure
    ? insufficientCompatibilityEvidence(
        evidence,
        reasonForFailure(compatibilityFailure.code),
        compatibilityFailure.message
      )
    : evidence;
  const comparison: ObservationComparisonResult = {
    ...rawComparison,
    events: filterEventsForEvidence(
      rawComparison.events,
      baseline,
      current,
      boundedEvidence
    ),
  };

  return {
    outcome: boundedEvidence.status === "supported" ? "supported" : "insufficient",
    evidence: boundedEvidence,
    comparison,
    failure: null,
  };
}

function filterEventsForEvidence(
  events: ObservationChangeEvent[],
  baseline: ObservationBundleV1,
  current: ObservationBundleV1,
  evidence: EvidenceAssessment
): ObservationChangeEvent[] {
  const supportsNewness =
    evidence.status === "supported" &&
    evidence.coverage.baseline !== undefined &&
    !evidence.coverage.baseline.partial &&
    !evidence.coverage.current.partial;

  return events.filter((event) => {
    switch (event.eventType) {
      case "previously-observed-device-not-observed":
        return evidence.supports.deviceAbsence;
      case "new-device-observed":
        return supportsNewness;
      case "service-or-port-closed": {
        const port = event.details.baselinePort;
        return Boolean(
          evidence.supports.portClosure &&
            port &&
            observationDeviceCoversPort(
              baseline,
              event.baselineDevice?.deviceId,
              port.protocol,
              port.port
            ) &&
            observationDeviceCoversPort(
              current,
              event.currentDevice?.deviceId,
              port.protocol,
              port.port
            )
        );
      }
      case "service-or-port-opened": {
        const port = event.details.currentPort;
        return Boolean(
          supportsNewness &&
            port &&
            observationDeviceCoversPort(
              baseline,
              event.baselineDevice?.deviceId,
              port.protocol,
              port.port
            ) &&
            observationDeviceCoversPort(
              current,
              event.currentDevice?.deviceId,
              port.protocol,
              port.port
            )
        );
      }
      default:
        return true;
    }
  });
}

function comparisonCompatibilityFailure(
  baseline: ObservationBundleV1,
  current: ObservationBundleV1
): EvidenceAwareComparisonFailure | null {
  const baselineSite = normalizeIdentifier(baseline.site.siteId);
  const currentSite = normalizeIdentifier(current.site.siteId);
  const baselineNetwork = normalizeIdentifier(baseline.site.networkName);
  const currentNetwork = normalizeIdentifier(current.site.networkName);
  if (isUnknownIdentifier(baselineSite) || isUnknownIdentifier(currentSite)) {
    return failure("unknown-site");
  }
  if (baselineSite !== currentSite) return failure("different-sites");
  if (
    isUnknownIdentifier(baselineNetwork) ||
    isUnknownIdentifier(currentNetwork)
  ) {
    return failure("unknown-site");
  }
  if (baselineNetwork !== currentNetwork) return failure("different-networks");

  let unknownFailure: EvidenceAwareComparisonFailure | null = null;
  const baselineScope = canonicalTarget(baseline.site.networkScope);
  const currentScope = canonicalTarget(current.site.networkScope);
  if (!baselineScope || !currentScope) {
    unknownFailure = failure("unknown-target-provenance");
  } else if (baselineScope !== currentScope) {
    return failure("conflicting-network-scope");
  }

  const baselineTarget = canonicalTarget(baseline.vantage.target);
  const currentTarget = canonicalTarget(current.vantage.target);
  if (!baselineTarget || !currentTarget) {
    unknownFailure ??= failure("unknown-target-provenance");
  } else if (
    baselineScope &&
    currentScope &&
    (baselineTarget !== baselineScope || currentTarget !== currentScope)
  ) {
    return failure("incompatible-target-provenance");
  }

  const baselineRunType = canonicalRunType(baseline.vantage.runType);
  const currentRunType = canonicalRunType(current.vantage.runType);
  if (!baselineRunType || !currentRunType) {
    unknownFailure ??= failure("unknown-vantage");
  } else if (baselineRunType !== currentRunType) {
    return failure("incompatible-run-type");
  }

  const baselineVantage = canonicalVantageType(baseline.vantage.type);
  const currentVantage = canonicalVantageType(current.vantage.type);
  if (!baselineVantage || !currentVantage) {
    unknownFailure ??= failure("unknown-vantage");
  } else if (baselineVantage !== currentVantage) {
    return failure("incompatible-vantage");
  }

  const baselineCollector = canonicalCollectorPosition(baseline);
  const currentCollector = canonicalCollectorPosition(current);
  if (!baselineCollector || !currentCollector) {
    unknownFailure ??= failure("unknown-collector");
  } else if (baselineCollector !== currentCollector) {
    return failure("incompatible-collector");
  }

  const baselineStart = strictTime(baseline.batch.startedAt);
  const baselineEnd = strictTime(baseline.batch.endedAt);
  const currentStart = strictTime(current.batch.startedAt);
  const currentEnd = strictTime(current.batch.endedAt);
  if (
    baselineStart === null ||
    baselineEnd === null ||
    currentStart === null ||
    currentEnd === null
  ) {
    return unknownFailure ?? failure("unknown-collection-interval");
  }
  if (baselineStart > baselineEnd || currentStart > currentEnd) {
    return failure("invalid-chronology");
  }
  if (
    baseline.observationId === current.observationId ||
    Math.floor(baselineStart / 60_000) === Math.floor(currentStart / 60_000)
  ) {
    return failure("ambiguous-comparison");
  }
  if (baselineEnd >= currentStart) {
    return failure(
      baselineStart < currentEnd ? "overlapping-collection-intervals" : "invalid-chronology"
    );
  }
  return unknownFailure;
}

function isInsufficientCompatibility(code: EvidenceAwareComparisonFailureCode): boolean {
  return (
    code === "unknown-target-provenance" ||
    code === "unknown-vantage" ||
    code === "unknown-collector" ||
    code === "unknown-collection-interval"
  );
}

function insufficientCompatibilityEvidence(
  evidence: EvidenceAssessment,
  reasonCode: EvidenceReasonCode,
  limitation: string
): EvidenceAssessment {
  return {
    ...evidence,
    status: "insufficient-evidence",
    reasonCodes: uniqueReasons([...evidence.reasonCodes, reasonCode]),
    supports: {
      ...evidence.supports,
      deviceAbsence: false,
      portClosure: false,
      stableBaseline: false,
      comparisonPersistence: false,
      llmSummary: false,
    },
    limitations: [...evidence.limitations, limitation],
  };
}

function canonicalCollectorPosition(bundle: ObservationBundleV1): string | null {
  const collectorId = normalizeIdentifier(bundle.collector.collectorId);
  const collectorKind = normalizeIdentifier(bundle.collector.kind);
  const host = canonicalHostname(bundle.vantage.collectorHost);
  if (
    isUnknownIdentifier(collectorId) ||
    isUnknownIdentifier(collectorKind) ||
    !host
  ) {
    return null;
  }
  return `${collectorKind}|${collectorId}|${host}`;
}

function canonicalVantageType(value: string): string | null {
  const normalized = normalizeIdentifier(value).replace(/[\s_]+/g, "-");
  return isUnknownIdentifier(normalized) ? null : normalized;
}

function canonicalRunType(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeIdentifier(value).replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    baselinekit_v0: "baselinekit_v0",
    baseline_kit_v0: "baselinekit_v0",
    baselinekit0: "baselinekit_v0",
  };
  return aliases[normalized] ?? (isUnknownIdentifier(normalized) ? null : normalized);
}

function canonicalTarget(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized || isUnknownIdentifier(normalized)) return null;
  const cidrMatch = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d|[12]\d|3[0-2])$/.exec(normalized);
  if (!cidrMatch) return normalized;
  const octets = cidrMatch[1].split(".").map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return null;
  const prefix = Number(cidrMatch[2]);
  const address = (((octets[0] << 24) >>> 0) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (address & mask) >>> 0;
  return `${(network >>> 24) & 255}.${(network >>> 16) & 255}.${(network >>> 8) & 255}.${network & 255}/${prefix}`;
}

function canonicalHostname(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase().replace(/\.$/, "") ?? "";
  return normalized && !isUnknownIdentifier(normalized) ? normalized : null;
}

function strictTime(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function rejectedEvidence(
  baseline: ObservationBundleV1,
  current: ObservationBundleV1,
  reasonCode: EvidenceReasonCode
): EvidenceAssessment {
  const evidence = buildDiffEvidenceAssessment(baseline, current, 0);
  return {
    ...evidence,
    status: "insufficient-evidence",
    reasonCodes: uniqueReasons([...evidence.reasonCodes, reasonCode]),
    identity: {
      ...evidence.identity,
      status: evidence.identity.status === "not-applicable" ? "uncertain" : evidence.identity.status,
    },
    supports: {
      ...evidence.supports,
      deviceAbsence: false,
      portClosure: false,
      stableBaseline: false,
      comparisonPersistence: false,
      llmSummary: false,
    },
    limitations: [
      ...evidence.limitations,
      "The observations are not compatible enough to support a temporal comparison.",
    ],
  };
}

function reasonForFailure(code: EvidenceAwareComparisonFailureCode): EvidenceReasonCode {
  if (code.includes("interval") || code === "invalid-chronology") {
    return "collection-interval-incompatible";
  }
  if (code.includes("vantage") || code.includes("collector")) {
    return "vantage-incompatible";
  }
  if (code.includes("target") || code.includes("scope")) {
    return "coverage-provenance-conflicting";
  }
  return "comparison-incompatible";
}

function mapObservationComparisonError(code: string): EvidenceAwareComparisonFailureCode {
  if (code === "different_sites") return "different-sites";
  if (code === "ambiguous_comparison" || code === "identical_observations") {
    return "ambiguous-comparison";
  }
  return "invalid-chronology";
}

function failure(code: EvidenceAwareComparisonFailureCode): EvidenceAwareComparisonFailure {
  return { code, message: safeFailureMessage(code) };
}

function safeFailureMessage(code: EvidenceAwareComparisonFailureCode): string {
  switch (code) {
    case "overlapping-collection-intervals":
      return "The collection intervals overlap and cannot support a temporal comparison.";
    case "incompatible-vantage":
    case "unknown-vantage":
    case "incompatible-collector":
    case "unknown-collector":
      return "The observations do not contain compatible collection-vantage evidence.";
    case "incompatible-run-type":
      return "The observations were not produced by compatible collection types.";
    case "incompatible-target-provenance":
    case "unknown-target-provenance":
    case "conflicting-network-scope":
      return "The observations do not contain compatible target-coverage evidence.";
    case "unknown-site":
    case "different-sites":
    case "different-networks":
      return "The observations do not contain compatible site evidence.";
    case "invalid-chronology":
    case "unknown-collection-interval":
      return "The observations do not contain a valid earlier-to-later collection interval.";
    default:
      return "The observations cannot be compared unambiguously.";
  }
}

function isIdentityUncertainEvent(event: ObservationChangeEvent): boolean {
  return event.eventType === "identity-uncertain-possibly-same-device";
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function isUnknownIdentifier(value: string): boolean {
  return !value || value === "unknown" || value.endsWith("-unknown");
}

function uniqueReasons(values: EvidenceReasonCode[]): EvidenceReasonCode[] {
  return [...new Set(values)];
}
