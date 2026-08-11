/**
 * Risk Classification Service
 * Classifies observed services without converting scan vantage into exposure
 * or overall-security conclusions.
 */

import type {
  EvidenceAssessment,
  PortFinding,
  RiskLevel,
  RiskPort,
  ScorecardData,
} from "@/lib/types";
import type { ObservationBundleV1 } from "@/lib/types/observation-bundle";
import { getEffectivePortRisk, getPortRisk } from "@/lib/constants/risk-ports";
import { topPorts } from "./nmap-parser";
import { getRunByUid } from "./run-registry";
import { adaptRunManifestToObservationBundleV1 } from "./observation-bundle";
import { buildScorecardEvidenceAssessment } from "./evidence-policy";

export type ScorecardRiskResolver = (
  port: number,
  protocol: string,
  network: string
) => RiskLevel | null;

export interface BuildScorecardOptions {
  riskResolver?: ScorecardRiskResolver;
}

/** Classify open port observations, including configured custom rules. */
export function classifyPorts(findings: PortFinding[], network: string): {
  p0: PortFinding[];
  p1: PortFinding[];
  p2: PortFinding[];
  unclassified: PortFinding[];
} {
  const result = {
    p0: [] as PortFinding[],
    p1: [] as PortFinding[],
    p2: [] as PortFinding[],
    unclassified: [] as PortFinding[],
  };

  for (const finding of findings) {
    if (finding.state !== "open") continue;

    const risk = getEffectivePortRisk(finding.port, finding.protocol, network);
    switch (risk) {
      case "P0":
        result.p0.push(finding);
        break;
      case "P1":
        result.p1.push(finding);
        break;
      case "P2":
        result.p2.push(finding);
        break;
      default:
        result.unclassified.push(finding);
    }
  }

  return result;
}

/** Aggregate risk-classified observed services with host lists. */
export function aggregateRiskPorts(findings: PortFinding[], network: string): RiskPort[] {
  return aggregateRiskPortsWithResolver(findings, network, getEffectivePortRisk);
}

function aggregateRiskPortsWithResolver(
  findings: PortFinding[],
  network: string,
  riskResolver: ScorecardRiskResolver
): RiskPort[] {
  const portMap = new Map<string, RiskPort>();

  for (const finding of findings) {
    if (finding.state !== "open") continue;

    const risk = riskResolver(finding.port, finding.protocol, network);
    if (!risk) continue;

    const key = `${finding.protocol}:${finding.port}`;
    if (!portMap.has(key)) {
      portMap.set(key, {
        port: finding.port,
        protocol: finding.protocol,
        service: finding.service,
        risk,
        hostsAffected: 0,
        hosts: [],
      });
    }

    const entry = portMap.get(key)!;
    if (!entry.hosts.includes(finding.ip)) {
      entry.hosts.push(finding.ip);
      entry.hostsAffected = entry.hosts.length;
    }
  }

  const riskOrder: Record<RiskLevel, number> = { P0: 0, P1: 1, P2: 2 };
  return Array.from(portMap.values()).sort((a, b) => {
    const riskDiff = riskOrder[a.risk] - riskOrder[b.risk];
    return riskDiff !== 0 ? riskDiff : b.hostsAffected - a.hostsAffected;
  });
}

/** Generate review actions for observed P0/P1 services. */
export function generateActions(riskPorts: RiskPort[]): string[] {
  const actions: string[] = [];
  const prioritized = [
    ...riskPorts.filter((riskPort) => riskPort.risk === "P0"),
    ...riskPorts.filter((riskPort) => riskPort.risk === "P1"),
  ];

  for (const riskPort of prioritized.slice(0, 3)) {
    const target = riskPort.service || `port ${riskPort.port}`;
    const hostScope =
      riskPort.hostsAffected === 1 ? "1 observed host" : `${riskPort.hostsAffected} observed hosts`;
    actions.push(
      `Review access controls for ${target} and confirm the observed service is required (${riskPort.port}/${riskPort.protocol} on ${hostScope})`
    );
  }

  if (actions.length === 0) {
    actions.push(
      "No P0 or P1 services were observed within the recorded scan coverage; continue evidence collection and routine review"
    );
  }

  return actions;
}

/** Generate an evidence-bounded human-readable Scorecard summary. */
export function generateSummary(
  totalHosts: number,
  openPorts: number,
  riskPorts: RiskPort[],
  evidence?: EvidenceAssessment
): string {
  const p0Ports = riskPorts.filter((riskPort) => riskPort.risk === "P0");
  const p1Ports = riskPorts.filter((riskPort) => riskPort.risk === "P1");
  const reviewPorts = [...p0Ports, ...p1Ports];
  const reviewHosts = new Set(reviewPorts.flatMap((riskPort) => riskPort.hosts)).size;

  if (evidence?.status === "insufficient-evidence") {
    return `Recorded ${totalHosts} devices and ${openPorts} open service observations, but collection coverage is insufficient for a complete conclusion. Review the evidence limitations.`;
  }

  if (totalHosts === 0) {
    return "No devices were recorded in this observation. This does not establish device absence or overall network security.";
  }

  if (reviewPorts.length === 0) {
    return `Recorded ${totalHosts} devices and ${openPorts} open service observations. No P0 or P1 services were observed within the recorded coverage; this does not establish overall security.`;
  }

  return `Recorded ${totalHosts} devices and ${openPorts} open service observations. ${p0Ports.length} P0 and ${p1Ports.length} P1 service finding${reviewPorts.length === 1 ? "" : "s"} affected ${reviewHosts} observed host${reviewHosts === 1 ? "" : "s"}; review service need and access controls.`;
}

/**
 * Build a Scorecard from an already-normalized observation.
 *
 * With the default static risk resolver this function performs no registry or
 * artifact I/O and is deterministic for the supplied bundle.
 */
export function buildScorecardDataFromObservationBundle(
  bundle: ObservationBundleV1,
  options: BuildScorecardOptions = {}
): ScorecardData {
  const riskResolver = options.riskResolver ?? staticRiskResolver;
  const findings = observationFindings(bundle);
  const riskPorts = aggregateRiskPortsWithResolver(
    findings,
    bundle.site.networkName,
    riskResolver
  );
  const relevantRiskPorts = riskPorts.filter(
    (riskPort) => riskPort.risk === "P0" || riskPort.risk === "P1"
  );
  const evidence = buildScorecardEvidenceAssessment(bundle);
  const uniqueServices = new Set(
    findings.map((finding) => finding.service).filter(Boolean)
  );

  return {
    runUid: bundle.batch.sourceRunUid,
    network: bundle.site.networkName,
    timestamp: observedAt(bundle),
    totalHosts: bundle.devices.length,
    openPorts: findings.length,
    uniqueServices: uniqueServices.size,
    riskPorts: relevantRiskPorts.length,
    topPorts: topPorts(findings, 10),
    riskPortsDetail: relevantRiskPorts,
    evidence,
    summary: generateSummary(bundle.devices.length, findings.length, riskPorts, evidence),
  };
}

/** Alias retained for concise fixture-oriented imports. */
export const buildScorecardFromObservationBundle =
  buildScorecardDataFromObservationBundle;

/** Build a Scorecard from a registered run while preserving custom rules. */
export function buildScorecardData(runUid: string): ScorecardData | null {
  const manifest = getRunByUid(runUid);
  if (!manifest) return null;

  const bundle = adaptRunManifestToObservationBundleV1(manifest);
  return buildScorecardDataFromObservationBundle(bundle, {
    riskResolver: getEffectivePortRisk,
  });
}

export function getScorecardActions(scorecardData: ScorecardData): string[] {
  return generateActions(scorecardData.riskPortsDetail);
}

function observationFindings(bundle: ObservationBundleV1): PortFinding[] {
  const findings = new Map<string, PortFinding>();

  bundle.devices.forEach((device, deviceIndex) => {
    const address =
      device.ips[0] ?? device.hostnames[0] ?? `unaddressed-device-${deviceIndex + 1}`;
    const hostname = device.hostnames[0] ?? "";

    for (const port of device.openPorts) {
      const key = `${device.deviceId}|${port.protocol.toLowerCase()}:${port.port}`;
      const existing = findings.get(key);
      const candidate: PortFinding = {
        ip: address,
        hostname,
        protocol: port.protocol,
        port: port.port,
        state: "open",
        service: port.service ?? "unknown",
        product: port.product ?? "",
        version: port.version ?? "",
        sourceXml: port.sourceId,
      };

      if (!existing || existing.service === "unknown") findings.set(key, candidate);
    }
  });

  return [...findings.values()];
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
