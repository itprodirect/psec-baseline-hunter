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
const MAX_INFERRED_FIXTURE_LOSS_COUNT = 1_000_000;

interface FixtureLossTracker {
  count: number;
}

const SERVICE_CATEGORY_SET = new Set<ServiceCategory>([
  "dns", "mdns", "llmnr", "ssdp", "http", "https", "quic", "ssh", "smb", "rdp", "arp", "icmp", "other",
]);
const PROTOCOL_SET = new Set<TrafficProtocol>(["tcp", "udp", "icmp", "arp", "other"]);
const LEVEL_SET = new Set<WatchLevel>(["info", "review", "watch"]);
const CAPTURE_FORMAT_SET = new Set(["pcap", "pcapng", "fixture"]);

const FIXTURE_FIELDS = new Set([
  "version", "meta", "devices", "externalEndpoints", "flows",
  "animationEvents", "dnsQueries", "summary", "alerts",
]);
const META_FIELDS = new Set([
  "fileName", "format", "packetCount", "byteCount", "startTime", "endTime",
  "durationMs", "truncated", "ignoredPackets", "fixtureSanitizationLoss", "generatedAt",
]);
const FIXTURE_LOSS_FIELDS = new Set(["count"]);
const DEVICE_FIELDS = new Set([
  "id", "mac", "ips", "name", "vendor", "role", "isKnown", "packetsSent",
  "packetsReceived", "bytesSent", "bytesReceived", "firstSeen", "lastSeen",
  "categories", "externalPeerCount", "dnsQueryCount", "notes",
]);
const EXTERNAL_ENDPOINT_FIELDS = new Set([
  "id", "ip", "isAggregate", "packets", "bytes", "categories",
]);
const FLOW_FIELDS = new Set([
  "id", "fromId", "toId", "protocol", "port", "category", "packets", "bytes",
  "bytesFromInitiator", "firstSeen", "lastSeen", "scope",
]);
const ANIMATION_EVENT_FIELDS = new Set([
  "t", "flowId", "fromId", "toId", "category", "size",
]);
const DNS_QUERY_FIELDS = new Set(["name", "count", "kind"]);
const ALERT_FIELDS = new Set([
  "id", "ruleId", "level", "title", "detail", "deviceIds", "flowIds",
]);
const SUMMARY_FIELDS = new Set(["headline", "lines", "stats"]);
const SUMMARY_STATS_FIELDS = new Set([
  "deviceCount", "knownDeviceCount", "externalEndpointCount", "flowCount",
  "dnsQueryCount", "uniqueDnsNames", "categoryBytes",
]);

export function parseNormalizedCaptureFixture(
  jsonText: string,
  options: { dropInvalidFlows?: boolean } = {}
): NormalizedCapture {
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

  const loss: FixtureLossTracker = { count: 0 };
  recordUnknownFields(raw, FIXTURE_FIELDS, loss);
  const meta = sanitizeMeta(raw.meta, loss);
  const devices = takeArray(raw.devices, FIXTURE_LIMITS.devices, loss).map((device) =>
    sanitizeDevice(device, loss)
  );
  const externalEndpoints = takeArray(
    raw.externalEndpoints,
    FIXTURE_LIMITS.externalEndpoints,
    loss
  ).map((endpoint) =>
    sanitizeExternalEndpoint(endpoint, loss)
  );
  const flows = takeArray(raw.flows, FIXTURE_LIMITS.flows, loss)
    .map((flow) => sanitizeFlow(flow, loss, options.dropInvalidFlows === true))
    .filter((flow): flow is TrafficFlow => flow !== null);
  const animationEvents = takeArray(
    raw.animationEvents,
    FIXTURE_LIMITS.animationEvents,
    loss
  ).map((event) => sanitizeAnimationEvent(event, loss));
  const dnsQueries = takeArray(raw.dnsQueries, FIXTURE_LIMITS.dnsQueries, loss).map(
    (query) => sanitizeDnsQuery(query, loss)
  );
  const alerts = takeArray(raw.alerts, FIXTURE_LIMITS.alerts, loss).map((alert) =>
    sanitizeAlert(alert, loss)
  );
  const summary = sanitizeSummary(raw.summary, loss);

  if (devices.length === 0 && flows.length === 0) {
    throw new TrafficUploadError("This analysis file contains no devices or flows.");
  }

  return {
    version: 1,
    meta: {
      ...meta,
      format: "fixture",
      fixtureSanitizationLoss: {
        count: addFixtureSanitizationLoss(meta.fixtureSanitizationLoss.count, loss.count),
      },
    },
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

function takeArray(
  value: unknown,
  max: number,
  loss: FixtureLossTracker
): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    recordFixtureLoss(loss, 1);
    return [];
  }

  const records = value.filter(isRecord);
  const retained = records.slice(0, max);
  recordFixtureLoss(loss, value.length - retained.length);
  return retained;
}

function takeStrings(
  value: unknown,
  max: number,
  loss: FixtureLossTracker
): string[] {
  if (!Array.isArray(value)) {
    recordFixtureLoss(loss, 1);
    return [];
  }

  const strings = value.filter((item): item is string => typeof item === "string");
  const retained = strings.slice(0, max);
  recordFixtureLoss(loss, value.length - retained.length);
  return retained;
}

function recordFixtureLoss(loss: FixtureLossTracker, count: number): void {
  if (!Number.isFinite(count) || count <= 0) return;
  loss.count = Math.min(
    MAX_INFERRED_FIXTURE_LOSS_COUNT,
    loss.count + Math.floor(count)
  );
}

function recordUnknownFields(
  raw: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  loss: FixtureLossTracker
): void {
  recordFixtureLoss(
    loss,
    Object.keys(raw).filter((key) => !allowed.has(key)).length
  );
}

function addFixtureSanitizationLoss(existing: number, inferred: number): number {
  const base = Math.min(
    MAX_INFERRED_FIXTURE_LOSS_COUNT,
    Math.max(0, Math.floor(existing))
  );
  return Math.min(MAX_INFERRED_FIXTURE_LOSS_COUNT, base + inferred);
}

function str(
  value: unknown,
  maxLength: number,
  loss: FixtureLossTracker,
  fallback = ""
): string {
  if (typeof value !== "string") {
    recordFixtureLoss(loss, 1);
    return fallback;
  }
  if (value.length > maxLength) recordFixtureLoss(loss, 1);
  return value.slice(0, maxLength);
}

function strOrNull(
  value: unknown,
  maxLength: number,
  loss: FixtureLossTracker
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    recordFixtureLoss(loss, 1);
    return null;
  }
  if (value.length > maxLength) recordFixtureLoss(loss, 1);
  return value.slice(0, maxLength);
}

function num(
  value: unknown,
  loss: FixtureLossTracker,
  fallback = 0
): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  recordFixtureLoss(loss, 1);
  return fallback;
}

function bool(value: unknown, loss: FixtureLossTracker): boolean {
  if (typeof value === "boolean") return value;
  recordFixtureLoss(loss, 1);
  return false;
}

function isoOrNull(value: unknown, loss: FixtureLossTracker): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    recordFixtureLoss(loss, 1);
    return null;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    recordFixtureLoss(loss, 1);
    return null;
  }
  return new Date(time).toISOString();
}

function generatedAt(value: unknown, loss: FixtureLossTracker): string {
  if (typeof value === "string") {
    const time = Date.parse(value);
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }
  recordFixtureLoss(loss, 1);
  return new Date().toISOString();
}

function category(value: unknown, loss: FixtureLossTracker): ServiceCategory {
  if (SERVICE_CATEGORY_SET.has(value as ServiceCategory)) {
    return value as ServiceCategory;
  }
  recordFixtureLoss(loss, 1);
  return "other";
}

function sanitizeFixtureFileName(
  value: unknown,
  loss: FixtureLossTracker
): string {
  if (typeof value !== "string") {
    recordFixtureLoss(loss, 1);
    return "analysis.json";
  }
  const sanitized = sanitizeUploadFileName(value.slice(0, 120));
  if (sanitized !== value) recordFixtureLoss(loss, 1);
  return sanitized;
}

function takeBoundedStrings(
  value: unknown,
  maxItems: number,
  maxLength: number,
  loss: FixtureLossTracker
): string[] {
  return takeStrings(value, maxItems, loss).map((item) => {
    if (item.length > maxLength) recordFixtureLoss(loss, 1);
    return item.slice(0, maxLength);
  });
}

function categories(value: unknown, loss: FixtureLossTracker): ServiceCategory[] {
  if (!Array.isArray(value)) {
    recordFixtureLoss(loss, 1);
    return [];
  }

  const retained = value.slice(0, FIXTURE_LIMITS.categoriesPerNode);
  recordFixtureLoss(loss, value.length - retained.length);
  return retained.map((item) => {
    return category(item, loss);
  });
}

function sanitizeMeta(
  raw: Record<string, unknown>,
  loss: FixtureLossTracker
): CaptureMeta {
  recordUnknownFields(raw, META_FIELDS, loss);
  if (!CAPTURE_FORMAT_SET.has(raw.format as string)) {
    recordFixtureLoss(loss, 1);
  }
  const durationMs = raw.durationMs === undefined || raw.durationMs === null
    ? null
    : num(raw.durationMs, loss, Number.NaN);
  return {
    fileName: sanitizeFixtureFileName(raw.fileName, loss),
    format: "fixture",
    packetCount: num(raw.packetCount, loss),
    byteCount: num(raw.byteCount, loss),
    startTime: isoOrNull(raw.startTime, loss),
    endTime: isoOrNull(raw.endTime, loss),
    durationMs: Number.isNaN(durationMs) ? null : durationMs,
    truncated: bool(raw.truncated, loss),
    ignoredPackets: num(raw.ignoredPackets, loss),
    fixtureSanitizationLoss: sanitizeFixtureSanitizationLoss(
      raw.fixtureSanitizationLoss,
      loss
    ),
    generatedAt: generatedAt(raw.generatedAt, loss),
  };
}

function sanitizeFixtureSanitizationLoss(
  value: unknown,
  loss: FixtureLossTracker
): CaptureMeta["fixtureSanitizationLoss"] {
  if (value === undefined) return { count: 0 };
  if (!isRecord(value) ||
      typeof value.count !== "number" ||
      !Number.isInteger(value.count) ||
      value.count < 0) {
    recordFixtureLoss(loss, 1);
    return { count: 0 };
  }
  recordUnknownFields(value, FIXTURE_LOSS_FIELDS, loss);
  if (value.count > MAX_INFERRED_FIXTURE_LOSS_COUNT) {
    recordFixtureLoss(loss, 1);
  }
  return {
    count: Math.min(MAX_INFERRED_FIXTURE_LOSS_COUNT, value.count),
  };
}

function sanitizeDevice(
  raw: Record<string, unknown>,
  loss: FixtureLossTracker
): TrafficDevice {
  recordUnknownFields(raw, DEVICE_FIELDS, loss);
  const validRole = raw.role === "gateway" || raw.role === "device" || raw.role === "broadcast";
  if (!validRole) recordFixtureLoss(loss, 1);
  return {
    id: str(raw.id, 40, loss, "dev-unknown"),
    mac: strOrNull(raw.mac, 23, loss),
    ips: takeBoundedStrings(raw.ips, FIXTURE_LIMITS.ipsPerDevice, 45, loss),
    name: strOrNull(raw.name, 80, loss),
    vendor: strOrNull(raw.vendor, 80, loss),
    role: validRole ? raw.role as TrafficDevice["role"] : "device",
    isKnown: bool(raw.isKnown, loss),
    packetsSent: num(raw.packetsSent, loss),
    packetsReceived: num(raw.packetsReceived, loss),
    bytesSent: num(raw.bytesSent, loss),
    bytesReceived: num(raw.bytesReceived, loss),
    firstSeen: isoOrNull(raw.firstSeen, loss),
    lastSeen: isoOrNull(raw.lastSeen, loss),
    categories: categories(raw.categories, loss),
    externalPeerCount: num(raw.externalPeerCount, loss),
    dnsQueryCount: num(raw.dnsQueryCount, loss),
    notes: strOrNull(raw.notes, 500, loss),
  };
}

function sanitizeExternalEndpoint(
  raw: Record<string, unknown>,
  loss: FixtureLossTracker
): ExternalEndpoint {
  recordUnknownFields(raw, EXTERNAL_ENDPOINT_FIELDS, loss);
  return {
    id: str(raw.id, 40, loss, "ext-unknown"),
    ip: str(raw.ip, 60, loss, "unknown"),
    isAggregate: bool(raw.isAggregate, loss),
    packets: num(raw.packets, loss),
    bytes: num(raw.bytes, loss),
    categories: categories(raw.categories, loss),
  };
}

function sanitizeFlow(
  raw: Record<string, unknown>, loss: FixtureLossTracker, dropInvalid: boolean
): TrafficFlow | null {
  recordUnknownFields(raw, FLOW_FIELDS, loss);
  const validScope = raw.scope === "internal" || raw.scope === "broadcast" || raw.scope === "external";
  const validProtocol = PROTOCOL_SET.has(raw.protocol as TrafficProtocol);
  const validCategory = SERVICE_CATEGORY_SET.has(raw.category as ServiceCategory);
  const validPort = raw.port == null || (typeof raw.port === "number" &&
    Number.isInteger(raw.port) && raw.port >= 0 && raw.port <= 65535);
  const invalid = !validScope || !validProtocol || !validCategory || !validPort;
  if (invalid && dropInvalid) {
    recordFixtureLoss(loss, 1);
    return null;
  }
  if (!validScope) recordFixtureLoss(loss, 1);
  if (!validProtocol) recordFixtureLoss(loss, 1);
  if (!validCategory) recordFixtureLoss(loss, 1);
  if (!validPort) recordFixtureLoss(loss, 1);
  return {
    id: str(raw.id, 40, loss, "flow-unknown"),
    fromId: str(raw.fromId, 40, loss),
    toId: str(raw.toId, 40, loss),
    protocol: validProtocol ? raw.protocol as TrafficProtocol : "other",
    port: validPort && raw.port != null ? raw.port as number : null,
    category: validCategory ? raw.category as ServiceCategory : "other",
    packets: num(raw.packets, loss),
    bytes: num(raw.bytes, loss),
    bytesFromInitiator: num(raw.bytesFromInitiator, loss),
    firstSeen: isoOrNull(raw.firstSeen, loss),
    lastSeen: isoOrNull(raw.lastSeen, loss),
    scope: validScope ? raw.scope as TrafficFlow["scope"] : "external",
  };
}

function sanitizeAnimationEvent(
  raw: Record<string, unknown>,
  loss: FixtureLossTracker
): AnimationEvent {
  recordUnknownFields(raw, ANIMATION_EVENT_FIELDS, loss);
  const validT = typeof raw.t === "number" && Number.isFinite(raw.t);
  const t = validT ? Math.min(1, Math.max(0, raw.t as number)) : 0;
  if (!validT || t !== raw.t) recordFixtureLoss(loss, 1);
  const validSize = raw.size === 1 || raw.size === 2 || raw.size === 3;
  if (!validSize) recordFixtureLoss(loss, 1);
  return {
    t,
    flowId: str(raw.flowId, 40, loss),
    fromId: str(raw.fromId, 40, loss),
    toId: str(raw.toId, 40, loss),
    category: category(raw.category, loss),
    size: validSize ? raw.size as AnimationEvent["size"] : 1,
  };
}

function sanitizeDnsQuery(
  raw: Record<string, unknown>,
  loss: FixtureLossTracker
): DnsQueryInfo {
  recordUnknownFields(raw, DNS_QUERY_FIELDS, loss);
  const validKind = raw.kind === "dns" || raw.kind === "mdns" || raw.kind === "llmnr";
  if (!validKind) recordFixtureLoss(loss, 1);
  return {
    name: str(raw.name, 260, loss, "(invalid name)"),
    count: num(raw.count, loss, 1),
    kind: validKind ? raw.kind as DnsQueryInfo["kind"] : "dns",
  };
}

function sanitizeAlert(
  raw: Record<string, unknown>,
  loss: FixtureLossTracker
): TrafficAlert {
  recordUnknownFields(raw, ALERT_FIELDS, loss);
  const validLevel = LEVEL_SET.has(raw.level as WatchLevel);
  if (!validLevel) recordFixtureLoss(loss, 1);
  return {
    id: str(raw.id, 40, loss, "alert-unknown"),
    ruleId: str(raw.ruleId, 60, loss, "unknown"),
    level: validLevel ? raw.level as WatchLevel : "info",
    title: str(raw.title, 160, loss, "Watch item"),
    detail: str(raw.detail, 800, loss),
    deviceIds: takeBoundedStrings(raw.deviceIds, 50, 40, loss),
    flowIds: takeBoundedStrings(raw.flowIds, 50, 40, loss),
  };
}

function sanitizeSummary(raw: unknown, loss: FixtureLossTracker): TrafficSummary {
  if (!isRecord(raw)) {
    recordFixtureLoss(loss, 1);
    return emptySummary();
  }
  recordUnknownFields(raw, SUMMARY_FIELDS, loss);
  const stats = isRecord(raw.stats) ? raw.stats : null;
  if (!stats) recordFixtureLoss(loss, 1);
  if (stats) recordUnknownFields(stats, SUMMARY_STATS_FIELDS, loss);
  const categoryBytes: Partial<Record<ServiceCategory, number>> = {};
  if (stats && isRecord(stats.categoryBytes)) {
    for (const [key, value] of Object.entries(stats.categoryBytes)) {
      if (SERVICE_CATEGORY_SET.has(key as ServiceCategory)) {
        categoryBytes[key as ServiceCategory] = num(value, loss);
      } else {
        recordFixtureLoss(loss, 1);
      }
    }
  } else if (stats) {
    recordFixtureLoss(loss, 1);
  }
  return {
    headline: str(raw.headline, 240, loss, "Traffic analysis loaded from file."),
    lines: takeBoundedStrings(raw.lines, FIXTURE_LIMITS.summaryLines, 500, loss),
    stats: {
      deviceCount: stats ? num(stats.deviceCount, loss) : 0,
      knownDeviceCount: stats ? num(stats.knownDeviceCount, loss) : 0,
      externalEndpointCount: stats ? num(stats.externalEndpointCount, loss) : 0,
      flowCount: stats ? num(stats.flowCount, loss) : 0,
      dnsQueryCount: stats ? num(stats.dnsQueryCount, loss) : 0,
      uniqueDnsNames: stats ? num(stats.uniqueDnsNames, loss) : 0,
      categoryBytes,
    },
  };
}

function emptySummary(): TrafficSummary {
  return {
    headline: "Traffic analysis loaded from file.",
    lines: [],
    stats: {
      deviceCount: 0,
      knownDeviceCount: 0,
      externalEndpointCount: 0,
      flowCount: 0,
      dnsQueryCount: 0,
      uniqueDnsNames: 0,
      categoryBytes: {},
    },
  };
}
