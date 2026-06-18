/**
 * Deterministic watch rules for the Traffic Visualizer.
 *
 * Rule-based only (no LLM) and deliberately calm: findings say "worth
 * reviewing" or "unusual", never "malware" or "attack" — a packet capture
 * alone is not strong enough evidence for definitive claims.
 *
 * Pure module: safe for client-side use (demo mode runs it in the browser).
 */

import type {
  NormalizedCapture,
  TrafficAlert,
  TrafficDevice,
  TrafficFlow,
  WatchLevel,
} from "@/lib/types/packet-highway";
import {
  ADMIN_REMOTE_PORTS,
  CRITICAL_TRAFFIC_PORTS,
} from "@/lib/constants/traffic-services";
import { formatTrafficBytes, getDeviceDisplayName } from "@/lib/utils/traffic-format";

// Thresholds (exported for tests)
export const HIGH_OUTBOUND_BYTES_THRESHOLD = 50 * 1024 * 1024; // 50 MB in one capture
export const MANY_DNS_QUERIES_PER_DEVICE_THRESHOLD = 150;
export const MANY_UNIQUE_DNS_NAMES_THRESHOLD = 300;
export const MANY_EXTERNAL_PEERS_THRESHOLD = 25;

export interface TrafficRuleInput {
  devices: TrafficDevice[];
  flows: TrafficFlow[];
  uniqueDnsNames: number;
  /** True when the user uploaded a device inventory CSV */
  inventoryProvided: boolean;
}

export function evaluateTrafficWatchItems(input: TrafficRuleInput): TrafficAlert[] {
  const alerts: TrafficAlert[] = [];
  const deviceById = new Map(input.devices.map((d) => [d.id, d]));
  const realDevices = input.devices.filter((d) => d.role === "device");
  let alertSeq = 0;

  const addAlert = (
    ruleId: string,
    level: WatchLevel,
    title: string,
    detail: string,
    deviceIds: string[] = [],
    flowIds: string[] = []
  ) => {
    alerts.push({
      id: `alert-${++alertSeq}`,
      ruleId,
      level,
      title,
      detail,
      deviceIds,
      flowIds,
    });
  };

  const nameOf = (id: string): string => {
    const device = deviceById.get(id);
    return device ? getDeviceDisplayName(device) : "an internet endpoint";
  };

  const listNames = (ids: string[]): string =>
    ids
      .slice(0, 4)
      .map(nameOf)
      .join(", ") + (ids.length > 4 ? ` and ${ids.length - 4} more` : "");

  // --- Rule: unknown device observed (only meaningful with an inventory) ---
  if (input.inventoryProvided) {
    const unknown = realDevices.filter((d) => !d.isKnown);
    if (unknown.length > 0) {
      addAlert(
        "unknown-device",
        "review",
        unknown.length === 1 ? "1 device isn't in your device list" : `${unknown.length} devices aren't in your device list`,
        `${listNames(unknown.map((d) => d.id))} sent or received traffic but ${unknown.length === 1 ? "isn't" : "aren't"} in the device list you uploaded. This is often just a phone or guest device — if you don't recognize it, it's worth a closer look.`,
        unknown.map((d) => d.id)
      );
    }
  }

  // --- Rule: admin / remote-access ports observed ---
  const adminFlows = input.flows.filter(
    (f) =>
      f.category === "ssh" ||
      f.category === "rdp" ||
      (f.port !== null && ADMIN_REMOTE_PORTS.includes(f.port))
  );
  if (adminFlows.length > 0) {
    const external = adminFlows.some((f) => f.scope === "external");
    addAlert(
      "admin-remote-ports",
      external ? "watch" : "review",
      "Remote-control style connections seen",
      `Connections on remote admin channels (like SSH or remote desktop) were observed${external ? ", including with the internet" : " between local devices"}. Fine if you or your IT support did this on purpose — worth reviewing if nobody was managing a device at the time.`,
      uniqueDeviceIds(adminFlows, deviceById),
      adminFlows.slice(0, 10).map((f) => f.id)
    );
  }

  // --- Rule: critical risky ports observed ---
  const criticalFlows = input.flows.filter(
    (f) => f.port !== null && CRITICAL_TRAFFIC_PORTS.includes(f.port) && f.category !== "ssh"
  );
  if (criticalFlows.length > 0) {
    const external = criticalFlows.some((f) => f.scope === "external");
    addAlert(
      "critical-ports",
      external ? "watch" : "review",
      external
        ? "Sensitive services talked with the internet"
        : "Sensitive services in use on the local network",
      `Traffic was seen on ports used by file sharing, remote desktop, or databases (${formatPortList(criticalFlows)}). ${external ? "These services exchanging traffic with the internet is potentially risky and worth reviewing soon." : "Between your own devices this is often normal (e.g. Windows file sharing), but it's good to know it's happening."}`,
      uniqueDeviceIds(criticalFlows, deviceById),
      criticalFlows.slice(0, 10).map((f) => f.id)
    );
  }

  // --- Rule: unusually high outbound volume from one device ---
  for (const device of realDevices) {
    const outbound = outboundExternalBytes(device.id, input.flows);
    if (outbound > HIGH_OUTBOUND_BYTES_THRESHOLD) {
      addAlert(
        "high-outbound-volume",
        "review",
        `${getDeviceDisplayName(device)} uploaded a lot of data`,
        `${getDeviceDisplayName(device)} sent ${formatTrafficBytes(outbound)} to the internet during this capture. Cloud backups and video calls can look like this — if neither was happening, it's worth reviewing what this device does.`,
        [device.id]
      );
    }
  }

  // --- Rule: many DNS/mDNS queries ---
  const chattyResolvers = realDevices.filter(
    (d) => d.dnsQueryCount > MANY_DNS_QUERIES_PER_DEVICE_THRESHOLD
  );
  if (chattyResolvers.length > 0) {
    addAlert(
      "many-dns-queries",
      "info",
      "Very chatty address lookups",
      `${listNames(chattyResolvers.map((d) => d.id))} made an unusually high number of name lookups (DNS). Smart TVs and ad-heavy apps often do this; it's usually harmless but explains a busy network.`,
      chattyResolvers.map((d) => d.id)
    );
  } else if (input.uniqueDnsNames > MANY_UNIQUE_DNS_NAMES_THRESHOLD) {
    addAlert(
      "many-dns-queries",
      "info",
      "Lots of different addresses looked up",
      `Devices looked up ${input.uniqueDnsNames} different names during this capture. That's busy but common on networks with streaming devices and smart gadgets.`,
      []
    );
  }

  // --- Rule: one device talking to many external endpoints ---
  const fanOutDevices = realDevices.filter(
    (d) => d.externalPeerCount > MANY_EXTERNAL_PEERS_THRESHOLD
  );
  if (fanOutDevices.length > 0) {
    addAlert(
      "many-external-endpoints",
      "review",
      "A device talked to many different places online",
      `${listNames(fanOutDevices.map((d) => d.id))} exchanged traffic with ${fanOutDevices.length === 1 ? `${fanOutDevices[0].externalPeerCount} different internet endpoints` : "an unusually high number of internet endpoints"}. Streaming and web browsing can do this — if the device should be quiet (like a printer), that's unusual and worth reviewing.`,
      fanOutDevices.map((d) => d.id)
    );
  }

  // --- Rule: unencrypted HTTP observed ---
  const httpFlows = input.flows.filter((f) => f.category === "http");
  if (httpFlows.length > 0) {
    const external = httpFlows.some((f) => f.scope === "external");
    addAlert(
      "unencrypted-http",
      "review",
      "Unencrypted web traffic seen",
      `${listNames(uniqueDeviceIds(httpFlows, deviceById))} used old-style unencrypted web connections (HTTP)${external ? " with the internet" : ""}. HTTP traffic can expose page activity on the network. Many gadgets use HTTP for setup or updates, but avoid logging into anything over it.`,
      uniqueDeviceIds(httpFlows, deviceById),
      httpFlows.slice(0, 10).map((f) => f.id)
    );
  }

  const levelRank: Record<WatchLevel, number> = { watch: 0, review: 1, info: 2 };
  return alerts.sort((a, b) => levelRank[a.level] - levelRank[b.level]);
}

/** Bytes a device sent to external endpoints across all its flows */
export function outboundExternalBytes(deviceId: string, flows: TrafficFlow[]): number {
  let total = 0;
  for (const flow of flows) {
    if (flow.scope !== "external") continue;
    if (flow.fromId === deviceId) total += flow.bytesFromInitiator;
    else if (flow.toId === deviceId) total += flow.bytes - flow.bytesFromInitiator;
  }
  return total;
}

function uniqueDeviceIds(
  flows: TrafficFlow[],
  deviceById: Map<string, TrafficDevice>
): string[] {
  const ids = new Set<string>();
  for (const flow of flows) {
    for (const id of [flow.fromId, flow.toId]) {
      const device = deviceById.get(id);
      if (device && device.role !== "broadcast") ids.add(id);
    }
  }
  return [...ids];
}

function formatPortList(flows: TrafficFlow[]): string {
  const ports = [...new Set(flows.map((f) => f.port).filter((p): p is number => p !== null))];
  return ports
    .slice(0, 5)
    .map((p) => `port ${p}`)
    .join(", ");
}

/** Convenience wrapper used by the normalizer and demo builder */
export function evaluateCaptureAlerts(
  capture: Pick<NormalizedCapture, "devices" | "flows">,
  uniqueDnsNames: number,
  inventoryProvided: boolean
): TrafficAlert[] {
  return evaluateTrafficWatchItems({
    devices: capture.devices,
    flows: capture.flows,
    uniqueDnsNames,
    inventoryProvided,
  });
}
