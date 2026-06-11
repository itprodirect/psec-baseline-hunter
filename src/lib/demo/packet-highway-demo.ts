/**
 * Demo fixture for the Traffic Visualizer.
 *
 * 100% synthetic: locally-administered MACs (02:…), RFC 5737 TEST-NET IPs
 * for "internet" endpoints, and reserved example.* domains. It is built by
 * running synthetic flow specs through the REAL normalizer + watch rules +
 * summary pipeline, so demo output always matches live behavior.
 */

import type { InventoryDevice } from "@/lib/services/inventory";
import type {
  CaptureExtract,
  FlowAggregate,
  HostAggregate,
} from "@/lib/services/pcap-parser";
import type { DnsKind, NormalizedCapture, TrafficProtocol } from "@/lib/types/packet-highway";
import { buildNormalizedCapture } from "@/lib/services/traffic-normalizer";

const ROUTER = "02:de:c0:01:00:01";
const TV = "02:de:c0:01:00:02";
const LAPTOP = "02:de:c0:01:00:03";
const PHONE = "02:de:c0:01:00:04";
const SPEAKER = "02:de:c0:01:00:05";
const PRINTER = "02:de:c0:01:00:06";
const MYSTERY = "02:de:c0:01:00:07";

const IPS: Record<string, string> = {
  [ROUTER]: "192.168.50.1",
  [TV]: "192.168.50.21",
  [LAPTOP]: "192.168.50.34",
  [PHONE]: "192.168.50.40",
  [SPEAKER]: "192.168.50.52",
  [PRINTER]: "192.168.50.60",
  [MYSTERY]: "192.168.50.77",
};

const T0 = Date.parse("2026-06-01T19:00:00.000Z");
const DURATION = 5 * 60 * 1000;

interface FlowSpec {
  srcMac: string;
  dstMac: string;
  srcIp: string;
  dstIp: string;
  proto: TrafficProtocol;
  srcPort: number | null;
  dstPort: number | null;
  packets: number;
  bytes: number;
  /** Fraction of bytes sent by src (0..1) */
  up: number;
  start: number; // fraction of capture
  end: number;
  broadcast?: boolean;
}

const FLOW_SPECS: FlowSpec[] = [
  // Living Room TV streams video (QUIC) + secure web
  { srcMac: TV, dstMac: ROUTER, srcIp: IPS[TV], dstIp: "203.0.113.10", proto: "udp", srcPort: 51020, dstPort: 443, packets: 4200, bytes: 4_850_000, up: 0.06, start: 0.02, end: 0.98 },
  { srcMac: TV, dstMac: ROUTER, srcIp: IPS[TV], dstIp: "198.51.100.7", proto: "tcp", srcPort: 50111, dstPort: 443, packets: 880, bytes: 920_000, up: 0.1, start: 0.05, end: 0.7 },
  // Family laptop: secure web + a software update + SSH into the router
  { srcMac: LAPTOP, dstMac: ROUTER, srcIp: IPS[LAPTOP], dstIp: "198.51.100.23", proto: "tcp", srcPort: 49822, dstPort: 443, packets: 640, bytes: 710_000, up: 0.18, start: 0.1, end: 0.6 },
  { srcMac: LAPTOP, dstMac: ROUTER, srcIp: IPS[LAPTOP], dstIp: "192.0.2.50", proto: "tcp", srcPort: 49901, dstPort: 443, packets: 410, bytes: 505_000, up: 0.07, start: 0.3, end: 0.55 },
  { srcMac: LAPTOP, dstMac: ROUTER, srcIp: IPS[LAPTOP], dstIp: IPS[ROUTER], proto: "tcp", srcPort: 50412, dstPort: 22, packets: 160, bytes: 41_000, up: 0.45, start: 0.62, end: 0.7 },
  // Phone: web + a video call
  { srcMac: PHONE, dstMac: ROUTER, srcIp: IPS[PHONE], dstIp: "203.0.113.44", proto: "udp", srcPort: 52100, dstPort: 443, packets: 1500, bytes: 1_160_000, up: 0.48, start: 0.15, end: 0.85 },
  { srcMac: PHONE, dstMac: ROUTER, srcIp: IPS[PHONE], dstIp: "198.51.100.88", proto: "tcp", srcPort: 52344, dstPort: 443, packets: 240, bytes: 198_000, up: 0.2, start: 0.4, end: 0.5 },
  // Smart speaker: small heartbeats + local discovery chatter
  { srcMac: SPEAKER, dstMac: ROUTER, srcIp: IPS[SPEAKER], dstIp: "192.0.2.120", proto: "tcp", srcPort: 41200, dstPort: 443, packets: 90, bytes: 36_000, up: 0.55, start: 0.0, end: 1.0 },
  { srcMac: SPEAKER, dstMac: ROUTER, srcIp: IPS[SPEAKER], dstIp: "224.0.0.251", proto: "udp", srcPort: 5353, dstPort: 5353, packets: 210, bytes: 27_000, up: 1, start: 0.0, end: 1.0, broadcast: true },
  // Printer: local-only announcements
  { srcMac: PRINTER, dstMac: ROUTER, srcIp: IPS[PRINTER], dstIp: "224.0.0.251", proto: "udp", srcPort: 5353, dstPort: 5353, packets: 96, bytes: 14_500, up: 1, start: 0.0, end: 1.0, broadcast: true },
  { srcMac: PRINTER, dstMac: ROUTER, srcIp: IPS[PRINTER], dstIp: "239.255.255.250", proto: "udp", srcPort: 49152, dstPort: 1900, packets: 40, bytes: 9_800, up: 1, start: 0.1, end: 0.9, broadcast: true },
  // Mystery device: unencrypted HTTP + lookups (not in the inventory)
  { srcMac: MYSTERY, dstMac: ROUTER, srcIp: IPS[MYSTERY], dstIp: "203.0.113.99", proto: "tcp", srcPort: 37011, dstPort: 80, packets: 130, bytes: 88_000, up: 0.3, start: 0.45, end: 0.62 },
  { srcMac: MYSTERY, dstMac: ROUTER, srcIp: IPS[MYSTERY], dstIp: IPS[ROUTER], proto: "udp", srcPort: 40222, dstPort: 53, packets: 24, bytes: 3_100, up: 0.5, start: 0.44, end: 0.6 },
  // TV asks for lots of addresses (chatty lookups)
  { srcMac: TV, dstMac: ROUTER, srcIp: IPS[TV], dstIp: IPS[ROUTER], proto: "udp", srcPort: 38800, dstPort: 53, packets: 380, bytes: 47_000, up: 0.5, start: 0.0, end: 1.0 },
  // Phone pings the router (network check)
  { srcMac: PHONE, dstMac: ROUTER, srcIp: IPS[PHONE], dstIp: IPS[ROUTER], proto: "icmp", srcPort: null, dstPort: null, packets: 8, bytes: 800, up: 0.5, start: 0.2, end: 0.22 },
];

interface DnsSpec {
  mac: string;
  name: string;
  kind: DnsKind;
  count: number;
}

const DNS_SPECS: DnsSpec[] = [
  { mac: TV, name: "streaming.example.com", kind: "dns", count: 64 },
  { mac: TV, name: "cdn-video.example.net", kind: "dns", count: 58 },
  { mac: TV, name: "ads.example.net", kind: "dns", count: 41 },
  { mac: TV, name: "telemetry.example.org", kind: "dns", count: 22 },
  { mac: LAPTOP, name: "updates.example.org", kind: "dns", count: 9 },
  { mac: LAPTOP, name: "mail.example.com", kind: "dns", count: 6 },
  { mac: PHONE, name: "api.example.com", kind: "dns", count: 14 },
  { mac: PHONE, name: "photos.example.net", kind: "dns", count: 7 },
  { mac: MYSTERY, name: "portal.example.net", kind: "dns", count: 18 },
  { mac: SPEAKER, name: "_airplay._tcp.local", kind: "mdns", count: 36 },
  { mac: SPEAKER, name: "living-room-speaker.local", kind: "mdns", count: 24 },
  { mac: PRINTER, name: "_ipp._tcp.local", kind: "mdns", count: 30 },
  { mac: PRINTER, name: "office-printer.local", kind: "mdns", count: 18 },
];

const DEMO_INVENTORY: InventoryDevice[] = [
  invItem("Router / Gateway", ROUTER, "DemoNet Systems", IPS[ROUTER], "Main internet gateway"),
  invItem("Living Room TV", TV, "Acme Displays", IPS[TV], "Streams most evenings"),
  invItem("Family Laptop", LAPTOP, "Notebooks Inc", IPS[LAPTOP], "Used for work from home"),
  invItem("Dad's Phone", PHONE, "Phones R Us", IPS[PHONE], ""),
  invItem("Kitchen Speaker", SPEAKER, "Acme Audio", IPS[SPEAKER], "Voice assistant"),
  invItem("Office Printer", PRINTER, "PrintCo", IPS[PRINTER], "Wired, in the office"),
  // Note: MYSTERY device intentionally absent — demonstrates the unknown-device rule
];

function invItem(device: string, mac: string, vendor: string, ip: string, notes: string): InventoryDevice {
  return {
    id: `demo-${mac.slice(-2)}`,
    device,
    mac: mac.toUpperCase(),
    vendor,
    ip,
    hostnames: "",
    status: "active",
    notes,
    securityRecs: "",
    network: "demo-home",
    addedAt: new Date(T0).toISOString(),
    updatedAt: new Date(T0).toISOString(),
  };
}

function emptyHost(mac: string): HostAggregate {
  return {
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
}

function isExternalDemoIp(ip: string): boolean {
  return !ip.startsWith("192.168.") && !ip.startsWith("224.") && !ip.startsWith("239.");
}

function buildDemoExtract(): CaptureExtract {
  const extract: CaptureExtract = {
    format: "pcapng",
    packetCount: 0,
    byteCount: 0,
    firstTsMs: T0,
    lastTsMs: T0 + DURATION,
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

  const host = (mac: string): HostAggregate => {
    let h = extract.hosts.get(mac);
    if (!h) extract.hosts.set(mac, (h = emptyHost(mac)));
    return h;
  };

  for (const spec of FLOW_SPECS) {
    const first = T0 + spec.start * DURATION;
    const last = T0 + spec.end * DURATION;
    const bytesFromSrc = Math.round(spec.bytes * spec.up);
    const packetsFromSrc = Math.max(1, Math.round(spec.packets * spec.up));

    const flow: FlowAggregate = {
      key: `${spec.proto}|${spec.srcIp}#${spec.srcPort ?? ""}|${spec.dstIp}#${spec.dstPort ?? ""}`,
      protocol: spec.proto,
      srcMac: spec.srcMac,
      dstMac: spec.dstMac,
      srcIp: spec.srcIp,
      dstIp: spec.dstIp,
      srcPort: spec.srcPort,
      dstPort: spec.dstPort,
      srcLocal: true,
      dstLocal: !spec.broadcast && !isExternalDemoIp(spec.dstIp),
      dstBroadcast: spec.broadcast ?? false,
      packets: spec.packets,
      bytes: spec.bytes,
      bytesFromSrc,
      firstTsMs: first,
      lastTsMs: last,
    };
    extract.flows.set(flow.key, flow);
    extract.packetCount += spec.packets;
    extract.byteCount += spec.bytes;
    if (spec.proto === "icmp") extract.icmpPackets += spec.packets;

    const src = host(spec.srcMac);
    src.ips.add(spec.srcIp);
    src.packetsSent += packetsFromSrc;
    src.bytesSent += bytesFromSrc;
    src.packetsReceived += spec.packets - packetsFromSrc;
    src.bytesReceived += spec.bytes - bytesFromSrc;
    src.firstTsMs = src.firstTsMs === null ? first : Math.min(src.firstTsMs, first);
    src.lastTsMs = src.lastTsMs === null ? last : Math.max(src.lastTsMs, last);

    if (!spec.broadcast) {
      const dst = host(spec.dstMac);
      dst.packetsReceived += packetsFromSrc;
      dst.bytesReceived += bytesFromSrc;
      dst.packetsSent += spec.packets - packetsFromSrc;
      dst.bytesSent += spec.bytes - bytesFromSrc;
      dst.firstTsMs = dst.firstTsMs === null ? first : Math.min(dst.firstTsMs, first);
      dst.lastTsMs = dst.lastTsMs === null ? last : Math.max(dst.lastTsMs, last);
      if (spec.dstMac === ROUTER) host(ROUTER).ips.add(IPS[ROUTER]);
    }

    if (isExternalDemoIp(spec.dstIp)) {
      src.externalPeers.add(spec.dstIp);
      const ext = extract.externalIps.get(spec.dstIp) ?? { ip: spec.dstIp, packets: 0, bytes: 0 };
      ext.packets += spec.packets;
      ext.bytes += spec.bytes;
      extract.externalIps.set(spec.dstIp, ext);
      let votes = extract.gatewayVotes.get(spec.dstMac);
      if (!votes) extract.gatewayVotes.set(spec.dstMac, (votes = new Set()));
      votes.add(spec.dstIp);
    }
  }

  // ARP chatter: routine address resolution from every device
  for (const mac of [ROUTER, TV, LAPTOP, PHONE, SPEAKER, PRINTER, MYSTERY]) {
    const h = host(mac);
    h.arpPackets += 6;
    h.packetsSent += 6;
    h.bytesSent += 6 * 42;
    extract.arpPackets += 6;
    extract.packetCount += 6;
    extract.byteCount += 6 * 42;
    const key = `arp|${mac}#|broadcast#`;
    extract.flows.set(key, {
      key,
      protocol: "arp",
      srcMac: mac,
      dstMac: "ff:ff:ff:ff:ff:ff",
      srcIp: IPS[mac],
      dstIp: null,
      srcPort: null,
      dstPort: null,
      srcLocal: true,
      dstLocal: true,
      dstBroadcast: true,
      packets: 6,
      bytes: 6 * 42,
      bytesFromSrc: 6 * 42,
      firstTsMs: T0,
      lastTsMs: T0 + DURATION,
    });
  }

  for (const spec of DNS_SPECS) {
    host(spec.mac).dnsQueryCount += spec.count;
    extract.dnsQueries.set(`${spec.kind}|${spec.name}`, {
      name: spec.name,
      count: spec.count,
      kind: spec.kind,
    });
  }

  return extract;
}

let cachedDemo: NormalizedCapture | null = null;

export function buildDemoCapture(): NormalizedCapture {
  if (!cachedDemo) {
    cachedDemo = buildNormalizedCapture(buildDemoExtract(), {
      fileName: "sample-home-network.pcapng",
      format: "fixture",
      inventoryDevices: DEMO_INVENTORY,
    });
  }
  return cachedDemo;
}
