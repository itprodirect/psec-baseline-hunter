/**
 * Risk Classification Service
 * Analyzes port findings and classifies them by risk level
 */

import { PortFinding, TopPort, RiskPort, RiskLevel, ScorecardData } from "@/lib/types";
import { getPortRisk, P0_ACTIONS, RISK_DESCRIPTIONS } from "@/lib/constants/risk-ports";
import { parsePorts, topPorts } from "./nmap-parser";
import { getRunByUid } from "./run-registry";
import * as fs from "fs";
import * as path from "path";

/**
 * Classify a list of port findings by risk level
 */
export function classifyPorts(findings: PortFinding[]): {
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

    const risk = getPortRisk(finding.port);
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

/**
 * Aggregate risk ports with host lists
 */
export function aggregateRiskPorts(findings: PortFinding[]): RiskPort[] {
  const openFindings = findings.filter((f) => f.state === "open");
  const portMap = new Map<string, RiskPort>();

  for (const finding of openFindings) {
    const risk = getPortRisk(finding.port);
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

  // Sort by risk level (P0 first), then by hosts affected
  const riskOrder: Record<RiskLevel, number> = { P0: 0, P1: 1, P2: 2 };
  return Array.from(portMap.values()).sort((a, b) => {
    const riskDiff = riskOrder[a.risk] - riskOrder[b.risk];
    if (riskDiff !== 0) return riskDiff;
    return b.hostsAffected - a.hostsAffected;
  });
}

/**
 * Generate top 3 recommended actions based on risk findings
 */
export function generateActions(riskPorts: RiskPort[]): string[] {
  const actions: string[] = [];
  const p0Ports = riskPorts.filter((r) => r.risk === "P0");

  for (const rp of p0Ports.slice(0, 3)) {
    const action = P0_ACTIONS[rp.port];
    if (action) {
      const hostInfo = rp.hostsAffected === 1
        ? `on ${rp.hosts[0]}`
        : `on ${rp.hostsAffected} hosts`;
      actions.push(`${action} (${rp.port}/${rp.protocol} ${hostInfo})`);
    } else {
      actions.push(`Block port ${rp.port}/${rp.protocol} at perimeter (${rp.hostsAffected} hosts)`);
    }
  }

  // If we don't have 3 actions yet, add P1 recommendations
  const p1Ports = riskPorts.filter((r) => r.risk === "P1");
  for (const rp of p1Ports.slice(0, 3 - actions.length)) {
    actions.push(`Review and restrict ${rp.service || `port ${rp.port}`} access (${rp.hostsAffected} hosts)`);
  }

  // Generic action if still not enough
  if (actions.length === 0) {
    actions.push("No critical exposures detected - continue monitoring");
  }

  return actions.slice(0, 3);
}

/**
 * Generate human-readable summary
 */
export function generateSummary(
  totalHosts: number,
  openPorts: number,
  riskPorts: RiskPort[]
): string {
  const p0Count = riskPorts.filter((r) => r.risk === "P0").length;
  const p0Hosts = new Set(riskPorts.filter((r) => r.risk === "P0").flatMap((r) => r.hosts)).size;

  if (p0Count === 0) {
    return `Scan shows ${totalHosts} hosts with ${openPorts} open ports. No critical (P0) exposures detected. Standard services are running within expected parameters.`;
  }

  const topP0 = riskPorts.find((r) => r.risk === "P0");
  const serviceName = topP0?.service || `port ${topP0?.port}`;

  if (p0Count === 1) {
    return `Scan shows ${totalHosts} hosts with ${openPorts} open ports. One critical exposure: ${serviceName} on ${p0Hosts} host${p0Hosts !== 1 ? "s" : ""}. Recommend immediate remediation.`;
  }

  return `Scan shows ${totalHosts} hosts with ${openPorts} open ports. ${p0Count} critical exposures detected affecting ${p0Hosts} hosts. Most urgent: ${serviceName}. Immediate action required.`;
}

/**
 * Read hosts_up.txt to get total host count
 */
function readHostsUpCount(hostsUpPath: string): number {
  try {
    const content = fs.readFileSync(hostsUpPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim() && !line.startsWith("#"));
    return lines.length;
  } catch {
    return 0;
  }
}

/**
 * Build scorecard data for a run
 */
export function buildScorecardData(runUid: string): ScorecardData | null {
  const manifest = getRunByUid(runUid);
  if (!manifest) {
    return null;
  }

  // Find the ports XML file
  const portsFiles = manifest.keyFiles.ports || [];
  const portsXml = portsFiles.find((f) => f.endsWith(".xml"));

  if (!portsXml || !fs.existsSync(portsXml)) {
    return null;
  }

  // Parse ports
  const findings = parsePorts(portsXml);
  const openFindings = findings.filter((f) => f.state === "open");

  // Get top ports
  const topPortsList = topPorts(findings, 10);

  // Classify and aggregate risks
  const riskPortsList = aggregateRiskPorts(findings);

  // Count unique hosts and services
  const uniqueHosts = new Set(openFindings.map((f) => f.ip));
  const uniqueServices = new Set(openFindings.map((f) => f.service).filter(Boolean));

  // Try to get host count from hosts_up.txt
  const hostsUpFiles = manifest.keyFiles.hosts_up || [];
  let totalHosts = uniqueHosts.size;
  if (hostsUpFiles.length > 0 && fs.existsSync(hostsUpFiles[0])) {
    const hostsUpCount = readHostsUpCount(hostsUpFiles[0]);
    if (hostsUpCount > 0) {
      totalHosts = hostsUpCount;
    }
  }

  // Generate summary
  const summary = generateSummary(totalHosts, openFindings.length, riskPortsList);

  return {
    runUid,
    network: manifest.network,
    timestamp: manifest.timestamp || new Date().toISOString(),
    totalHosts,
    openPorts: openFindings.length,
    uniqueServices: uniqueServices.size,
    riskPorts: riskPortsList.filter((r) => r.risk === "P0" || r.risk === "P1").length,
    topPorts: topPortsList,
    riskPortsDetail: riskPortsList.filter((r) => r.risk === "P0" || r.risk === "P1"),
    summary,
  };
}

/**
 * Get actions for a scorecard
 */
export function getScorecardActions(scorecardData: ScorecardData): string[] {
  return generateActions(scorecardData.riskPortsDetail);
}
