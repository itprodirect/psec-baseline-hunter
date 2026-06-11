/**
 * Upload guards and fixture validation for the Traffic Visualizer.
 *
 * Mirrors inventory-csv-safety.ts: limit errors are typed so API routes can
 * pass their messages to the client safely (no paths, no internals).
 */

import {
  AnimationEvent,
  CaptureMeta,
  DnsQueryInfo,
  ExternalEndpoint,
  NormalizedCapture,
  ServiceCategory,
  TrafficAlert,
  TrafficDevice,
  TrafficFlow,
  TrafficProtocol,
  TrafficSummary,
  WatchLevel,
} from "@/lib/types/packet-highway";

export const MAX_CAPTURE_BYTES = 50 * 1024 * 1024; // 50 MiB raw capture
export const MAX_FIXTURE_BYTES = 10 * 1024 * 1024; // 10 MiB normalized JSON
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export const CAPTURE_UPLOAD_ACCEPT = ".pcap,.pcapng,.json";

export class TrafficUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrafficUploadError";
  }
}

export function isTrafficUploadError(error: unknown): error is TrafficUploadError {
  return (
    error instanceof TrafficUploadError ||
    (error instanceof Error && error.name === "TrafficUploadError")
  );
}

export type CaptureUploadKind = "capture" | "fixture";

/** Validate the uploaded file's extension; returns which pipeline to use. */
export function getCaptureUploadKind(fileName: string): CaptureUploadKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pcap") || lower.endsWith(".pcapng")) return "capture";
  if (lower.endsWith(".json")) return "fixture";
  throw new TrafficUploadError(
    "Unsupported file type. Upload a .pcap or .pcapng capture, or a .json analysis exported by this tool."
  );
}

export function assertCaptureUploadSize(size: number, kind: CaptureUploadKind): void {
  const maxBytes = kind === "capture" ? MAX_CAPTURE_BYTES : MAX_FIXTURE_BYTES;
  if (!Number.isFinite(size) || size < 0) {
    throw new TrafficUploadError("Upload size is invalid.");
  }
  if (size > maxBytes) {
    throw new TrafficUploadError(
      `File is too large. Maximum size is ${maxBytes / (1024 * 1024)} MB for ${
        kind === "capture" ? "captures" : "analysis JSON"
      } in this version.`
    );
  }
  if (size === 0) {
    throw new TrafficUploadError("The uploaded file is empty.");
  }
}

/** Reject oversized requests before multipart parsing buffers them. */
export function assertCaptureRequestContentLength(contentLength: string | null): void {
  if (contentLength === null) return;
  const trimmed = contentLength.trim();
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(Number(trimmed))) {
    throw new TrafficUploadError("Upload request size is invalid.");
  }
  const maxRequest = MAX_CAPTURE_BYTES + MULTIPART_OVERHEAD_BYTES * 2 + 1024 * 1024; // capture + csv + parts
  if (Number(trimmed) > maxRequest) {
    throw new TrafficUploadError(
      `Upload request is too large. Maximum capture size is ${MAX_CAPTURE_BYTES / (1024 * 1024)} MB in this version.`
    );
  }
}

/** Keep only a safe display basename — never trust client-provided paths. */
export function sanitizeUploadFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "capture";
  const cleaned = base.replace(/[^\w.\- ()]/g, "_").slice(0, 80);
  return cleaned || "capture";
}

// ---------------------------------------------------------------------------
// Normalized fixture validation (the .json upload path / demo reload path).
// Every field is whitelisted and re-built so unknown or oversized content
// never reaches the UI.
// ---------------------------------------------------------------------------

const FIXTURE_LIMITS = {
  devices: 600,
  externalEndpoints: 300,
  flows: 1000,
  animationEvents: 1000,
  dnsQueries: 500,
  alerts: 60,
  summaryLines: 30,
  ipsPerDevice: 16,
  categoriesPerNode: 16,
};

const SERVICE_CATEGORY_SET = new Set<ServiceCategory>([
  "dns", "mdns", "llmnr", "ssdp", "http", "https", "quic", "ssh", "smb", "rdp", "arp", "icmp", "other",
]);
const PROTOCOL_SET = new Set<TrafficProtocol>(["tcp", "udp", "icmp", "arp", "other"]);
const LEVEL_SET = new Set<WatchLevel>(["info", "review", "watch"]);

export function parseNormalizedCaptureFixture(jsonText: string): NormalizedCapture {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new TrafficUploadError("This file isn't valid JSON.");
  }
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.meta)) {
    throw new TrafficUploadError(
      "This JSON doesn't look like a Traffic Visualizer analysis export."
    );
  }

  const meta = sanitizeMeta(raw.meta);
  const devices = takeArray(raw.devices, FIXTURE_LIMITS.devices).map(sanitizeDevice);
  const externalEndpoints = takeArray(raw.externalEndpoints, FIXTURE_LIMITS.externalEndpoints).map(
    sanitizeExternalEndpoint
  );
  const flows = takeArray(raw.flows, FIXTURE_LIMITS.flows).map(sanitizeFlow);
  const animationEvents = takeArray(raw.animationEvents, FIXTURE_LIMITS.animationEvents).map(
    sanitizeAnimationEvent
  );
  const dnsQueries = takeArray(raw.dnsQueries, FIXTURE_LIMITS.dnsQueries).map(sanitizeDnsQuery);
  const alerts = takeArray(raw.alerts, FIXTURE_LIMITS.alerts).map(sanitizeAlert);
  const summary = sanitizeSummary(raw.summary);

  if (devices.length === 0 && flows.length === 0) {
    throw new TrafficUploadError("This analysis file contains no devices or flows.");
  }

  return {
    version: 1,
    meta: { ...meta, format: "fixture" },
    devices,
    externalEndpoints,
    flows,
    animationEvents,
    dnsQueries,
    summary,
    alerts,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function takeArray(value: unknown, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).slice(0, max);
}

function str(value: unknown, maxLength: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.slice(0, maxLength);
}

function strOrNull(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, maxLength) : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function category(value: unknown): ServiceCategory {
  return SERVICE_CATEGORY_SET.has(value as ServiceCategory) ? (value as ServiceCategory) : "other";
}

function categories(value: unknown): ServiceCategory[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, FIXTURE_LIMITS.categoriesPerNode).map(category);
}

function sanitizeMeta(raw: Record<string, unknown>): CaptureMeta {
  return {
    fileName: sanitizeUploadFileName(str(raw.fileName, 120, "analysis.json")),
    format: "fixture",
    packetCount: num(raw.packetCount),
    byteCount: num(raw.byteCount),
    startTime: isoOrNull(raw.startTime),
    endTime: isoOrNull(raw.endTime),
    durationMs: typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs) && raw.durationMs >= 0 ? raw.durationMs : null,
    truncated: raw.truncated === true,
    ignoredPackets: num(raw.ignoredPackets),
    generatedAt: isoOrNull(raw.generatedAt) ?? new Date().toISOString(),
  };
}

function sanitizeDevice(raw: Record<string, unknown>): TrafficDevice {
  const role = raw.role === "gateway" || raw.role === "broadcast" ? raw.role : "device";
  return {
    id: str(raw.id, 40, "dev-unknown"),
    mac: strOrNull(raw.mac, 23),
    ips: Array.isArray(raw.ips)
      ? raw.ips.filter((ip): ip is string => typeof ip === "string").slice(0, FIXTURE_LIMITS.ipsPerDevice).map((ip) => ip.slice(0, 45))
      : [],
    name: strOrNull(raw.name, 80),
    vendor: strOrNull(raw.vendor, 80),
    role,
    isKnown: raw.isKnown === true,
    packetsSent: num(raw.packetsSent),
    packetsReceived: num(raw.packetsReceived),
    bytesSent: num(raw.bytesSent),
    bytesReceived: num(raw.bytesReceived),
    firstSeen: isoOrNull(raw.firstSeen),
    lastSeen: isoOrNull(raw.lastSeen),
    categories: categories(raw.categories),
    externalPeerCount: num(raw.externalPeerCount),
    dnsQueryCount: num(raw.dnsQueryCount),
    notes: strOrNull(raw.notes, 500),
  };
}

function sanitizeExternalEndpoint(raw: Record<string, unknown>): ExternalEndpoint {
  return {
    id: str(raw.id, 40, "ext-unknown"),
    ip: str(raw.ip, 60, "unknown"),
    isAggregate: raw.isAggregate === true,
    packets: num(raw.packets),
    bytes: num(raw.bytes),
    categories: categories(raw.categories),
  };
}

function sanitizeFlow(raw: Record<string, unknown>): TrafficFlow {
  const scope =
    raw.scope === "internal" || raw.scope === "broadcast" ? raw.scope : "external";
  return {
    id: str(raw.id, 40, "flow-unknown"),
    fromId: str(raw.fromId, 40),
    toId: str(raw.toId, 40),
    protocol: PROTOCOL_SET.has(raw.protocol as TrafficProtocol)
      ? (raw.protocol as TrafficProtocol)
      : "other",
    port:
      typeof raw.port === "number" && Number.isInteger(raw.port) && raw.port >= 0 && raw.port <= 65535
        ? raw.port
        : null,
    category: category(raw.category),
    packets: num(raw.packets),
    bytes: num(raw.bytes),
    bytesFromInitiator: num(raw.bytesFromInitiator),
    firstSeen: isoOrNull(raw.firstSeen),
    lastSeen: isoOrNull(raw.lastSeen),
    scope,
  };
}

function sanitizeAnimationEvent(raw: Record<string, unknown>): AnimationEvent {
  const t = typeof raw.t === "number" && Number.isFinite(raw.t) ? Math.min(1, Math.max(0, raw.t)) : 0;
  const size = raw.size === 2 ? 2 : raw.size === 3 ? 3 : 1;
  return {
    t,
    flowId: str(raw.flowId, 40),
    fromId: str(raw.fromId, 40),
    toId: str(raw.toId, 40),
    category: category(raw.category),
    size,
  };
}

function sanitizeDnsQuery(raw: Record<string, unknown>): DnsQueryInfo {
  return {
    name: str(raw.name, 260, "(invalid name)"),
    count: num(raw.count, 1),
    kind: raw.kind === "mdns" || raw.kind === "llmnr" ? raw.kind : "dns",
  };
}

function sanitizeAlert(raw: Record<string, unknown>): TrafficAlert {
  return {
    id: str(raw.id, 40, "alert-unknown"),
    ruleId: str(raw.ruleId, 60, "unknown"),
    level: LEVEL_SET.has(raw.level as WatchLevel) ? (raw.level as WatchLevel) : "info",
    title: str(raw.title, 160, "Watch item"),
    detail: str(raw.detail, 800),
    deviceIds: Array.isArray(raw.deviceIds)
      ? raw.deviceIds.filter((id): id is string => typeof id === "string").slice(0, 50).map((id) => id.slice(0, 40))
      : [],
    flowIds: Array.isArray(raw.flowIds)
      ? raw.flowIds.filter((id): id is string => typeof id === "string").slice(0, 50).map((id) => id.slice(0, 40))
      : [],
  };
}

function sanitizeSummary(raw: unknown): TrafficSummary {
  const record = isRecord(raw) ? raw : {};
  const stats = isRecord(record.stats) ? record.stats : {};
  const categoryBytes: Partial<Record<ServiceCategory, number>> = {};
  if (isRecord(stats.categoryBytes)) {
    for (const [key, value] of Object.entries(stats.categoryBytes)) {
      if (SERVICE_CATEGORY_SET.has(key as ServiceCategory)) {
        categoryBytes[key as ServiceCategory] = num(value);
      }
    }
  }
  return {
    headline: str(record.headline, 240, "Traffic analysis loaded from file."),
    lines: Array.isArray(record.lines)
      ? record.lines
          .filter((line): line is string => typeof line === "string")
          .slice(0, FIXTURE_LIMITS.summaryLines)
          .map((line) => line.slice(0, 500))
      : [],
    stats: {
      deviceCount: num(stats.deviceCount),
      knownDeviceCount: num(stats.knownDeviceCount),
      externalEndpointCount: num(stats.externalEndpointCount),
      flowCount: num(stats.flowCount),
      dnsQueryCount: num(stats.dnsQueryCount),
      uniqueDnsNames: num(stats.uniqueDnsNames),
      categoryBytes,
    },
  };
}
