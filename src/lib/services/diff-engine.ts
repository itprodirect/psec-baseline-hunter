/**
 * Diff Engine - evidence-bounded comparison of two scan observations.
 */

import type {
  DiffData,
  HostChange,
  IdentityUncertainChange,
  PortChange,
  RiskLevel,
} from "@/lib/types";
import type { ObservationBundleV1 } from "@/lib/types/observation-bundle";
import type {
  ObservationChangeEvent,
  ObservationComparisonDeviceRef,
} from "@/lib/types/observation-comparison";
import { getEffectivePortRisk, getPortRisk } from "@/lib/constants/risk-ports";
import { getRunByUid } from "./run-registry";
import { adaptRunManifestToObservationBundleV1 } from "./observation-bundle";
import { observationDeviceCoversPort } from "./evidence-policy";
import {
  evaluateEvidenceAwareComparison,
  type EvidenceAwareComparisonFailureCode,
} from "./evidence-aware-comparison";

export const AMBIGUOUS_RUN_COMPARISON_ERROR =
  "baselineRunUid and currentRunUid are ambiguous because both runs are from the same network and minute";

export type DiffComparisonErrorCode =
  | "unknown-site"
  | "different-sites"
  | "different-networks"
  | "conflicting-network-scope"
  | "incompatible-run-type"
  | "incompatible-vantage"
  | "incompatible-collector"
  | "incompatible-target-provenance"
  | "unknown-vantage"
  | "unknown-collector"
  | "unknown-target-provenance"
  | "unknown-collection-interval"
  | "overlapping-collection-intervals"
  | "invalid-chronology"
  | "ambiguous-comparison";

/** A comparison failure safe to return without exposing network identifiers. */
export class DiffComparisonError extends Error {
  readonly code: DiffComparisonErrorCode;

  constructor(code: DiffComparisonErrorCode, message: string) {
    super(message);
    this.name = "DiffComparisonError";
    this.code = code;
  }
}

export function isDiffComparisonError(error: unknown): error is DiffComparisonError {
  return (
    error instanceof DiffComparisonError ||
    (error instanceof Error && error.name === "DiffComparisonError" && "code" in error)
  );
}

export type DiffRiskResolver = (
  port: number,
  protocol: string,
  network: string
) => RiskLevel | null;

export interface BuildDiffOptions {
  riskResolver?: DiffRiskResolver;
}

/**
 * Build a Diff from already-normalized observations.
 *
 * With the default static risk resolver this function is deterministic and
 * performs no registry or artifact I/O, which keeps evidence-policy tests
 * independent of the run registry.
 */
export function buildDiffFromObservationBundles(
  baseline: ObservationBundleV1,
  current: ObservationBundleV1,
  options: BuildDiffOptions = {}
): DiffData {
  const evaluation = evaluateEvidenceAwareComparison(baseline, current);
  if (evaluation.outcome === "rejected" || !evaluation.comparison) {
    const failure = evaluation.failure;
    const code = mapEvidenceAwareErrorCode(failure?.code ?? "ambiguous-comparison");
    throw new DiffComparisonError(
      code,
      code === "ambiguous-comparison"
        ? AMBIGUOUS_RUN_COMPARISON_ERROR
        : failure?.message ?? "Comparison evidence is incompatible."
    );
  }
  const comparison = evaluation.comparison;

  const uncertainEvents = comparison.events.filter(isIdentityUncertainEvent);
  const identityUncertain = uncertainEvents.map(toIdentityUncertainChange);
  const evidence = evaluation.evidence;
  const riskResolver = options.riskResolver ?? staticRiskResolver;

  const baselineSupportsNewness =
    evidence.coverage.baseline !== undefined &&
    !evidence.coverage.baseline.partial &&
    evidence.coverage.baseline.deviceCount > 0 &&
    evidence.coverage.current.scopeKnown;
  const newHosts = baselineSupportsNewness
    ? comparison.events
        .filter(
          (event) =>
            event.eventType === "new-device-observed" &&
            isReliableIdentity(event.confidence)
        )
        .map((event) => toHostChange(event.currentDevice, "added"))
    : [];

  const removedHosts = evidence.supports.deviceAbsence
    ? comparison.events
        .filter(
          (event) =>
            event.eventType === "previously-observed-device-not-observed" &&
            isReliableIdentity(event.confidence)
        )
        .map((event) => toHostChange(event.baselineDevice, "removed"))
    : [];

  const portsOpened = baselineSupportsNewness
    ? comparison.events
        .filter((event) => {
          if (event.eventType !== "service-or-port-opened") return false;
          const port = event.details.currentPort;
          return Boolean(
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
        })
        .map((event) =>
          toPortChange(event, "opened", current.site.networkName, riskResolver)
        )
    : [];

  const portsClosed = evidence.supports.portClosure
    ? comparison.events
        .filter((event) => {
          if (event.eventType !== "service-or-port-closed") return false;
          const port = event.details.baselinePort;
          return Boolean(
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
        })
        .map((event) =>
          toPortChange(event, "closed", current.site.networkName, riskResolver)
        )
    : [];

  // P0/P1 here means an observed service warrants review. Scan vantage alone
  // does not establish Internet exposure, perimeter failure, or exploitability.
  const riskFindings = portsOpened.filter(
    (port) => port.risk === "P0" || port.risk === "P1"
  );
  const summary = generateDiffSummary({
    status: evidence.status,
    newHosts: newHosts.length,
    removedHosts: removedHosts.length,
    identityUncertain: identityUncertain.length,
    portsOpened: portsOpened.length,
    portsClosed: portsClosed.length,
    riskFindings: riskFindings.length,
  });

  return {
    baselineRunUid: baseline.batch.sourceRunUid,
    currentRunUid: current.batch.sourceRunUid,
    baselineTimestamp: observedAt(baseline),
    currentTimestamp: observedAt(current),
    network: current.site.networkName,
    newHosts,
    removedHosts,
    identityUncertain,
    portsOpened,
    portsClosed,
    riskFindings,
    evidence,
    summary,
  };
}

/** Compute a Diff from registered runs while preserving custom risk rules. */
export function computeDiff(baselineRunUid: string, currentRunUid: string): DiffData | null {
  const baselineManifest = getRunByUid(baselineRunUid);
  const currentManifest = getRunByUid(currentRunUid);

  if (!baselineManifest || !currentManifest) return null;

  const baseline = adaptRunManifestToObservationBundleV1(baselineManifest);
  const current = adaptRunManifestToObservationBundleV1(currentManifest);

  return buildDiffFromObservationBundles(baseline, current, {
    riskResolver: getEffectivePortRisk,
  });
}

/** Backwards-compatible preflight helper for callers that still expect text. */
export function getDiffComparisonGuardrailError(
  baselineRunUid: string,
  currentRunUid: string
): string | null {
  const baselineManifest = getRunByUid(baselineRunUid);
  const currentManifest = getRunByUid(currentRunUid);
  if (!baselineManifest || !currentManifest) return null;

  try {
    const baseline = adaptRunManifestToObservationBundleV1(baselineManifest);
    const current = adaptRunManifestToObservationBundleV1(currentManifest);
    buildDiffFromObservationBundles(baseline, current);
    return null;
  } catch (error) {
    if (isDiffComparisonError(error)) return error.message;
    throw error;
  }
}

function mapEvidenceAwareErrorCode(
  code: EvidenceAwareComparisonFailureCode
): DiffComparisonErrorCode {
  switch (code) {
    case "unknown-site":
    case "different-sites":
    case "different-networks":
    case "conflicting-network-scope":
    case "incompatible-run-type":
    case "incompatible-vantage":
    case "incompatible-collector":
    case "incompatible-target-provenance":
    case "unknown-vantage":
    case "unknown-collector":
    case "unknown-target-provenance":
    case "unknown-collection-interval":
    case "overlapping-collection-intervals":
    case "invalid-chronology":
    case "ambiguous-comparison":
      return code;
  }
}

function isIdentityUncertainEvent(event: ObservationChangeEvent): boolean {
  if (event.eventType === "identity-uncertain-possibly-same-device") return true;
  if (
    event.eventType !== "new-device-observed" &&
    event.eventType !== "previously-observed-device-not-observed"
  ) {
    return false;
  }
  return !isReliableIdentity(event.confidence);
}

function isReliableIdentity(confidence: ObservationChangeEvent["confidence"]): boolean {
  return confidence === "strongest" || confidence === "strong";
}

function toHostChange(
  device: ObservationComparisonDeviceRef | null,
  changeType: HostChange["changeType"]
): HostChange {
  return {
    ip: device?.ips[0] ?? "unknown",
    hostname: device?.hostnames[0] || undefined,
    changeType,
  };
}

function toIdentityUncertainChange(
  event: ObservationChangeEvent
): IdentityUncertainChange {
  return {
    baselineIp: event.baselineDevice?.ips[0] || undefined,
    currentIp: event.currentDevice?.ips[0] || undefined,
    baselineHostname: event.baselineDevice?.hostnames[0] || undefined,
    currentHostname: event.currentDevice?.hostnames[0] || undefined,
    confidence: event.confidence,
    summary: event.summary,
  };
}

function toPortChange(
  event: ObservationChangeEvent,
  changeType: PortChange["changeType"],
  network: string,
  riskResolver: DiffRiskResolver
): PortChange {
  const port =
    changeType === "opened" ? event.details.currentPort : event.details.baselinePort;
  const device =
    changeType === "opened" ? event.currentDevice : event.baselineDevice;

  if (!port) {
    throw new Error("Observation comparison returned a port event without port evidence.");
  }

  const risk = riskResolver(port.port, port.protocol, network);
  return {
    ip: device?.ips[0] ?? "unknown",
    hostname: device?.hostnames[0] || undefined,
    port: port.port,
    protocol: port.protocol,
    service: port.service ?? "unknown",
    changeType,
    risk: risk || undefined,
  };
}

function staticRiskResolver(port: number): RiskLevel | null {
  return getPortRisk(port);
}

function observedAt(bundle: ObservationBundleV1): string {
  return firstValidIso(bundle.batch.endedAt) ??
    firstValidIso(bundle.batch.startedAt) ??
    firstValidIso(bundle.batch.generatedAt) ??
    bundle.batch.generatedAt;
}

function firstValidIso(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function generateDiffSummary(counts: {
  status: DiffData["evidence"]["status"];
  newHosts: number;
  removedHosts: number;
  identityUncertain: number;
  portsOpened: number;
  portsClosed: number;
  riskFindings: number;
}): string {
  if (counts.status === "insufficient-evidence") {
    return "Comparison evidence is insufficient for complete device-absence, port-closure, or no-change conclusions. Review the recorded evidence limitations.";
  }

  if (counts.status === "uncertain") {
    return `${counts.identityUncertain} device identity relationship${counts.identityUncertain === 1 ? " remains" : "s remain"} uncertain. Supported point-in-time observations are listed separately.`;
  }

  const parts: string[] = [];
  if (counts.riskFindings > 0) {
    parts.push(
      `${counts.riskFindings} newly observed P0/P1-classified service finding${counts.riskFindings === 1 ? " requires" : "s require"} review.`
    );
  }
  if (counts.newHosts > 0) parts.push(`${counts.newHosts} new device observation${counts.newHosts === 1 ? "" : "s"}.`);
  if (counts.removedHosts > 0) {
    parts.push(`${counts.removedHosts} baseline device${counts.removedHosts === 1 ? " was" : "s were"} not observed in the current evidence.`);
  }
  if (counts.portsOpened > 0) parts.push(`${counts.portsOpened} service${counts.portsOpened === 1 ? " was" : "s were"} newly observed open.`);
  if (counts.portsClosed > 0) {
    parts.push(`${counts.portsClosed} previously observed open service${counts.portsClosed === 1 ? " was" : "s were"} not observed open in the current evidence.`);
  }

  return parts.length > 0
    ? parts.join(" ")
    : "No supported point-in-time changes were identified in the compared observations.";
}
