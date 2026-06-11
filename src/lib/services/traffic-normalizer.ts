/**
 * Traffic normalizer: converts parser aggregates (CaptureExtract) plus an
 * optional device inventory into the NormalizedCapture JSON model used by
 * the Traffic Visualizer UI.
 *
 * Pure module (no fs/network) so the demo fixture can run the exact same
 * pipeline in the browser. Inventory types are imported type-only.
 */

import type { InventoryDevice } from "./inventory";
import type { CaptureExtract, FlowAggregate, HostAggregate } from "./pcap-parser";
import {
  AnimationEvent,
  BROADCAST_NODE_ID,
  CaptureFormat,
  DnsQueryInfo,
  ExternalEndpoint,
  NormalizedCapture,
  ServiceCategory,
  TrafficDevice,
  TrafficFlow,
} from "@/lib/types/packet-highway";
import { classifyService } from "@/lib/constants/traffic-services";
import { evaluateTrafficWatchItems } from "./traffic-risk-rules";
import { buildTrafficSummary } from "./traffic-summary";

// Output size caps — the UI doesn't need more, and it keeps responses light.
export const MAX_OUTPUT_FLOWS = 500;
export const MAX_OUTPUT_EXTERNAL_ENDPOINTS = 200;
export const MAX_OUTPUT_DNS_QUERIES = 200;
export const MAX_ANIMATION_EVENTS = 320;
const MAX_ANIMATED_FLOWS = 40;

export interface NormalizeOptions {
  /** Display name only — must already be a basename, never a path */
  fileName: string;
  format?: CaptureFormat;
  inventoryDevices?: InventoryDevice[] | null;
}

export function buildNormalizedCapture(
  extract: CaptureExtract,
  options: NormalizeOptions
): NormalizedCapture {
  const inventory = options.inventoryDevices ?? null;
  const gatewayMac = pickGatewayMac(extract);

  // --- Devices ------------------------------------------------------------
  const hostList = [...extract.hosts.values()].sort(
    (a, b) => b.bytesSent + b.bytesReceived - (a.bytesSent + a.bytesReceived)
  );

  const deviceIdByMac = new Map<string, string>();
  const devices: TrafficDevice[] = [];
  let deviceSeq = 0;

  for (const host of hostList) {
    const isGateway = host.mac === gatewayMac;
    const id = isGateway ? "gateway" : `dev-${++deviceSeq}`;
    deviceIdByMac.set(host.mac, id);
    const match = inventory ? matchInventory(host, inventory) : null;

    devices.push({
      id,
      mac: host.mac,
      ips: [...host.ips].sort(),
      name: match ? inventoryName(match) : null,
      vendor: match?.vendor || null,
      role: isGateway ? "gateway" : "device",
      isKnown: match !== null,
      packetsSent: host.packetsSent,
      packetsReceived: host.packetsReceived,
      bytesSent: host.bytesSent,
      bytesReceived: host.bytesReceived,
      firstSeen: toIso(host.firstTsMs),
      lastSeen: toIso(host.lastTsMs),
      categories: [],
      externalPeerCount: host.externalPeers.size,
      dnsQueryCount: host.dnsQueryCount,
      notes: match?.notes || null,
    });
  }

  // --- External endpoints ---------------------------------------------------
  const externalSorted = [...extract.externalIps.values()].sort((a, b) => b.bytes - a.bytes);
  const externalIdByIp = new Map<string, string>();
  const externalEndpoints: ExternalEndpoint[] = [];
  let extSeq = 0;

  for (const ext of externalSorted.slice(0, MAX_OUTPUT_EXTERNAL_ENDPOINTS)) {
    const id = `ext-${++extSeq}`;
    externalIdByIp.set(ext.ip, id);
    externalEndpoints.push({
      id,
      ip: ext.ip,
      isAggregate: false,
      packets: ext.packets,
      bytes: ext.bytes,
      categories: [],
    });
  }

  const overflowExternal = externalSorted.slice(MAX_OUTPUT_EXTERNAL_ENDPOINTS);
  const droppedExternalCount = overflowExternal.length + extract.droppedExternalIps;
  if (droppedExternalCount > 0) {
    const aggregate: ExternalEndpoint = {
      id: "ext-other",
      ip: `(+${droppedExternalCount} more endpoints)`,
      isAggregate: true,
      packets: overflowExternal.reduce((sum, e) => sum + e.packets, 0),
      bytes: overflowExternal.reduce((sum, e) => sum + e.bytes, 0),
      categories: [],
    };
    externalEndpoints.push(aggregate);
    for (const ext of overflowExternal) externalIdByIp.set(ext.ip, "ext-other");
  }

  // --- Flows ----------------------------------------------------------------
  const flowAggs = [...extract.flows.values()].sort((a, b) => b.bytes - a.bytes);
  const flows: TrafficFlow[] = [];
  const flowAggByFlowId = new Map<string, FlowAggregate>();
  const deviceCategories = new Map<string, Set<ServiceCategory>>();
  const externalCategories = new Map<string, Set<ServiceCategory>>();
  let flowSeq = 0;
  let hasBroadcastFlows = false;

  for (const agg of flowAggs) {
    if (flows.length >= MAX_OUTPUT_FLOWS) break;

    const fromId = resolveNodeId(agg, "src", deviceIdByMac, externalIdByIp);
    const toId = agg.dstBroadcast
      ? BROADCAST_NODE_ID
      : resolveNodeId(agg, "dst", deviceIdByMac, externalIdByIp);
    if (!fromId || !toId) continue; // endpoint fell off a tracking cap

    const { category, servicePort } = classifyService(agg.protocol, agg.srcPort, agg.dstPort);
    const scope = agg.dstBroadcast
      ? "broadcast"
      : agg.srcLocal && agg.dstLocal
        ? "internal"
        : "external";
    if (scope === "broadcast") hasBroadcastFlows = true;

    const id = `flow-${++flowSeq}`;
    flowAggByFlowId.set(id, agg);
    flows.push({
      id,
      fromId,
      toId,
      protocol: agg.protocol,
      port: servicePort,
      category,
      packets: agg.packets,
      bytes: agg.bytes,
      bytesFromInitiator: agg.bytesFromSrc,
      firstSeen: toIso(agg.firstTsMs),
      lastSeen: toIso(agg.lastTsMs),
      scope,
    });

    for (const nodeId of [fromId, toId]) {
      if (nodeId === BROADCAST_NODE_ID) continue;
      const target = nodeId.startsWith("ext") ? externalCategories : deviceCategories;
      let set = target.get(nodeId);
      if (!set) target.set(nodeId, (set = new Set()));
      set.add(category);
    }
  }

  for (const device of devices) {
    device.categories = [...(deviceCategories.get(device.id) ?? [])];
  }
  for (const ext of externalEndpoints) {
    ext.categories = [...(externalCategories.get(ext.id) ?? [])];
  }

  if (hasBroadcastFlows) {
    devices.push({
      id: BROADCAST_NODE_ID,
      mac: null,
      ips: [],
      name: "Everyone (broadcast)",
      vendor: null,
      role: "broadcast",
      isKnown: true,
      packetsSent: 0,
      packetsReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      firstSeen: null,
      lastSeen: null,
      categories: [],
      externalPeerCount: 0,
      dnsQueryCount: 0,
      notes: null,
    });
  }

  // --- DNS queries ------------------------------------------------------------
  const dnsQueries: DnsQueryInfo[] = [...extract.dnsQueries.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_OUTPUT_DNS_QUERIES)
    .map((d) => ({ name: d.name, count: d.count, kind: d.kind }));
  const totalDnsQueryCount = [...extract.dnsQueries.values()].reduce((s, d) => s + d.count, 0);
  const uniqueDnsNames = extract.dnsQueries.size + extract.droppedDnsNames;

  // --- Animation events ---------------------------------------------------------
  const animationEvents = buildAnimationEvents(flows, flowAggByFlowId, extract);

  // --- Meta, alerts, summary ------------------------------------------------------
  const durationMs =
    extract.firstTsMs !== null && extract.lastTsMs !== null
      ? Math.max(0, extract.lastTsMs - extract.firstTsMs)
      : null;

  const meta = {
    fileName: options.fileName,
    format: options.format ?? extract.format,
    packetCount: extract.packetCount,
    byteCount: extract.byteCount,
    startTime: toIso(extract.firstTsMs),
    endTime: toIso(extract.lastTsMs),
    durationMs,
    truncated: extract.truncated || extract.droppedFlows > 0,
    ignoredPackets: extract.ignoredPackets,
    generatedAt: new Date().toISOString(),
  };

  const alerts = evaluateTrafficWatchItems({
    devices,
    flows,
    uniqueDnsNames,
    inventoryProvided: inventory !== null,
  });

  const summary = buildTrafficSummary({
    meta,
    devices,
    flows,
    externalEndpointCount: extract.externalIps.size + extract.droppedExternalIps,
    dnsQueryCount: totalDnsQueryCount,
    uniqueDnsNames,
    alerts,
    inventoryProvided: inventory !== null,
  });

  return {
    version: 1,
    meta,
    devices,
    externalEndpoints,
    flows,
    animationEvents,
    dnsQueries,
    summary,
    alerts,
  };
}

// ---------------------------------------------------------------------------

function toIso(tsMs: number | null): string | null {
  if (tsMs === null || !Number.isFinite(tsMs)) return null;
  try {
    return new Date(tsMs).toISOString();
  } catch {
    return null;
  }
}

function pickGatewayMac(extract: CaptureExtract): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [mac, votes] of extract.gatewayVotes) {
    if (votes.size > bestCount && extract.hosts.has(mac)) {
      best = mac;
      bestCount = votes.size;
    }
  }
  return bestCount > 0 ? best : null;
}

function matchInventory(host: HostAggregate, inventory: InventoryDevice[]): InventoryDevice | null {
  const hostMac = host.mac.toUpperCase();
  for (const item of inventory) {
    if (item.mac && item.mac.toUpperCase() === hostMac) return item;
  }
  for (const item of inventory) {
    if (item.ip && host.ips.has(item.ip)) return item;
  }
  return null;
}

function inventoryName(item: InventoryDevice): string | null {
  const name = item.device?.trim() || item.hostnames?.split(/[,;\s]+/)[0]?.trim() || "";
  return name || null;
}

function resolveNodeId(
  agg: FlowAggregate,
  side: "src" | "dst",
  deviceIdByMac: Map<string, string>,
  externalIdByIp: Map<string, string>
): string | null {
  const local = side === "src" ? agg.srcLocal : agg.dstLocal;
  const mac = side === "src" ? agg.srcMac : agg.dstMac;
  const ip = side === "src" ? agg.srcIp : agg.dstIp;
  if (local) return deviceIdByMac.get(mac) ?? null;
  return ip ? (externalIdByIp.get(ip) ?? null) : null;
}

function buildAnimationEvents(
  flows: TrafficFlow[],
  flowAggByFlowId: Map<string, FlowAggregate>,
  extract: CaptureExtract
): AnimationEvent[] {
  const start = extract.firstTsMs;
  const duration =
    start !== null && extract.lastTsMs !== null ? Math.max(1, extract.lastTsMs - start) : null;

  const animated = [...flows].sort((a, b) => b.packets - a.packets).slice(0, MAX_ANIMATED_FLOWS);
  const events: AnimationEvent[] = [];

  for (const flow of animated) {
    if (events.length >= MAX_ANIMATION_EVENTS) break;
    const agg = flowAggByFlowId.get(flow.id);
    const count = 1 + Math.min(7, Math.floor(Math.log2(Math.max(1, flow.packets))));
    const avgPacketBytes = flow.bytes / Math.max(1, flow.packets);
    const size: 1 | 2 | 3 = avgPacketBytes < 200 ? 1 : avgPacketBytes < 800 ? 2 : 3;

    const flowStart = normalizeT(agg?.firstTsMs ?? null, start, duration, 0.1);
    const flowEnd = normalizeT(agg?.lastTsMs ?? null, start, duration, 0.9);

    for (let i = 0; i < count && events.length < MAX_ANIMATION_EVENTS; i++) {
      const frac = count === 1 ? 0.5 : i / (count - 1);
      events.push({
        t: flowStart + (flowEnd - flowStart) * frac,
        flowId: flow.id,
        fromId: flow.fromId,
        toId: flow.toId,
        category: flow.category,
        size,
      });
    }
  }

  return events.sort((a, b) => a.t - b.t);
}

function normalizeT(
  tsMs: number | null,
  start: number | null,
  duration: number | null,
  fallback: number
): number {
  if (tsMs === null || start === null || duration === null) return fallback;
  return Math.min(1, Math.max(0, (tsMs - start) / duration));
}
