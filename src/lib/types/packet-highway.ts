/**
 * Traffic Visualizer (Packet Highway) types
 *
 * The normalized capture model is METADATA ONLY: timestamps, addresses,
 * ports, protocols, counts, and DNS/mDNS query names. Packet payload
 * content is never extracted, stored, or shipped to the client.
 */

export type TrafficProtocol = "tcp" | "udp" | "icmp" | "arp" | "other";

export type ServiceCategory =
  | "dns"
  | "mdns"
  | "llmnr"
  | "ssdp"
  | "http"
  | "https"
  | "quic"
  | "ssh"
  | "smb"
  | "rdp"
  | "arp"
  | "icmp"
  | "other";

export type CaptureFormat = "pcap" | "pcapng" | "fixture";

export interface CaptureMeta {
  /** Original file name (basename only, never a filesystem path) */
  fileName: string;
  format: CaptureFormat;
  packetCount: number;
  byteCount: number;
  startTime: string | null;
  endTime: string | null;
  durationMs: number | null;
  /** True when parsing stopped early (packet/flow caps reached) */
  truncated: boolean;
  /** Packets skipped because they were not parseable Ethernet/IP frames */
  ignoredPackets: number;
  generatedAt: string;
}

export type DeviceRole = "gateway" | "device" | "broadcast";

export interface TrafficDevice {
  id: string;
  mac: string | null;
  ips: string[];
  /** Friendly name from inventory, or null when unidentified */
  name: string | null;
  vendor: string | null;
  role: DeviceRole;
  /** True when matched against an uploaded device inventory */
  isKnown: boolean;
  packetsSent: number;
  packetsReceived: number;
  bytesSent: number;
  bytesReceived: number;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Service categories this device participated in */
  categories: ServiceCategory[];
  /** Distinct external IPs this device exchanged traffic with */
  externalPeerCount: number;
  dnsQueryCount: number;
  notes: string | null;
}

export interface ExternalEndpoint {
  id: string;
  ip: string;
  /** True when this entry aggregates many low-volume endpoints */
  isAggregate: boolean;
  packets: number;
  bytes: number;
  categories: ServiceCategory[];
}

export type FlowScope = "internal" | "external" | "broadcast";

export interface TrafficFlow {
  id: string;
  /** Node id (device, external endpoint, or "broadcast") of first-seen sender */
  fromId: string;
  toId: string;
  protocol: TrafficProtocol;
  /** Well-known service port when one side matched, otherwise null */
  port: number | null;
  category: ServiceCategory;
  packets: number;
  bytes: number;
  /** Bytes sent in the fromId -> toId direction */
  bytesFromInitiator: number;
  firstSeen: string | null;
  lastSeen: string | null;
  scope: FlowScope;
}

export interface AnimationEvent {
  /** Normalized position in the capture timeline, 0..1 */
  t: number;
  flowId: string;
  fromId: string;
  toId: string;
  category: ServiceCategory;
  /** Vehicle size class: 1 small, 2 medium, 3 large */
  size: 1 | 2 | 3;
}

export type DnsKind = "dns" | "mdns" | "llmnr";

export interface DnsQueryInfo {
  name: string;
  count: number;
  kind: DnsKind;
}

export interface TrafficSummary {
  headline: string;
  lines: string[];
  stats: {
    deviceCount: number;
    knownDeviceCount: number;
    externalEndpointCount: number;
    flowCount: number;
    dnsQueryCount: number;
    uniqueDnsNames: number;
    categoryBytes: Partial<Record<ServiceCategory, number>>;
  };
}

/**
 * Calm, non-alarmist severity levels.
 * "watch" = look at this, "review" = worth reviewing, "info" = FYI.
 */
export type WatchLevel = "info" | "review" | "watch";

export interface TrafficAlert {
  id: string;
  ruleId: string;
  level: WatchLevel;
  title: string;
  detail: string;
  deviceIds: string[];
  flowIds: string[];
}

export interface NormalizedCapture {
  version: 1;
  meta: CaptureMeta;
  devices: TrafficDevice[];
  externalEndpoints: ExternalEndpoint[];
  flows: TrafficFlow[];
  animationEvents: AnimationEvent[];
  dnsQueries: DnsQueryInfo[];
  summary: TrafficSummary;
  alerts: TrafficAlert[];
}

export interface TrafficAnalyzeResponse {
  success: boolean;
  data?: NormalizedCapture;
  error?: string;
}

/** Node id used for broadcast/multicast traffic in flows and animation */
export const BROADCAST_NODE_ID = "broadcast";
