/**
 * PCAP / PCAPNG metadata parser for the Traffic Visualizer.
 *
 * PRIVACY CONTRACT: this parser extracts metadata ONLY — timestamps, MAC
 * addresses, IPs, ports, protocols, packet/byte counts, and DNS/mDNS/LLMNR
 * query names. It never copies packet payload bytes into its output. The
 * only application-layer bytes read are DNS question names, which are the
 * "address lookup" metadata the feature is designed to explain.
 *
 * Implemented without dependencies against Uint8Array/DataView so it can
 * run in Node route handlers today and in the browser later if V1 moves
 * parsing fully client-side.
 */

import type { DnsKind, TrafficProtocol } from "@/lib/types/packet-highway";

// ---------------------------------------------------------------------------
// Limits (exported for tests). Hitting a cap, or finding a malformed tail
// after valid packets, sets `truncated` rather than failing the whole capture.
// ---------------------------------------------------------------------------
export const MAX_PARSED_PACKETS = 200_000;
export const MAX_TRACKED_FLOWS = 5_000;
export const MAX_TRACKED_HOSTS = 512;
export const MAX_TRACKED_EXTERNAL_IPS = 2_000;
export const MAX_TRACKED_DNS_NAMES = 500;

export class CaptureParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureParseError";
  }
}

export function isCaptureParseError(error: unknown): error is CaptureParseError {
  return (
    error instanceof CaptureParseError ||
    (error instanceof Error && error.name === "CaptureParseError")
  );
}

export interface HostAggregate {
  mac: string;
  ips: Set<string>;
  packetsSent: number;
  packetsReceived: number;
  bytesSent: number;
  bytesReceived: number;
  firstTsMs: number | null;
  lastTsMs: number | null;
  arpPackets: number;
  dnsQueryCount: number;
  externalPeers: Set<string>;
}

export interface FlowAggregate {
  key: string;
  protocol: TrafficProtocol;
  srcMac: string;
  dstMac: string;
  srcIp: string | null;
  dstIp: string | null;
  srcPort: number | null;
  dstPort: number | null;
  srcLocal: boolean;
  dstLocal: boolean;
  dstBroadcast: boolean;
  packets: number;
  bytes: number;
  bytesFromSrc: number;
  firstTsMs: number | null;
  lastTsMs: number | null;
}

export interface ExternalIpAggregate {
  ip: string;
  packets: number;
  bytes: number;
}

export interface DnsAggregate {
  name: string;
  count: number;
  kind: DnsKind;
}

export interface CaptureExtract {
  format: "pcap" | "pcapng";
  packetCount: number;
  byteCount: number;
  firstTsMs: number | null;
  lastTsMs: number | null;
  truncated: boolean;
  ignoredPackets: number;
  ipv6Packets: number;
  arpPackets: number;
  icmpPackets: number;
  hosts: Map<string, HostAggregate>;
  flows: Map<string, FlowAggregate>;
  externalIps: Map<string, ExternalIpAggregate>;
  dnsQueries: Map<string, DnsAggregate>;
  /** MAC -> distinct external IPs it carried at L2 (gateway detection) */
  gatewayVotes: Map<string, Set<string>>;
  droppedFlows: number;
  droppedExternalIps: number;
  droppedDnsNames: number;
}

export function sniffCaptureFormat(bytes: Uint8Array): "pcap" | "pcapng" | null {
  if (bytes.length < 4) return null;
  const [b0, b1, b2, b3] = [bytes[0], bytes[1], bytes[2], bytes[3]];
  // PCAPNG Section Header Block type 0x0A0D0D0A (palindromic across endianness)
  if (b0 === 0x0a && b1 === 0x0d && b2 === 0x0d && b3 === 0x0a) return "pcapng";
  // Classic pcap magics, micro/nano, both byte orders
  const magicLE = (b3 << 24) | (b2 << 16) | (b1 << 8) | b0;
  const magics = [0xa1b2c3d4, 0xd4c3b2a1, 0xa1b23c4d, 0x4d3cb2a1];
  if (magics.includes(magicLE >>> 0)) return "pcap";
  return null;
}

interface ParseLimits {
  maxPackets?: number;
}

export function parseCapture(bytes: Uint8Array, limits: ParseLimits = {}): CaptureExtract {
  const format = sniffCaptureFormat(bytes);
  if (!format) {
    throw new CaptureParseError(
      "This file doesn't look like a PCAP or PCAPNG capture. Try re-saving it from Wireshark."
    );
  }

  const state = createExtract(format);
  const maxPackets = limits.maxPackets ?? MAX_PARSED_PACKETS;
  let parsedEthernetFrames = 0;

  const onPacket = (tsMs: number | null, frame: Uint8Array, origLen: number): boolean => {
    state.packetCount += 1;
    state.byteCount += origLen;
    if (tsMs !== null) {
      if (state.firstTsMs === null || tsMs < state.firstTsMs) state.firstTsMs = tsMs;
      if (state.lastTsMs === null || tsMs > state.lastTsMs) state.lastTsMs = tsMs;
    }
    if (processEthernetFrame(state, tsMs, frame, origLen)) {
      parsedEthernetFrames += 1;
    } else {
      state.ignoredPackets += 1;
    }
    if (state.packetCount >= maxPackets) {
      state.truncated = true;
      return false;
    }
    return true;
  };

  if (format === "pcap") {
    parseClassicPcap(bytes, onPacket, state);
  } else {
    parsePcapng(bytes, onPacket, state);
  }

  if (state.packetCount === 0) {
    throw new CaptureParseError("No packets were found in this capture file.");
  }
  if (parsedEthernetFrames === 0) {
    throw new CaptureParseError(
      "This capture doesn't contain standard Ethernet frames. V0 supports Ethernet captures only (Wi-Fi monitor mode and raw IP captures aren't supported yet)."
    );
  }

  return state;
}

function createExtract(format: "pcap" | "pcapng"): CaptureExtract {
  return {
    format,
    packetCount: 0,
    byteCount: 0,
    firstTsMs: null,
    lastTsMs: null,
    truncated: false,
    ignoredPackets: 0,
    ipv6Packets: 0,
    arpPackets: 0,
    icmpPackets: 0,
    hosts: new Map(),
    flows: new Map(),
    externalIps: new Map(),
    dnsQueries: new Map(),
    gatewayVotes: new Map(),
    droppedFlows: 0,
    droppedExternalIps: 0,
    droppedDnsNames: 0,
  };
}

// ---------------------------------------------------------------------------
// Container formats
// ---------------------------------------------------------------------------

type PacketCallback = (tsMs: number | null, frame: Uint8Array, origLen: number) => boolean;

function parseClassicPcap(
  bytes: Uint8Array,
  onPacket: PacketCallback,
  state: CaptureExtract
): void {
  if (bytes.length < 24) {
    throw new CaptureParseError("This capture file is too short to contain a PCAP header.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magicLE = view.getUint32(0, true);
  let le: boolean;
  let nano: boolean;
  switch (magicLE) {
    case 0xa1b2c3d4: le = true; nano = false; break;
    case 0xa1b23c4d: le = true; nano = true; break;
    case 0xd4c3b2a1: le = false; nano = false; break;
    case 0x4d3cb2a1: le = false; nano = true; break;
    default:
      throw new CaptureParseError("Unrecognized PCAP file header.");
  }

  const linkType = view.getUint32(20, le);
  if (linkType !== 1) {
    throw new CaptureParseError(
      "This capture uses a non-Ethernet link type. V0 supports Ethernet captures only (Wi-Fi monitor mode and raw IP captures aren't supported yet)."
    );
  }

  let offset = 24;
  while (offset + 16 <= bytes.length) {
    const tsSec = view.getUint32(offset, le);
    const tsFrac = view.getUint32(offset + 4, le);
    const inclLen = view.getUint32(offset + 8, le);
    const origLen = view.getUint32(offset + 12, le);
    offset += 16;
    if (inclLen > bytes.length - offset || inclLen > 0x7fffffff) {
      markMalformedPartialParse(state);
      break;
    }
    const frame = bytes.subarray(offset, offset + inclLen);
    offset += inclLen;
    const tsMs = tsSec * 1000 + (nano ? tsFrac / 1e6 : tsFrac / 1e3);
    if (!onPacket(tsMs, frame, origLen || inclLen)) return;
  }
  if (offset < bytes.length) markMalformedPartialParse(state);
}

interface PcapngInterface {
  isEthernet: boolean;
  /** timestamp units per second */
  unitsPerSecond: bigint;
}

const PCAPNG_SECTION_HEADER_BLOCK = 0x0a0d0d0a;
const PCAPNG_INTERFACE_DESCRIPTION_BLOCK = 0x00000001;
const PCAPNG_SIMPLE_PACKET_BLOCK = 0x00000003;
const PCAPNG_ENHANCED_PACKET_BLOCK = 0x00000006;
const PCAPNG_SECTION_HEADER_MIN_LENGTH = 28;
const PCAPNG_INTERFACE_DESCRIPTION_MIN_LENGTH = 20;
const PCAPNG_SIMPLE_PACKET_MIN_LENGTH = 16;
const PCAPNG_ENHANCED_PACKET_MIN_LENGTH = 32;

function parsePcapng(bytes: Uint8Array, onPacket: PacketCallback, state: CaptureExtract): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let le = true;
  let interfaces: PcapngInterface[] = [];
  let offset = 0;
  let sawSection = false;

  while (offset + 12 <= bytes.length) {
    const blockType = view.getUint32(offset, le);

    // Section Header Block: detect endianness from byte-order magic before
    // trusting any length field. 0x1A2B3C4D stored LE is bytes 4D 3C 2B 1A.
    if (
      bytes[offset] === 0x0a &&
      bytes[offset + 1] === 0x0d &&
      bytes[offset + 2] === 0x0d &&
      bytes[offset + 3] === 0x0a
    ) {
      if (offset + 12 > bytes.length) break;
      const m = bytes.subarray(offset + 8, offset + 12);
      if (m[0] === 0x4d && m[1] === 0x3c && m[2] === 0x2b && m[3] === 0x1a) {
        le = true;
      } else if (m[0] === 0x1a && m[1] === 0x2b && m[2] === 0x3c && m[3] === 0x4d) {
        le = false;
      } else {
        markMalformedPartialParse(state);
        break;
      }
      sawSection = true;
      interfaces = []; // interfaces are scoped to their section
      const blockLen = view.getUint32(offset + 4, le);
      if (
        blockLen < PCAPNG_SECTION_HEADER_MIN_LENGTH ||
        blockLen % 4 !== 0 ||
        offset + blockLen > bytes.length
      ) {
        markMalformedPartialParse(state);
        break;
      }
      offset += blockLen;
      continue;
    }

    if (!sawSection) {
      throw new CaptureParseError("This PCAPNG file is missing its section header.");
    }

    const blockLen = view.getUint32(offset + 4, le);
    if (blockLen < 12 || blockLen % 4 !== 0 || offset + blockLen > bytes.length) {
      markMalformedPartialParse(state);
      break;
    }
    const minBlockLen = pcapngKnownBlockMinLength(blockType);
    if (minBlockLen !== null && blockLen < minBlockLen) {
      markMalformedPartialParse(state);
      break;
    }
    const padded = blockLen % 4 === 0 ? blockLen : blockLen + (4 - (blockLen % 4));

    if (blockType === PCAPNG_INTERFACE_DESCRIPTION_BLOCK) {
      // Interface Description Block
      if (blockLen >= 20) {
        const linkType = view.getUint16(offset + 8, le);
        interfaces.push({
          isEthernet: linkType === 1,
          unitsPerSecond: readTsResolution(bytes, view, le, offset, blockLen),
        });
      }
    } else if (blockType === PCAPNG_ENHANCED_PACKET_BLOCK) {
      // Enhanced Packet Block
      if (blockLen >= 32) {
        const ifaceId = view.getUint32(offset + 8, le);
        const tsHigh = view.getUint32(offset + 12, le);
        const tsLow = view.getUint32(offset + 16, le);
        const capLen = view.getUint32(offset + 20, le);
        const origLen = view.getUint32(offset + 24, le);
        const dataStart = offset + 28;
        if (capLen <= blockLen - 32 + 4 && dataStart + capLen <= bytes.length) {
          const iface = interfaces[ifaceId];
          if (iface && !iface.isEthernet) {
            // Count it, but don't parse non-Ethernet frames
            if (!onPacket(timestampToMs(tsHigh, tsLow, iface.unitsPerSecond), EMPTY_FRAME, origLen)) return;
          } else {
            const ups = iface ? iface.unitsPerSecond : DEFAULT_UNITS_PER_SECOND;
            const frame = bytes.subarray(dataStart, dataStart + capLen);
            if (!onPacket(timestampToMs(tsHigh, tsLow, ups), frame, origLen)) return;
          }
        }
      }
    } else if (blockType === PCAPNG_SIMPLE_PACKET_BLOCK) {
      // Simple Packet Block (no timestamp)
      if (blockLen >= 16) {
        const origLen = view.getUint32(offset + 8, le);
        const capLen = Math.min(origLen, blockLen - 16);
        const dataStart = offset + 12;
        if (dataStart + capLen <= bytes.length) {
          const frame = bytes.subarray(dataStart, dataStart + capLen);
          if (!onPacket(null, frame, origLen)) return;
        }
      }
    }
    // All other block types (name resolution, statistics, custom) are skipped.

    offset += padded;
  }

  if (offset < bytes.length) markMalformedPartialParse(state);
}

function markMalformedPartialParse(state: CaptureExtract): void {
  if (state.packetCount > 0) state.truncated = true;
}

function pcapngKnownBlockMinLength(blockType: number): number | null {
  switch (blockType) {
    case PCAPNG_SECTION_HEADER_BLOCK:
      return PCAPNG_SECTION_HEADER_MIN_LENGTH;
    case PCAPNG_INTERFACE_DESCRIPTION_BLOCK:
      return PCAPNG_INTERFACE_DESCRIPTION_MIN_LENGTH;
    case PCAPNG_SIMPLE_PACKET_BLOCK:
      return PCAPNG_SIMPLE_PACKET_MIN_LENGTH;
    case PCAPNG_ENHANCED_PACKET_BLOCK:
      return PCAPNG_ENHANCED_PACKET_MIN_LENGTH;
    default:
      return null;
  }
}

const EMPTY_FRAME = new Uint8Array(0);
const DEFAULT_UNITS_PER_SECOND = 1_000_000n; // pcapng default tsresol = 10^-6

function readTsResolution(
  bytes: Uint8Array,
  view: DataView,
  le: boolean,
  blockOffset: number,
  blockLen: number
): bigint {
  // IDB options start after linktype(2) + reserved(2) + snaplen(4)
  let opt = blockOffset + 16;
  const end = blockOffset + blockLen - 4;
  while (opt + 4 <= end) {
    const code = view.getUint16(opt, le);
    const len = view.getUint16(opt + 2, le);
    if (code === 0) break; // opt_endofopt
    if (code === 9 && len >= 1 && opt + 4 < end) {
      const raw = bytes[opt + 4];
      const value = raw & 0x7f;
      if (value > 30) return DEFAULT_UNITS_PER_SECOND; // implausible, ignore
      return (raw & 0x80) !== 0 ? 1n << BigInt(value) : 10n ** BigInt(value);
    }
    const paddedLen = len % 4 === 0 ? len : len + (4 - (len % 4));
    opt += 4 + paddedLen;
  }
  return DEFAULT_UNITS_PER_SECOND;
}

function timestampToMs(tsHigh: number, tsLow: number, unitsPerSecond: bigint): number | null {
  if (unitsPerSecond <= 0n) return null;
  const ts = (BigInt(tsHigh) << 32n) | BigInt(tsLow);
  // BigInt math first: nanosecond counts overflow Number before division
  return Number((ts * 1000n) / unitsPerSecond);
}

// ---------------------------------------------------------------------------
// Frame parsing (Ethernet -> ARP / IPv4 / IPv6 -> TCP / UDP / ICMP -> DNS name)
// ---------------------------------------------------------------------------

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

function formatMac(bytes: Uint8Array, offset: number): string {
  return `${HEX[bytes[offset]]}:${HEX[bytes[offset + 1]]}:${HEX[bytes[offset + 2]]}:${HEX[bytes[offset + 3]]}:${HEX[bytes[offset + 4]]}:${HEX[bytes[offset + 5]]}`;
}

function isBroadcastOrMulticastMac(bytes: Uint8Array, offset: number): boolean {
  return (bytes[offset] & 0x01) !== 0; // group bit covers broadcast + multicast
}

function formatIpv4(bytes: Uint8Array, offset: number): string {
  return `${bytes[offset]}.${bytes[offset + 1]}.${bytes[offset + 2]}.${bytes[offset + 3]}`;
}

function formatIpv6(bytes: Uint8Array, offset: number): string {
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) {
    parts.push(((bytes[offset + i * 2] << 8) | bytes[offset + i * 2 + 1]).toString(16));
  }
  return parts.join(":");
}

export function isLocalIpv4(ip: string): boolean {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4) return false;
  const [a, b] = octets;
  if (a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function isMulticastOrBroadcastIpv4(ip: string): boolean {
  const first = Number(ip.split(".", 1)[0]);
  return (first >= 224 && first <= 239) || ip === "255.255.255.255";
}

function isLocalIpv6(ip: string): boolean {
  return (
    ip === "0:0:0:0:0:0:0:1" ||
    ip.startsWith("fe8") ||
    ip.startsWith("fe9") ||
    ip.startsWith("fea") ||
    ip.startsWith("feb") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}

function isMulticastIpv6(ip: string): boolean {
  return ip.startsWith("ff");
}

interface ParsedL3 {
  protocol: TrafficProtocol;
  srcIp: string | null;
  dstIp: string | null;
  srcPort: number | null;
  dstPort: number | null;
  srcLocal: boolean;
  dstLocal: boolean;
  dstBroadcast: boolean;
  /** Offset of the L4 payload (for DNS name extraction), -1 if unknown */
  l4PayloadOffset: number;
}

function processEthernetFrame(
  state: CaptureExtract,
  tsMs: number | null,
  frame: Uint8Array,
  origLen: number
): boolean {
  if (frame.length < 14) return false;

  const dstMacBroadcast = isBroadcastOrMulticastMac(frame, 0);
  const srcMac = formatMac(frame, 6);
  const dstMac = formatMac(frame, 0);

  // Skip up to two VLAN tags (802.1Q / 802.1ad)
  let etherTypeOffset = 12;
  let etherType = (frame[etherTypeOffset] << 8) | frame[etherTypeOffset + 1];
  for (let i = 0; i < 2 && (etherType === 0x8100 || etherType === 0x88a8 || etherType === 0x9100); i++) {
    etherTypeOffset += 4;
    if (etherTypeOffset + 2 > frame.length) return false;
    etherType = (frame[etherTypeOffset] << 8) | frame[etherTypeOffset + 1];
  }
  const l3Start = etherTypeOffset + 2;

  let l3: ParsedL3 | null = null;

  if (etherType === 0x0806) {
    l3 = parseArp(state, frame, l3Start, srcMac);
  } else if (etherType === 0x0800) {
    l3 = parseIpv4(frame, l3Start);
  } else if (etherType === 0x86dd) {
    state.ipv6Packets += 1;
    l3 = parseIpv6(frame, l3Start);
  } else {
    // Unclassified L2 traffic (LLC, EAPOL, etc.) — count, no flow detail
    l3 = {
      protocol: "other",
      srcIp: null,
      dstIp: null,
      srcPort: null,
      dstPort: null,
      srcLocal: true,
      dstLocal: true,
      dstBroadcast: dstMacBroadcast,
      l4PayloadOffset: -1,
    };
  }

  if (!l3) return false;
  if (l3.protocol === "icmp") state.icmpPackets += 1;
  l3.dstBroadcast = l3.dstBroadcast || dstMacBroadcast;

  recordHosts(state, tsMs, srcMac, dstMac, dstMacBroadcast, l3, origLen);
  recordFlow(state, tsMs, srcMac, dstMac, l3, origLen);

  // DNS/mDNS/LLMNR query names (metadata): only when the destination is a
  // resolver port and the question section is present.
  if (
    l3.protocol === "udp" &&
    l3.dstPort !== null &&
    (l3.dstPort === 53 || l3.dstPort === 5353 || l3.dstPort === 5355) &&
    l3.l4PayloadOffset >= 0
  ) {
    const name = parseDnsQueryName(frame, l3.l4PayloadOffset);
    if (name) {
      const kind: DnsKind = l3.dstPort === 53 ? "dns" : l3.dstPort === 5353 ? "mdns" : "llmnr";
      recordDnsQuery(state, srcMac, name, kind);
    }
  }

  return true;
}

function parseArp(
  state: CaptureExtract,
  frame: Uint8Array,
  start: number,
  srcMac: string
): ParsedL3 | null {
  state.arpPackets += 1;
  let senderIp: string | null = null;
  // Validate Ethernet/IPv4 ARP before reading the sender protocol address
  if (
    start + 28 <= frame.length &&
    frame[start + 4] === 6 && // hardware addr length
    frame[start + 5] === 4 // protocol addr length
  ) {
    const ip = formatIpv4(frame, start + 14);
    if (ip !== "0.0.0.0" && isLocalIpv4(ip)) {
      senderIp = ip;
      // ARP is the most reliable local IP<->MAC mapping in a capture
      void srcMac;
    }
  }
  return {
    protocol: "arp",
    srcIp: senderIp,
    dstIp: null,
    srcPort: null,
    dstPort: null,
    srcLocal: true,
    dstLocal: true,
    dstBroadcast: true,
    l4PayloadOffset: -1,
  };
}

function parseIpv4(frame: Uint8Array, start: number): ParsedL3 | null {
  if (start + 20 > frame.length) return null;
  if (frame[start] >> 4 !== 4) return null;
  const ihl = (frame[start] & 0x0f) * 4;
  if (ihl < 20 || start + ihl > frame.length) return null;

  const protocolByte = frame[start + 9];
  const fragOffset = ((frame[start + 6] & 0x1f) << 8) | frame[start + 7];
  const srcIp = formatIpv4(frame, start + 12);
  const dstIp = formatIpv4(frame, start + 16);
  const l4Start = start + ihl;

  const base: ParsedL3 = {
    protocol: "other",
    srcIp,
    dstIp,
    srcPort: null,
    dstPort: null,
    srcLocal: isLocalIpv4(srcIp),
    dstLocal: isLocalIpv4(dstIp),
    dstBroadcast: isMulticastOrBroadcastIpv4(dstIp),
    l4PayloadOffset: -1,
  };

  if (protocolByte === 1) {
    base.protocol = "icmp";
  } else if ((protocolByte === 6 || protocolByte === 17) && fragOffset === 0) {
    base.protocol = protocolByte === 6 ? "tcp" : "udp";
    if (l4Start + 4 <= frame.length) {
      base.srcPort = (frame[l4Start] << 8) | frame[l4Start + 1];
      base.dstPort = (frame[l4Start + 2] << 8) | frame[l4Start + 3];
      if (protocolByte === 17 && l4Start + 8 <= frame.length) {
        base.l4PayloadOffset = l4Start + 8;
      }
    }
  } else if (protocolByte === 6 || protocolByte === 17) {
    base.protocol = protocolByte === 6 ? "tcp" : "udp"; // later fragment, no ports
  }

  return base;
}

function parseIpv6(frame: Uint8Array, start: number): ParsedL3 | null {
  if (start + 40 > frame.length) return null;
  if (frame[start] >> 4 !== 6) return null;

  const srcIp = formatIpv6(frame, start + 8);
  const dstIp = formatIpv6(frame, start + 24);
  let nextHeader = frame[start + 6];
  let offset = start + 40;

  // Walk common extension headers (bounded)
  for (let hops = 0; hops < 8; hops++) {
    if (nextHeader === 0 || nextHeader === 43 || nextHeader === 60) {
      if (offset + 8 > frame.length) break;
      const len = (frame[offset + 1] + 1) * 8;
      nextHeader = frame[offset];
      offset += len;
    } else if (nextHeader === 44) {
      if (offset + 8 > frame.length) break;
      const fragOffset = ((frame[offset + 2] << 8) | frame[offset + 3]) >> 3;
      nextHeader = frame[offset];
      offset += 8;
      if (fragOffset > 0) {
        nextHeader = -1; // not the first fragment: no L4 header
        break;
      }
    } else if (nextHeader === 51) {
      if (offset + 8 > frame.length) break;
      const len = (frame[offset + 1] + 2) * 4;
      nextHeader = frame[offset];
      offset += len;
    } else {
      break;
    }
  }

  const base: ParsedL3 = {
    protocol: "other",
    srcIp,
    dstIp,
    srcPort: null,
    dstPort: null,
    srcLocal: isLocalIpv6(srcIp),
    dstLocal: isLocalIpv6(dstIp),
    dstBroadcast: isMulticastIpv6(dstIp),
    l4PayloadOffset: -1,
  };

  if (nextHeader === 58) {
    base.protocol = "icmp";
  } else if (nextHeader === 6 || nextHeader === 17) {
    base.protocol = nextHeader === 6 ? "tcp" : "udp";
    if (offset + 4 <= frame.length) {
      base.srcPort = (frame[offset] << 8) | frame[offset + 1];
      base.dstPort = (frame[offset + 2] << 8) | frame[offset + 3];
      if (nextHeader === 17 && offset + 8 <= frame.length) {
        base.l4PayloadOffset = offset + 8;
      }
    }
  }

  return base;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function getHost(state: CaptureExtract, mac: string): HostAggregate | null {
  let host = state.hosts.get(mac);
  if (!host) {
    if (state.hosts.size >= MAX_TRACKED_HOSTS) return null;
    host = {
      mac,
      ips: new Set(),
      packetsSent: 0,
      packetsReceived: 0,
      bytesSent: 0,
      bytesReceived: 0,
      firstTsMs: null,
      lastTsMs: null,
      arpPackets: 0,
      dnsQueryCount: 0,
      externalPeers: new Set(),
    };
    state.hosts.set(mac, host);
  }
  return host;
}

function touchHostTime(host: HostAggregate, tsMs: number | null): void {
  if (tsMs === null) return;
  if (host.firstTsMs === null || tsMs < host.firstTsMs) host.firstTsMs = tsMs;
  if (host.lastTsMs === null || tsMs > host.lastTsMs) host.lastTsMs = tsMs;
}

function recordHosts(
  state: CaptureExtract,
  tsMs: number | null,
  srcMac: string,
  dstMac: string,
  dstMacBroadcast: boolean,
  l3: ParsedL3,
  origLen: number
): void {
  const srcHost = getHost(state, srcMac);
  if (srcHost) {
    srcHost.packetsSent += 1;
    srcHost.bytesSent += origLen;
    touchHostTime(srcHost, tsMs);
    if (l3.protocol === "arp") srcHost.arpPackets += 1;
    // Only adopt local unicast IPs as "this device's address" — external IPs
    // seen behind a MAC belong to the internet side of the gateway.
    if (l3.srcIp && l3.srcLocal) srcHost.ips.add(l3.srcIp);
    if (l3.dstIp && !l3.dstLocal && !l3.dstBroadcast) srcHost.externalPeers.add(l3.dstIp);
  }

  if (!dstMacBroadcast) {
    const dstHost = getHost(state, dstMac);
    if (dstHost) {
      dstHost.packetsReceived += 1;
      dstHost.bytesReceived += origLen;
      touchHostTime(dstHost, tsMs);
      if (l3.dstIp && l3.dstLocal && !l3.dstBroadcast) dstHost.ips.add(l3.dstIp);
      if (l3.srcIp && !l3.srcLocal && !l3.dstBroadcast) dstHost.externalPeers.add(l3.srcIp);
    }
  }

  // Gateway votes: the MAC that fronts external IPs at L2 is the router
  if (l3.dstIp && !l3.dstLocal && !l3.dstBroadcast && !dstMacBroadcast) {
    addGatewayVote(state, dstMac, l3.dstIp);
  }
  if (l3.srcIp && !l3.srcLocal && !l3.dstBroadcast) {
    addGatewayVote(state, srcMac, l3.srcIp);
  }

  // External endpoint registry
  if (l3.srcIp && !l3.srcLocal && !isAnyBroadcastIp(l3.srcIp)) {
    recordExternalIp(state, l3.srcIp, origLen);
  }
  if (l3.dstIp && !l3.dstLocal && !l3.dstBroadcast) {
    recordExternalIp(state, l3.dstIp, origLen);
  }
}

function isAnyBroadcastIp(ip: string): boolean {
  return ip.includes(".") ? isMulticastOrBroadcastIpv4(ip) : isMulticastIpv6(ip);
}

function addGatewayVote(state: CaptureExtract, mac: string, externalIp: string): void {
  let votes = state.gatewayVotes.get(mac);
  if (!votes) {
    votes = new Set();
    state.gatewayVotes.set(mac, votes);
  }
  if (votes.size < 10_000) votes.add(externalIp);
}

function recordExternalIp(state: CaptureExtract, ip: string, origLen: number): void {
  let agg = state.externalIps.get(ip);
  if (!agg) {
    if (state.externalIps.size >= MAX_TRACKED_EXTERNAL_IPS) {
      state.droppedExternalIps += 1;
      state.truncated = true;
      return;
    }
    agg = { ip, packets: 0, bytes: 0 };
    state.externalIps.set(ip, agg);
  }
  agg.packets += 1;
  agg.bytes += origLen;
}

function recordFlow(
  state: CaptureExtract,
  tsMs: number | null,
  srcMac: string,
  dstMac: string,
  l3: ParsedL3,
  origLen: number
): void {
  const srcEp = `${l3.srcIp ?? srcMac}#${l3.srcPort ?? ""}`;
  const dstEp = l3.dstBroadcast
    ? `broadcast#${l3.dstPort ?? ""}`
    : `${l3.dstIp ?? dstMac}#${l3.dstPort ?? ""}`;
  const key =
    l3.dstBroadcast || srcEp <= dstEp
      ? `${l3.protocol}|${srcEp}|${dstEp}`
      : `${l3.protocol}|${dstEp}|${srcEp}`;

  let flow = state.flows.get(key);
  if (!flow) {
    if (state.flows.size >= MAX_TRACKED_FLOWS) {
      state.droppedFlows += 1;
      state.truncated = true;
      return;
    }
    flow = {
      key,
      protocol: l3.protocol,
      srcMac,
      dstMac,
      srcIp: l3.srcIp,
      dstIp: l3.dstIp,
      srcPort: l3.srcPort,
      dstPort: l3.dstPort,
      srcLocal: l3.srcLocal,
      dstLocal: l3.dstLocal,
      dstBroadcast: l3.dstBroadcast,
      packets: 0,
      bytes: 0,
      bytesFromSrc: 0,
      firstTsMs: null,
      lastTsMs: null,
    };
    state.flows.set(key, flow);
  }

  flow.packets += 1;
  flow.bytes += origLen;
  const matchesInitiator =
    (l3.srcIp ?? srcMac) === (flow.srcIp ?? flow.srcMac) &&
    (l3.srcPort ?? null) === flow.srcPort;
  if (matchesInitiator) flow.bytesFromSrc += origLen;
  if (tsMs !== null) {
    if (flow.firstTsMs === null || tsMs < flow.firstTsMs) flow.firstTsMs = tsMs;
    if (flow.lastTsMs === null || tsMs > flow.lastTsMs) flow.lastTsMs = tsMs;
  }
}

function recordDnsQuery(state: CaptureExtract, srcMac: string, name: string, kind: DnsKind): void {
  const host = state.hosts.get(srcMac);
  if (host) host.dnsQueryCount += 1;

  const key = `${kind}|${name}`;
  let agg = state.dnsQueries.get(key);
  if (!agg) {
    if (state.dnsQueries.size >= MAX_TRACKED_DNS_NAMES) {
      state.droppedDnsNames += 1;
      state.truncated = true;
      return;
    }
    agg = { name, count: 0, kind };
    state.dnsQueries.set(key, agg);
  }
  agg.count += 1;
}

/**
 * Extract the question name from a DNS message. Reads only the question
 * section labels (the queried name) — never answer payloads.
 */
export function parseDnsQueryName(bytes: Uint8Array, dnsStart: number): string | null {
  if (dnsStart + 12 > bytes.length) return null;
  const qdcount = (bytes[dnsStart + 4] << 8) | bytes[dnsStart + 5];
  if (qdcount === 0) return null;

  let offset = dnsStart + 12;
  const labels: string[] = [];
  let total = 0;

  while (offset < bytes.length) {
    const len = bytes[offset];
    if (len === 0) break;
    if ((len & 0xc0) !== 0) return null; // compression pointer — bail safely
    offset += 1;
    if (len > 63 || offset + len > bytes.length) return null;
    total += len + 1;
    if (total > 253 || labels.length >= 40) return null;
    let label = "";
    for (let i = 0; i < len; i++) {
      const c = bytes[offset + i];
      label += c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : "?";
    }
    labels.push(label);
    offset += len;
  }

  if (labels.length === 0) return null;
  return labels.join(".").toLowerCase();
}
