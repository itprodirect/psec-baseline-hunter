/**
 * Diff Engine - Compares two scan runs and computes differences
 */

import * as fs from "fs";
import { PortFinding, DiffData, HostChange, PortChange } from "@/lib/types";
import { getRunByUid } from "./run-registry";
import { parsePorts } from "./nmap-parser";
import { getPortRisk } from "@/lib/constants/risk-ports";

/**
 * Device summary for a single host
 */
export interface DeviceSummary {
  ip: string;
  hostname: string;
  ports: { port: number; protocol: string; service: string; state: string }[];
}

/**
 * Build device summaries from port findings
 */
function buildDeviceSummaries(findings: PortFinding[]): Map<string, DeviceSummary> {
  const devices = new Map<string, DeviceSummary>();

  for (const f of findings) {
    if (f.state !== "open") continue;

    if (!devices.has(f.ip)) {
      devices.set(f.ip, {
        ip: f.ip,
        hostname: f.hostname || "",
        ports: [],
      });
    }

    const device = devices.get(f.ip)!;
    // Update hostname if we have a better one
    if (f.hostname && !device.hostname) {
      device.hostname = f.hostname;
    }
    device.ports.push({
      port: f.port,
      protocol: f.protocol,
      service: f.service,
      state: f.state,
    });
  }

  return devices;
}

/**
 * Compute diff between two runs
 */
export function computeDiff(baselineRunUid: string, currentRunUid: string): DiffData | null {
  const baselineManifest = getRunByUid(baselineRunUid);
  const currentManifest = getRunByUid(currentRunUid);

  if (!baselineManifest || !currentManifest) {
    return null;
  }

  // Find ports XML files
  const baselinePortsXml = (baselineManifest.keyFiles.ports || []).find((f) => f.endsWith(".xml"));
  const currentPortsXml = (currentManifest.keyFiles.ports || []).find((f) => f.endsWith(".xml"));

  if (!baselinePortsXml || !currentPortsXml) {
    return null;
  }

  if (!fs.existsSync(baselinePortsXml) || !fs.existsSync(currentPortsXml)) {
    return null;
  }

  // Parse both runs
  const baselineFindings = parsePorts(baselinePortsXml);
  const currentFindings = parsePorts(currentPortsXml);

  // Build device summaries
  const baselineDevices = buildDeviceSummaries(baselineFindings);
  const currentDevices = buildDeviceSummaries(currentFindings);

  // Compute host differences
  const baselineIPs = new Set(baselineDevices.keys());
  const currentIPs = new Set(currentDevices.keys());

  const newHosts: HostChange[] = [];
  const removedHosts: HostChange[] = [];

  for (const ip of currentIPs) {
    if (!baselineIPs.has(ip)) {
      const device = currentDevices.get(ip)!;
      newHosts.push({
        ip,
        hostname: device.hostname || undefined,
        changeType: "added",
      });
    }
  }

  for (const ip of baselineIPs) {
    if (!currentIPs.has(ip)) {
      const device = baselineDevices.get(ip)!;
      removedHosts.push({
        ip,
        hostname: device.hostname || undefined,
        changeType: "removed",
      });
    }
  }

  // Compute port differences
  const portsOpened: PortChange[] = [];
  const portsClosed: PortChange[] = [];

  // Check for new ports on existing and new hosts
  for (const [ip, currentDevice] of currentDevices) {
    const baselineDevice = baselineDevices.get(ip);
    const baselinePorts = new Set(
      baselineDevice?.ports.map((p) => `${p.protocol}:${p.port}`) || []
    );

    for (const port of currentDevice.ports) {
      const portKey = `${port.protocol}:${port.port}`;
      if (!baselinePorts.has(portKey)) {
        const risk = getPortRisk(port.port);
        portsOpened.push({
          ip,
          hostname: currentDevice.hostname || undefined,
          port: port.port,
          protocol: port.protocol,
          service: port.service,
          changeType: "opened",
          risk: risk || undefined,
        });
      }
    }
  }

  // Check for closed ports on existing and removed hosts
  for (const [ip, baselineDevice] of baselineDevices) {
    const currentDevice = currentDevices.get(ip);
    const currentPorts = new Set(
      currentDevice?.ports.map((p) => `${p.protocol}:${p.port}`) || []
    );

    for (const port of baselineDevice.ports) {
      const portKey = `${port.protocol}:${port.port}`;
      if (!currentPorts.has(portKey)) {
        portsClosed.push({
          ip,
          hostname: baselineDevice.hostname || undefined,
          port: port.port,
          protocol: port.protocol,
          service: port.service,
          changeType: "closed",
        });
      }
    }
  }

  // Identify risky exposures (P0 ports that were opened)
  const riskyExposures = portsOpened.filter((p) => p.risk === "P0");

  // Generate summary
  const summary = generateDiffSummary(
    newHosts.length,
    removedHosts.length,
    portsOpened.length,
    portsClosed.length,
    riskyExposures.length
  );

  return {
    baselineRunUid,
    currentRunUid,
    baselineTimestamp: baselineManifest.timestamp || new Date().toISOString(),
    currentTimestamp: currentManifest.timestamp || new Date().toISOString(),
    network: currentManifest.network,
    newHosts,
    removedHosts,
    portsOpened,
    portsClosed,
    riskyExposures,
    summary,
  };
}

/**
 * Generate human-readable diff summary
 */
function generateDiffSummary(
  newHosts: number,
  removedHosts: number,
  portsOpened: number,
  portsClosed: number,
  riskyExposures: number
): string {
  const parts: string[] = [];

  if (riskyExposures > 0) {
    parts.push(
      `${riskyExposures} critical exposure${riskyExposures !== 1 ? "s" : ""} detected requiring immediate action.`
    );
  }

  if (newHosts > 0 || removedHosts > 0) {
    const hostChanges: string[] = [];
    if (newHosts > 0) hostChanges.push(`${newHosts} new`);
    if (removedHosts > 0) hostChanges.push(`${removedHosts} removed`);
    parts.push(`Host changes: ${hostChanges.join(", ")}.`);
  }

  if (portsOpened > 0 || portsClosed > 0) {
    const portChanges: string[] = [];
    if (portsOpened > 0) portChanges.push(`${portsOpened} opened`);
    if (portsClosed > 0) portChanges.push(`${portsClosed} closed`);
    parts.push(`Port changes: ${portChanges.join(", ")}.`);
  }

  if (parts.length === 0) {
    return "No significant changes detected between scans. Network baseline is stable.";
  }

  return parts.join(" ");
}

/**
 * Compute risk score (0-100) based on findings
 */
export function computeRiskScore(diffData: DiffData): number {
  let score = 100; // Start at 100 (perfect)

  // Deduct for P0 exposures (most severe)
  score -= diffData.riskyExposures.length * 15;

  // Deduct for P1 ports opened
  const p1Ports = diffData.portsOpened.filter((p) => p.risk === "P1").length;
  score -= p1Ports * 5;

  // Deduct for unknown new hosts (could be rogue devices)
  score -= diffData.newHosts.length * 3;

  // Small deduction for any port changes (indicates activity)
  score -= Math.min(diffData.portsOpened.length, 10) * 1;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, score));
}

/**
 * Get risk score label and color
 */
export function getRiskScoreLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Excellent", color: "green" };
  if (score >= 70) return { label: "Good", color: "blue" };
  if (score >= 50) return { label: "Fair", color: "yellow" };
  if (score >= 30) return { label: "Poor", color: "orange" };
  return { label: "Critical", color: "red" };
}
