/**
 * Traffic Visualizer (packet-highway) tests.
 * Run via: npm test (after run-tests.js)
 *
 * All capture bytes are synthesized in-memory — no real PCAPs are used or
 * written to disk, matching the feature's privacy constraints.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

let total = 0;
let failed = 0;
let testQueue = Promise.resolve();

function run(name, fn) {
  total += 1;
  testQueue = testQueue.then(async () => {
    try {
      await fn();
      console.log(`PASS: ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${name}`);
      console.error(error instanceof Error ? error.stack : error);
    }
  });
}

async function finish() {
  await testQueue;
  if (failed > 0) {
    console.error(`\n${failed}/${total} packet-highway tests failed`);
    process.exit(1);
  }
  console.log(`\n${total} packet-highway tests passed`);
}

// ---------------------------------------------------------------------------
// Binary builders for synthetic captures
// ---------------------------------------------------------------------------

function macBytes(mac) {
  return Buffer.from(mac.split(":").map((part) => parseInt(part, 16)));
}

function ipBytes(ip) {
  return Buffer.from(ip.split(".").map(Number));
}

function ethFrame(dstMac, srcMac, etherType, payload) {
  const header = Buffer.alloc(14);
  macBytes(dstMac).copy(header, 0);
  macBytes(srcMac).copy(header, 6);
  header.writeUInt16BE(etherType, 12);
  return Buffer.concat([header, payload]);
}

function ipv4Packet(srcIp, dstIp, protocol, l4) {
  const header = Buffer.alloc(20);
  header[0] = 0x45; // v4, IHL 5
  header.writeUInt16BE(20 + l4.length, 2);
  header[8] = 64; // TTL
  header[9] = protocol;
  ipBytes(srcIp).copy(header, 12);
  ipBytes(dstIp).copy(header, 16);
  return Buffer.concat([header, l4]);
}

function tcpSegment(srcPort, dstPort, payloadLen = 8) {
  const seg = Buffer.alloc(20 + payloadLen);
  seg.writeUInt16BE(srcPort, 0);
  seg.writeUInt16BE(dstPort, 2);
  seg[12] = 0x50; // data offset 5
  return seg;
}

function udpDatagram(srcPort, dstPort, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt16BE(srcPort, 0);
  header.writeUInt16BE(dstPort, 2);
  header.writeUInt16BE(8 + payload.length, 4);
  return Buffer.concat([header, payload]);
}

function dnsQuery(name) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x1234, 0); // id
  header.writeUInt16BE(1, 4); // qdcount
  const labels = [];
  for (const label of name.split(".")) {
    labels.push(Buffer.from([label.length]), Buffer.from(label, "ascii"));
  }
  labels.push(Buffer.from([0]));
  const qtail = Buffer.alloc(4);
  qtail.writeUInt16BE(1, 0); // QTYPE A
  qtail.writeUInt16BE(1, 2); // QCLASS IN
  return Buffer.concat([header, ...labels, qtail]);
}

function arpPayload(senderMac, senderIp, targetIp) {
  const buf = Buffer.alloc(28);
  buf.writeUInt16BE(1, 0); // htype ethernet
  buf.writeUInt16BE(0x0800, 2); // ptype ipv4
  buf[4] = 6;
  buf[5] = 4;
  buf.writeUInt16BE(1, 6); // request
  macBytes(senderMac).copy(buf, 8);
  ipBytes(senderIp).copy(buf, 14);
  ipBytes(targetIp).copy(buf, 24);
  return buf;
}

/** Classic little-endian microsecond pcap file */
function pcapFile(packets, { linkType = 1 } = {}) {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(0xa1b2c3d4, 0);
  header.writeUInt16LE(2, 4);
  header.writeUInt16LE(4, 6);
  header.writeUInt32LE(65535, 16);
  header.writeUInt32LE(linkType, 20);

  const records = packets.map(({ tsSec, tsUsec = 0, frame }) => {
    const rec = Buffer.alloc(16);
    rec.writeUInt32LE(tsSec, 0);
    rec.writeUInt32LE(tsUsec, 4);
    rec.writeUInt32LE(frame.length, 8);
    rec.writeUInt32LE(frame.length, 12);
    return Buffer.concat([rec, frame]);
  });

  return Buffer.concat([header, ...records]);
}

/** Minimal little-endian pcapng: SHB + Ethernet IDB + one EPB per packet */
function pcapngFile(packets) {
  const shb = Buffer.alloc(28);
  shb.writeUInt32LE(0x0a0d0d0a, 0);
  shb.writeUInt32LE(28, 4);
  shb.writeUInt32LE(0x1a2b3c4d, 8);
  shb.writeUInt16LE(1, 12);
  shb.writeUInt16LE(0, 14);
  shb.writeInt32LE(-1, 16);
  shb.writeInt32LE(-1, 20);
  shb.writeUInt32LE(28, 24);

  const idb = Buffer.alloc(20);
  idb.writeUInt32LE(1, 0);
  idb.writeUInt32LE(20, 4);
  idb.writeUInt16LE(1, 8); // LINKTYPE_ETHERNET
  idb.writeUInt32LE(65535, 12);
  idb.writeUInt32LE(20, 16);

  const epbs = packets.map(({ tsMicros, frame }) => {
    const pad = (4 - (frame.length % 4)) % 4;
    const blockLen = 32 + frame.length + pad;
    const epb = Buffer.alloc(blockLen);
    epb.writeUInt32LE(6, 0);
    epb.writeUInt32LE(blockLen, 4);
    epb.writeUInt32LE(0, 8); // interface 0
    const ts = BigInt(tsMicros);
    epb.writeUInt32LE(Number(ts >> 32n), 12);
    epb.writeUInt32LE(Number(ts & 0xffffffffn), 16);
    epb.writeUInt32LE(frame.length, 20);
    epb.writeUInt32LE(frame.length, 24);
    frame.copy(epb, 28);
    epb.writeUInt32LE(blockLen, blockLen - 4);
    return epb;
  });

  return Buffer.concat([shb, idb, ...epbs]);
}

// Library modules are loaded via dynamic import() so the route-loader's
// @/ alias resolution applies (require() of TS bypasses async loader hooks).
async function loadModules() {
  const [
    services,
    parser,
    normalizer,
    rules,
    safety,
    inventory,
    demo,
    trustNotices,
    archetypes,
    attention,
    sceneLayout,
  ] = await Promise.all([
    import("../src/lib/constants/traffic-services.ts"),
    import("../src/lib/services/pcap-parser.ts"),
    import("../src/lib/services/traffic-normalizer.ts"),
    import("../src/lib/services/traffic-risk-rules.ts"),
    import("../src/lib/services/capture-upload-safety.ts"),
    import("../src/lib/services/inventory.ts"),
    import("../src/lib/demo/packet-highway-demo.ts"),
    import("../src/components/packet-highway/TrustNotices.tsx"),
    import("../src/lib/utils/packet-highway-device-archetypes.ts"),
    import("../src/lib/utils/traffic-attention.ts"),
    import("../src/components/packet-highway/scene-layout.ts"),
  ]);
  return {
    services,
    parser,
    normalizer,
    rules,
    safety,
    inventory,
    demo,
    trustNotices,
    archetypes,
    attention,
    sceneLayout,
  };
}

// Test network: device A + device B behind a router
const ROUTER_MAC = "aa:bb:cc:00:00:fe";
const DEV_A_MAC = "aa:bb:cc:00:00:01";
const DEV_B_MAC = "aa:bb:cc:00:00:02";
const BROADCAST_MAC = "ff:ff:ff:ff:ff:ff";
const MDNS_MAC = "01:00:5e:00:00:fb";
const DEV_A_IP = "192.168.1.10";
const DEV_B_IP = "192.168.1.20";
const ROUTER_IP = "192.168.1.1";
const EXTERNAL_IP = "203.0.113.34";
const BASE_SEC = 1_750_000_000;

function buildTestPcap() {
  return pcapFile([
    {
      tsSec: BASE_SEC,
      frame: ethFrame(ROUTER_MAC, DEV_A_MAC, 0x0800,
        ipv4Packet(DEV_A_IP, EXTERNAL_IP, 6, tcpSegment(51000, 443, 100))),
    },
    {
      tsSec: BASE_SEC + 1,
      frame: ethFrame(DEV_A_MAC, ROUTER_MAC, 0x0800,
        ipv4Packet(EXTERNAL_IP, DEV_A_IP, 6, tcpSegment(443, 51000, 900))),
    },
    {
      tsSec: BASE_SEC + 2,
      frame: ethFrame(ROUTER_MAC, DEV_A_MAC, 0x0800,
        ipv4Packet(DEV_A_IP, ROUTER_IP, 17, udpDatagram(40000, 53, dnsQuery("example.com")))),
    },
    {
      tsSec: BASE_SEC + 3,
      frame: ethFrame(MDNS_MAC, DEV_B_MAC, 0x0800,
        ipv4Packet(DEV_B_IP, "224.0.0.251", 17, udpDatagram(5353, 5353, dnsQuery("_ipp._tcp.local")))),
    },
    {
      tsSec: BASE_SEC + 4,
      frame: ethFrame(BROADCAST_MAC, DEV_B_MAC, 0x0806, arpPayload(DEV_B_MAC, DEV_B_IP, ROUTER_IP)),
    },
  ]);
}

function inventoryItem(overrides = {}) {
  return {
    id: "inv-1",
    device: "Work Laptop",
    mac: "AA:BB:CC:00:00:01",
    vendor: "Notebooks Inc",
    ip: DEV_A_IP,
    hostnames: "",
    status: "active",
    notes: "",
    securityRecs: "",
    network: "test-net",
    addedAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function ruleDevice(overrides = {}) {
  return {
    id: "dev-1",
    mac: "aa:bb:cc:00:00:01",
    ips: [DEV_A_IP],
    name: null,
    vendor: null,
    role: "device",
    isKnown: false,
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
    ...overrides,
  };
}

function ruleFlow(overrides = {}) {
  return {
    id: "flow-1",
    fromId: "dev-1",
    toId: "ext-1",
    protocol: "tcp",
    port: 443,
    category: "https",
    packets: 10,
    bytes: 1000,
    bytesFromInitiator: 500,
    firstSeen: null,
    lastSeen: null,
    scope: "external",
    ...overrides,
  };
}

function visualCapture({ devices = [ruleDevice()], flows = [], alerts = [] } = {}) {
  return {
    version: 1,
    meta: {
      fileName: "visual-test.pcap",
      format: "fixture",
      packetCount: 0,
      byteCount: 0,
      startTime: null,
      endTime: null,
      durationMs: null,
      truncated: false,
      ignoredPackets: 0,
      generatedAt: "2026-06-01T00:00:00.000Z",
    },
    devices,
    externalEndpoints: [],
    flows,
    animationEvents: [],
    dnsQueries: [],
    summary: {
      headline: "",
      lines: [],
      stats: {
        deviceCount: devices.filter((d) => d.role === "device").length,
        knownDeviceCount: devices.filter((d) => d.role === "device" && d.isKnown).length,
        externalEndpointCount: 0,
        flowCount: flows.length,
        dnsQueryCount: 0,
        uniqueDnsNames: 0,
        categoryBytes: {},
      },
    },
    alerts,
  };
}

function findRule(alerts, ruleId) {
  return alerts.find((a) => a.ruleId === ruleId) ?? null;
}

function externalTestIp(index) {
  return `203.0.${Math.floor(index / 254)}.${(index % 254) + 1}`;
}

async function main() {
const {
  services: { classifyService },
  parser: {
    parseCapture,
    parseDnsQueryName,
    isCaptureParseError,
    sniffCaptureFormat,
    MAX_TRACKED_DNS_NAMES,
    MAX_TRACKED_EXTERNAL_IPS,
    MAX_TRACKED_FLOWS,
  },
  normalizer: { buildNormalizedCapture },
  rules: {
    evaluateTrafficWatchItems,
    outboundExternalBytes,
    HIGH_OUTBOUND_BYTES_THRESHOLD,
    MANY_DNS_QUERIES_PER_DEVICE_THRESHOLD,
    MANY_EXTERNAL_PEERS_THRESHOLD,
  },
  safety: {
    MAX_CAPTURE_BYTES,
    MAX_FIXTURE_BYTES,
    MAX_PACKET_HIGHWAY_DEVICE_NOTE_LENGTH,
    assertCaptureRequestContentLength,
    assertCaptureUploadSize,
    parseNormalizedCaptureFixture,
    getCaptureUploadKind,
    isTrafficUploadError,
  },
  inventory: { parseInventoryCSV },
  demo: { buildDemoCapture },
  trustNotices: { AnalysisSourceNotice, ExportMetadataNotice, PartialAnalysisNotice },
  archetypes: { inferDeviceArchetype },
  attention: { buildTrafficAttentionIndex, TRAFFIC_ATTENTION_LEGEND },
  sceneLayout: { computeSceneLayout, computeVehiclePath, SCENE_W, SCENE_H, MAX_BUILDINGS },
} = await loadModules();

// ---------------------------------------------------------------------------
// Service classification
// ---------------------------------------------------------------------------

run("classifyService maps every spec'd service category", () => {
  assert.equal(classifyService("tcp", 51000, 443).category, "https");
  assert.equal(classifyService("udp", 51000, 443).category, "quic");
  assert.equal(classifyService("udp", 40000, 53).category, "dns");
  assert.equal(classifyService("tcp", 40000, 53).category, "dns");
  assert.equal(classifyService("udp", 5353, 5353).category, "mdns");
  assert.equal(classifyService("udp", 51000, 5355).category, "llmnr");
  assert.equal(classifyService("udp", 51000, 1900).category, "ssdp");
  assert.equal(classifyService("tcp", 51000, 80).category, "http");
  assert.equal(classifyService("tcp", 51000, 22).category, "ssh");
  assert.equal(classifyService("tcp", 51000, 445).category, "smb");
  assert.equal(classifyService("tcp", 51000, 3389).category, "rdp");
  assert.equal(classifyService("arp", null, null).category, "arp");
  assert.equal(classifyService("icmp", null, null).category, "icmp");
  assert.equal(classifyService("tcp", 50001, 50002).category, "other");
});

run("classifyService matches the server side of a response packet", () => {
  const result = classifyService("tcp", 443, 51000);
  assert.equal(result.category, "https");
  assert.equal(result.servicePort, 443);
});

// ---------------------------------------------------------------------------
// PCAP parsing (synthetic captures)
// ---------------------------------------------------------------------------

run("sniffCaptureFormat recognizes pcap, pcapng, and garbage", () => {
  assert.equal(sniffCaptureFormat(buildTestPcap()), "pcap");
  assert.equal(sniffCaptureFormat(pcapngFile([])), "pcapng");
  assert.equal(sniffCaptureFormat(Buffer.from("not a capture at all")), null);
});

run("parseCapture extracts devices, flows, DNS names, and counts from classic pcap", () => {
  const extract = parseCapture(buildTestPcap());

  assert.equal(extract.format, "pcap");
  assert.equal(extract.packetCount, 5);
  assert.ok(extract.byteCount > 0);
  assert.equal(extract.firstTsMs, BASE_SEC * 1000);
  assert.equal(extract.lastTsMs, (BASE_SEC + 4) * 1000);
  assert.equal(extract.truncated, false);

  // Hosts: device A, device B, router (broadcast/multicast MACs excluded)
  assert.deepEqual([...extract.hosts.keys()].sort(), [DEV_A_MAC, DEV_B_MAC, ROUTER_MAC].sort());
  assert.ok(extract.hosts.get(DEV_A_MAC).ips.has(DEV_A_IP));
  assert.ok(extract.hosts.get(DEV_A_MAC).externalPeers.has(EXTERNAL_IP));
  assert.equal(extract.hosts.get(DEV_A_MAC).dnsQueryCount, 1);
  assert.equal(extract.hosts.get(DEV_B_MAC).arpPackets, 1);

  // The external IP never becomes a "device IP" on the router
  assert.equal(extract.hosts.get(ROUTER_MAC).ips.has(EXTERNAL_IP), false);

  // Gateway votes point at the router MAC
  assert.ok(extract.gatewayVotes.get(ROUTER_MAC).has(EXTERNAL_IP));

  // External endpoint registry
  assert.equal(extract.externalIps.get(EXTERNAL_IP).packets, 2);

  // DNS + mDNS query names captured (metadata only)
  const dnsNames = [...extract.dnsQueries.values()].map((d) => `${d.kind}:${d.name}`).sort();
  assert.deepEqual(dnsNames, ["dns:example.com", "mdns:_ipp._tcp.local"]);

  // The bidirectional TCP conversation is a single flow
  const tcpFlow = [...extract.flows.values()].find((f) => f.protocol === "tcp");
  assert.equal(tcpFlow.packets, 2);
  assert.equal(tcpFlow.srcIp, DEV_A_IP);
  assert.ok(tcpFlow.bytesFromSrc > 0 && tcpFlow.bytesFromSrc < tcpFlow.bytes);
});

run("parseCapture handles pcapng (SHB + IDB + EPB) with correct timestamps", () => {
  const tsMicros = 1_750_000_000_000_000n;
  const file = pcapngFile([
    {
      tsMicros,
      frame: ethFrame(ROUTER_MAC, DEV_A_MAC, 0x0800,
        ipv4Packet(DEV_A_IP, EXTERNAL_IP, 6, tcpSegment(51000, 443))),
    },
  ]);
  const extract = parseCapture(file);

  assert.equal(extract.format, "pcapng");
  assert.equal(extract.packetCount, 1);
  assert.equal(extract.firstTsMs, Number(tsMicros / 1000n));
  assert.equal(extract.flows.size, 1);
});

run("parseCapture rejects garbage, empty, and non-Ethernet captures with friendly errors", () => {
  assert.throws(
    () => parseCapture(Buffer.from("garbage data that is not a capture")),
    (error) => isCaptureParseError(error) && /doesn't look like a PCAP/.test(error.message)
  );
  assert.throws(
    () => parseCapture(pcapFile([])),
    (error) => isCaptureParseError(error) && /No packets/.test(error.message)
  );
  assert.throws(
    () => parseCapture(pcapFile([], { linkType: 113 })),
    (error) => isCaptureParseError(error) && /non-Ethernet/.test(error.message)
  );
});

run("parseCapture rejects malformed classic pcap and pcapng with friendly errors", () => {
  const malformedPcap = Buffer.alloc(40);
  malformedPcap.writeUInt32LE(0xa1b2c3d4, 0);
  malformedPcap.writeUInt16LE(2, 4);
  malformedPcap.writeUInt16LE(4, 6);
  malformedPcap.writeUInt32LE(65535, 16);
  malformedPcap.writeUInt32LE(1, 20);
  malformedPcap.writeUInt32LE(999, 32);
  malformedPcap.writeUInt32LE(999, 36);

  assert.throws(
    () => parseCapture(malformedPcap),
    (error) =>
      isCaptureParseError(error) &&
      /No packets/.test(error.message) &&
      !/[A-Za-z]:\\|\/home\//.test(error.message)
  );

  const malformedPcapng = Buffer.alloc(28);
  malformedPcapng.writeUInt32LE(0x0a0d0d0a, 0);
  malformedPcapng.writeUInt32LE(28, 4);
  malformedPcapng.writeUInt32LE(0xdeadbeef, 8);

  assert.throws(
    () => parseCapture(malformedPcapng),
    (error) =>
      isCaptureParseError(error) &&
      /No packets/.test(error.message) &&
      !/[A-Za-z]:\\|\/home\//.test(error.message)
  );
});

run("parseCapture marks classic pcap valid-prefix malformed tail as truncated", () => {
  const validPrefix = pcapFile([
    {
      tsSec: BASE_SEC,
      frame: ethFrame(
        ROUTER_MAC,
        DEV_A_MAC,
        0x0800,
        ipv4Packet(DEV_A_IP, EXTERNAL_IP, 6, tcpSegment(51000, 443))
      ),
    },
  ]);
  const malformedRecord = Buffer.alloc(16);
  malformedRecord.writeUInt32LE(BASE_SEC + 1, 0);
  malformedRecord.writeUInt32LE(0, 4);
  malformedRecord.writeUInt32LE(999, 8);
  malformedRecord.writeUInt32LE(999, 12);

  const capture = buildNormalizedCapture(parseCapture(Buffer.concat([validPrefix, malformedRecord])), {
    fileName: "partial-tail.pcap",
  });

  assert.equal(capture.meta.packetCount, 1);
  assert.equal(capture.meta.truncated, true);
});

run("parseCapture marks pcapng valid-prefix corrupt block as truncated", () => {
  const tsMicros = 1_750_000_000_000_000n;
  const validPrefix = pcapngFile([
    {
      tsMicros,
      frame: ethFrame(
        ROUTER_MAC,
        DEV_A_MAC,
        0x0800,
        ipv4Packet(DEV_A_IP, EXTERNAL_IP, 6, tcpSegment(51000, 443))
      ),
    },
  ]);
  const corruptBlock = Buffer.alloc(12);
  corruptBlock.writeUInt32LE(6, 0);
  corruptBlock.writeUInt32LE(999, 4);
  corruptBlock.writeUInt32LE(0, 8);

  const capture = buildNormalizedCapture(parseCapture(Buffer.concat([validPrefix, corruptBlock])), {
    fileName: "partial-tail.pcapng",
  });

  assert.equal(capture.meta.packetCount, 1);
  assert.equal(capture.meta.truncated, true);
});

run("parseCapture marks pcapng valid-prefix non-aligned unknown block as truncated", () => {
  const tsMicros = 1_750_000_000_000_000n;
  const validPrefix = pcapngFile([
    {
      tsMicros,
      frame: ethFrame(
        ROUTER_MAC,
        DEV_A_MAC,
        0x0800,
        ipv4Packet(DEV_A_IP, EXTERNAL_IP, 6, tcpSegment(51000, 443))
      ),
    },
  ]);
  const nonAlignedUnknownBlock = Buffer.alloc(14);
  nonAlignedUnknownBlock.writeUInt32LE(0x00000bad, 0);
  nonAlignedUnknownBlock.writeUInt32LE(14, 4);
  nonAlignedUnknownBlock.writeUInt32LE(14, 10);

  const capture = buildNormalizedCapture(
    parseCapture(Buffer.concat([validPrefix, nonAlignedUnknownBlock])),
    { fileName: "partial-unknown-block.pcapng" }
  );

  assert.equal(capture.meta.packetCount, 1);
  assert.equal(capture.meta.truncated, true);
});

run("parseCapture marks pcapng valid-prefix undersized enhanced packet block as truncated", () => {
  const tsMicros = 1_750_000_000_000_000n;
  const undersizedEnhancedPacketBlock = Buffer.alloc(12);
  undersizedEnhancedPacketBlock.writeUInt32LE(6, 0);
  undersizedEnhancedPacketBlock.writeUInt32LE(12, 4);
  undersizedEnhancedPacketBlock.writeUInt32LE(12, 8);

  assert.throws(
    () => parseCapture(Buffer.concat([pcapngFile([]), undersizedEnhancedPacketBlock])),
    (error) => isCaptureParseError(error) && /No packets/.test(error.message)
  );

  const validPrefix = pcapngFile([
    {
      tsMicros,
      frame: ethFrame(
        ROUTER_MAC,
        DEV_A_MAC,
        0x0800,
        ipv4Packet(DEV_A_IP, EXTERNAL_IP, 6, tcpSegment(51000, 443))
      ),
    },
  ]);

  const capture = buildNormalizedCapture(
    parseCapture(Buffer.concat([validPrefix, undersizedEnhancedPacketBlock])),
    { fileName: "undersized-epb.pcapng" }
  );

  assert.equal(capture.meta.packetCount, 1);
  assert.equal(capture.meta.truncated, true);
});

run("parseCapture enforces packet count cap with truncation", () => {
  const packets = Array.from({ length: 5 }, (_, i) => ({
    tsSec: BASE_SEC + i,
    frame: ethFrame(
      ROUTER_MAC,
      DEV_A_MAC,
      0x0800,
      ipv4Packet(DEV_A_IP, EXTERNAL_IP, 6, tcpSegment(51000, 443))
    ),
  }));
  const extract = parseCapture(pcapFile(packets), { maxPackets: 3 });

  assert.equal(extract.packetCount, 3);
  assert.equal(extract.truncated, true);
});

run("parseCapture caps tracked flow count", () => {
  const packets = Array.from({ length: MAX_TRACKED_FLOWS + 5 }, (_, i) => ({
    tsSec: BASE_SEC,
    frame: ethFrame(
      ROUTER_MAC,
      DEV_A_MAC,
      0x0800,
      ipv4Packet(DEV_A_IP, EXTERNAL_IP, 6, tcpSegment(10000 + i, 443))
    ),
  }));
  const extract = parseCapture(pcapFile(packets));

  assert.equal(extract.flows.size, MAX_TRACKED_FLOWS);
  assert.equal(extract.droppedFlows, 5);
  assert.equal(extract.truncated, true);
});

run("parseCapture caps tracked external endpoint count", () => {
  const packets = Array.from({ length: MAX_TRACKED_EXTERNAL_IPS + 5 }, (_, i) => ({
    tsSec: BASE_SEC,
    frame: ethFrame(
      ROUTER_MAC,
      DEV_A_MAC,
      0x0800,
      ipv4Packet(DEV_A_IP, externalTestIp(i), 6, tcpSegment(51000, 443))
    ),
  }));
  const extract = parseCapture(pcapFile(packets));

  assert.equal(extract.externalIps.size, MAX_TRACKED_EXTERNAL_IPS);
  assert.equal(extract.droppedExternalIps, 5);
  assert.equal(extract.droppedFlows, 0);
  assert.ok(extract.flows.size < MAX_TRACKED_FLOWS);
  assert.equal(extract.truncated, true);
});

run("parseCapture caps tracked DNS name count", () => {
  const packets = Array.from({ length: MAX_TRACKED_DNS_NAMES + 5 }, (_, i) => ({
    tsSec: BASE_SEC,
    frame: ethFrame(
      ROUTER_MAC,
      DEV_A_MAC,
      0x0800,
      ipv4Packet(
        DEV_A_IP,
        ROUTER_IP,
        17,
        udpDatagram(40000, 53, dnsQuery(`name${i}.example`))
      )
    ),
  }));
  const extract = parseCapture(pcapFile(packets));

  assert.equal(extract.dnsQueries.size, MAX_TRACKED_DNS_NAMES);
  assert.equal(extract.droppedDnsNames, 5);
  assert.equal(extract.droppedFlows, 0);
  assert.ok(extract.flows.size < MAX_TRACKED_FLOWS);
  assert.equal(extract.truncated, true);
});

run("parseDnsQueryName reads question names and bails on compression pointers", () => {
  const query = dnsQuery("sub.example.com");
  assert.equal(parseDnsQueryName(query, 0), "sub.example.com");

  const compressed = Buffer.from(query);
  compressed[12] = 0xc0; // pointer instead of a label
  assert.equal(parseDnsQueryName(compressed, 0), null);
});

// ---------------------------------------------------------------------------
// Normalization + device CSV merge
// ---------------------------------------------------------------------------

run("buildNormalizedCapture detects the gateway and merges inventory by MAC", () => {
  const extract = parseCapture(buildTestPcap());
  const capture = buildNormalizedCapture(extract, {
    fileName: "test.pcap",
    inventoryDevices: [inventoryItem()],
  });

  const gateway = capture.devices.find((d) => d.role === "gateway");
  assert.equal(gateway.mac, ROUTER_MAC);

  const deviceA = capture.devices.find((d) => d.mac === DEV_A_MAC);
  assert.equal(deviceA.isKnown, true);
  assert.equal(deviceA.name, "Work Laptop");
  assert.equal(deviceA.vendor, "Notebooks Inc");

  const deviceB = capture.devices.find((d) => d.mac === DEV_B_MAC);
  assert.equal(deviceB.isKnown, false);

  const httpsFlow = capture.flows.find((f) => f.category === "https");
  assert.equal(httpsFlow.scope, "external");
  assert.equal(httpsFlow.port, 443);
  assert.equal(httpsFlow.fromId, deviceA.id);
  assert.ok(httpsFlow.toId.startsWith("ext-"));

  const mdnsFlow = capture.flows.find((f) => f.category === "mdns");
  assert.equal(mdnsFlow.scope, "broadcast");
  assert.equal(mdnsFlow.toId, "broadcast");

  // Unknown device alert fires because an inventory was provided
  const unknownAlert = findRule(capture.alerts, "unknown-device");
  assert.ok(unknownAlert);
  assert.deepEqual(unknownAlert.deviceIds, [deviceB.id]);

  assert.ok(capture.summary.headline.length > 0);
  assert.ok(capture.animationEvents.length > 0);
  assert.equal(capture.meta.packetCount, 5);
});

run("buildNormalizedCapture matches inventory by IP when MAC is absent", () => {
  const extract = parseCapture(buildTestPcap());
  const capture = buildNormalizedCapture(extract, {
    fileName: "test.pcap",
    inventoryDevices: [inventoryItem({ mac: "", device: "Laptop By IP" })],
  });
  const deviceA = capture.devices.find((d) => d.mac === DEV_A_MAC);
  assert.equal(deviceA.isKnown, true);
  assert.equal(deviceA.name, "Laptop By IP");
});

run("buildNormalizedCapture without inventory marks devices unknown but raises no unknown-device alert", () => {
  const extract = parseCapture(buildTestPcap());
  const capture = buildNormalizedCapture(extract, { fileName: "test.pcap" });
  assert.equal(findRule(capture.alerts, "unknown-device"), null);
  assert.ok(capture.summary.lines.some((line) => /device list/i.test(line)));
});

run("buildNormalizedCapture exports truncated metadata when parser drops capped data", () => {
  const externalPackets = Array.from({ length: MAX_TRACKED_EXTERNAL_IPS + 5 }, (_, i) => ({
    tsSec: BASE_SEC,
    frame: ethFrame(
      ROUTER_MAC,
      DEV_A_MAC,
      0x0800,
      ipv4Packet(DEV_A_IP, externalTestIp(i), 6, tcpSegment(51000, 443))
    ),
  }));
  const externalCapture = buildNormalizedCapture(parseCapture(pcapFile(externalPackets)), {
    fileName: "external-cap.pcap",
  });
  const restoredExternal = parseNormalizedCaptureFixture(JSON.stringify(externalCapture));

  assert.equal(externalCapture.meta.truncated, true);
  assert.equal(restoredExternal.meta.truncated, true);

  const dnsPackets = Array.from({ length: MAX_TRACKED_DNS_NAMES + 5 }, (_, i) => ({
    tsSec: BASE_SEC,
    frame: ethFrame(
      ROUTER_MAC,
      DEV_A_MAC,
      0x0800,
      ipv4Packet(
        DEV_A_IP,
        ROUTER_IP,
        17,
        udpDatagram(40000, 53, dnsQuery(`export${i}.example`))
      )
    ),
  }));
  const dnsCapture = buildNormalizedCapture(parseCapture(pcapFile(dnsPackets)), {
    fileName: "dns-cap.pcap",
  });
  const restoredDns = parseNormalizedCaptureFixture(JSON.stringify(dnsCapture));

  assert.equal(dnsCapture.meta.truncated, true);
  assert.equal(restoredDns.meta.truncated, true);
});

run("packet highway trust notices explain partial results and export metadata", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");

  const partialMarkup = renderToStaticMarkup(React.createElement(PartialAnalysisNotice));
  const exportMarkup = renderToStaticMarkup(React.createElement(ExportMetadataNotice));
  const sampleMarkup = renderToStaticMarkup(
    React.createElement(AnalysisSourceNotice, { capture: buildDemoCapture(), isDemo: true })
  );
  const rawCapture = buildNormalizedCapture(parseCapture(buildTestPcap()), {
    fileName: "scan.pcap",
  });
  const rawMarkup = renderToStaticMarkup(
    React.createElement(AnalysisSourceNotice, { capture: rawCapture, isDemo: false })
  );
  const importedMarkup = renderToStaticMarkup(
    React.createElement(AnalysisSourceNotice, {
      capture: parseNormalizedCaptureFixture(JSON.stringify(buildDemoCapture())),
      isDemo: false,
    })
  );
  const lossyFixture = JSON.parse(JSON.stringify(buildDemoCapture()));
  lossyFixture.devices[0].ips = Array.from(
    { length: 17 },
    (_, index) => `198.51.100.${index + 1}`
  );
  const lossyImportedMarkup = renderToStaticMarkup(
    React.createElement(AnalysisSourceNotice, {
      capture: parseNormalizedCaptureFixture(JSON.stringify(lossyFixture)),
      isDemo: false,
    })
  );
  const pluralLossyFixture = JSON.parse(JSON.stringify(buildDemoCapture()));
  pluralLossyFixture.devices[0].ips = Array.from(
    { length: 18 },
    (_, index) => `198.51.100.${index + 1}`
  );
  const pluralLossyImportedMarkup = renderToStaticMarkup(
    React.createElement(AnalysisSourceNotice, {
      capture: parseNormalizedCaptureFixture(JSON.stringify(pluralLossyFixture)),
      isDemo: false,
    })
  );

  assert.match(partialMarkup, /Partial analysis/);
  assert.match(partialMarkup, /analysis limit or ended after a malformed or truncated tail/);
  assert.match(partialMarkup, /Metrics and saved JSON/);
  assert.match(partialMarkup, /group or cap endpoint rendering/);
  assert.match(exportMarkup, /device identifiers, IPs, names, and DNS lookups/);
  assert.match(sampleMarkup, /Sample data/);
  assert.match(sampleMarkup, /fully synthetic sample/);
  assert.match(sampleMarkup, /not-in-list device/);
  assert.match(rawMarkup, /Raw capture analysis/);
  assert.match(rawMarkup, /does not intentionally save the raw capture file/);
  assert.match(importedMarkup, /Saved analysis JSON/);
  assert.match(importedMarkup, /not raw-capture evidence/);
  assert.match(importedMarkup, /CSV inventory is not reapplied/);
  assert.match(lossyImportedMarkup, /1 fixture record or field was/);
  assert.match(pluralLossyImportedMarkup, /2 fixture records or fields were/);
  assert.match(lossyImportedMarkup, /sanitation loss, not ignored packet loss/);
});

run("packet highway page clears stale analysis before a new analyze attempt", () => {
  const pageSource = fs.readFileSync(
    path.join(process.cwd(), "src", "app", "(dashboard)", "packet-highway", "page.tsx"),
    "utf8"
  );

  assert.match(
    pageSource,
    /setIsAnalyzing\(true\);\s*setServerError\(null\);\s*setCapture\(null\);\s*setIsDemo\(false\);\s*setSelectedDeviceId\(null\);/s
  );
  assert.match(pageSource, /<ExportMetadataNotice \/>/);
  assert.match(pageSource, /<AnalysisSourceNotice capture=\{capture\} isDemo=\{isDemo\} \/>/);
  assert.match(pageSource, /capture\.meta\.truncated && <PartialAnalysisNotice \/>/);
  assert.match(
    pageSource,
    /const demoCapture = buildDemoCapture\(\);\s*setServerError\(null\);\s*setCapture\(demoCapture\);\s*setIsDemo\(true\);\s*setSelectedDeviceId\(findFirstUnknownDeviceId\(demoCapture\)\);/s
  );
});

run("packet highway V1 infers demo device archetypes without model or brand claims", () => {
  const demo = buildDemoCapture();
  const byName = (name) => demo.devices.find((device) => device.name === name);

  assert.equal(inferDeviceArchetype(demo.devices.find((device) => device.role === "gateway")).archetype, "gateway");
  assert.equal(inferDeviceArchetype(byName("Dad's Phone")).archetype, "phone");
  assert.equal(inferDeviceArchetype(byName("Family Laptop")).archetype, "computer");
  assert.equal(inferDeviceArchetype(byName("Living Room TV")).archetype, "display");
  assert.equal(inferDeviceArchetype(byName("Kitchen Speaker")).archetype, "speaker");
  assert.equal(inferDeviceArchetype(byName("Office Printer")).archetype, "printer");

  const mystery = demo.devices.find((device) => device.role === "device" && !device.isKnown);
  assert.equal(inferDeviceArchetype(mystery).archetype, "unknown");

  assert.equal(
    inferDeviceArchetype(ruleDevice({ isKnown: true, vendor: "Apple", name: null })).archetype,
    "generic"
  );

  const weak = inferDeviceArchetype(
    ruleDevice({ categories: ["quic"], externalPeerCount: 2, isKnown: false })
  );
  assert.equal(weak.archetype, "unknown");
  assert.equal(weak.strength, "weak");
  assert.equal(weak.weakCandidate, "display");
});

run("packet highway V1 maps traffic attention from existing evidence", () => {
  const flows = [
    ruleFlow({ id: "flow-https", category: "https", port: 443 }),
    ruleFlow({ id: "flow-other", category: "other", port: null }),
    ruleFlow({ id: "flow-http", category: "http", port: 80 }),
    ruleFlow({ id: "flow-rdp", category: "rdp", port: 3389, scope: "external" }),
  ];
  const capture = visualCapture({
    flows,
    alerts: [
      {
        id: "alert-1",
        ruleId: "manual-review",
        level: "review",
        title: "Linked review item",
        detail: "Synthetic test alert",
        deviceIds: [],
        flowIds: ["flow-https"],
      },
    ],
  });
  const index = buildTrafficAttentionIndex(capture);

  assert.equal(index.getFlow(flows[0]).state, "review");
  assert.equal(index.getFlow(flows[1]).state, "unclassified");
  assert.equal(index.getFlow(flows[2]).state, "review");
  assert.equal(index.getFlow(flows[3]).state, "watch");

  const legendText = JSON.stringify(TRAFFIC_ATTENTION_LEGEND);
  assert.doesNotMatch(legendText, /safe|malicious|good|bad|attack/i);
});

run("packet highway V1 scene layout stays bounded while preserving gateway routes", () => {
  const demo = buildDemoCapture();
  const layout = computeSceneLayout(demo);

  assert.ok(layout.buildings.length <= MAX_BUILDINGS + 1);
  for (const building of layout.buildings) {
    assert.ok(building.x >= 0);
    assert.ok(building.y >= 0);
    assert.ok(building.x + building.w <= SCENE_W);
    assert.ok(building.y + building.h <= SCENE_H);
  }

  const externalFlow = demo.flows.find((flow) => flow.scope === "external");
  const pathPoints = computeVehiclePath(layout, externalFlow.fromId, externalFlow.toId);
  assert.deepEqual(pathPoints[1], layout.gateway.anchor);
});

run("packet highway V1 legend explains visual channels without toy vehicle language", () => {
  const legendSource = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "packet-highway", "Legend.tsx"),
    "utf8"
  );

  assert.match(legendSource, /Device shapes/);
  assert.match(legendSource, /Traffic type/);
  assert.match(legendSource, /Attention markers/);
  assert.doesNotMatch(legendSource, /Who's Driving|Each vehicle|info\.emoji|info\.vehicle/);
});

run("packet highway scene and upload accessibility wiring stays in place", () => {
  const sceneNodesSource = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "packet-highway", "scene-nodes.tsx"),
    "utf8"
  );
  const uploadSource = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "packet-highway", "UploadPanel.tsx"),
    "utf8"
  );
  const highwaySceneSource = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "packet-highway", "HighwayScene.tsx"),
    "utf8"
  );

  assert.match(sceneNodesSource, /activateOnKeyboard/);
  assert.match(sceneNodesSource, /tabIndex=\{selectable \? 0 : undefined\}/);
  assert.match(sceneNodesSource, /tabIndex=\{!isOverflow && device \? 0 : undefined\}/);
  assert.match(uploadSource, /role="alert"/);
  assert.match(highwaySceneSource, /usePrefersReducedMotion/);
  assert.match(highwaySceneSource, /Animation off \(reduced motion\)/);
});

run("packet highway sample copy describes a walkthrough, not capture duration", () => {
  const uploadSource = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "packet-highway", "UploadPanel.tsx"),
    "utf8"
  );
  const docsSource = fs.readFileSync(
    path.join(process.cwd(), "docs", "TRAFFIC_VISUALIZER.md"),
    "utf8"
  );

  assert.match(uploadSource, /Load guided sample/);
  assert.doesNotMatch(uploadSource, /60-second sample/);
  assert.match(docsSource, /60-second walkthrough/);
  assert.match(docsSource, /synthetic sample itself\s+represents several minutes of traffic/);
  assert.doesNotMatch(docsSource, /60-second sample/);
  assert.doesNotMatch(docsSource, /Load 60-second sample/);
});

run("parseInventoryCSV maps the documented CSV columns", () => {
  const csv = [
    "Device,MAC Address,Vendor,IP Address,Hostnames,Status,Notes,Security Recs",
    'Living Room TV,aa-bb-cc-11-22-33,Acme Displays,192.168.1.21,tv.local,active,"Streams, often",Update firmware',
  ].join("\n");
  const devices = parseInventoryCSV(csv, "test-net");

  assert.equal(devices.length, 1);
  assert.equal(devices[0].device, "Living Room TV");
  assert.equal(devices[0].mac, "AA:BB:CC:11:22:33");
  assert.equal(devices[0].vendor, "Acme Displays");
  assert.equal(devices[0].ip, "192.168.1.21");
  assert.equal(devices[0].notes, "Streams, often");
  assert.equal(devices[0].securityRecs, "Update firmware");
});

// ---------------------------------------------------------------------------
// Watch rules
// ---------------------------------------------------------------------------

run("watch rules: admin/critical port and HTTP rules fire with calm wording", () => {
  const devices = [ruleDevice(), ruleDevice({ id: "dev-2", mac: "aa:bb:cc:00:00:02" })];
  const flows = [
    ruleFlow({ id: "flow-ssh", category: "ssh", port: 22, scope: "internal", toId: "dev-2" }),
    ruleFlow({ id: "flow-smb", category: "smb", port: 445, scope: "external" }),
    ruleFlow({ id: "flow-http", category: "http", port: 80, scope: "external" }),
  ];
  const alerts = evaluateTrafficWatchItems({
    devices,
    flows,
    uniqueDnsNames: 5,
    inventoryProvided: false,
  });

  assert.ok(findRule(alerts, "admin-remote-ports"));
  const critical = findRule(alerts, "critical-ports");
  assert.equal(critical.level, "watch"); // external critical port escalates
  assert.ok(findRule(alerts, "unencrypted-http"));

  for (const alert of alerts) {
    assert.doesNotMatch(alert.title + alert.detail, /malware|attack|hacked|virus/i);
  }
});

run("watch rules: high outbound volume threshold is respected", () => {
  const overThreshold = evaluateTrafficWatchItems({
    devices: [ruleDevice()],
    flows: [ruleFlow({ bytes: HIGH_OUTBOUND_BYTES_THRESHOLD + 10, bytesFromInitiator: HIGH_OUTBOUND_BYTES_THRESHOLD + 1 })],
    uniqueDnsNames: 0,
    inventoryProvided: false,
  });
  assert.ok(findRule(overThreshold, "high-outbound-volume"));

  const underThreshold = evaluateTrafficWatchItems({
    devices: [ruleDevice()],
    flows: [ruleFlow({ bytes: HIGH_OUTBOUND_BYTES_THRESHOLD, bytesFromInitiator: HIGH_OUTBOUND_BYTES_THRESHOLD })],
    uniqueDnsNames: 0,
    inventoryProvided: false,
  });
  assert.equal(findRule(underThreshold, "high-outbound-volume"), null);
});

run("watch rules: outbound bytes count the device on either side of the flow", () => {
  const flows = [
    ruleFlow({ id: "a", fromId: "dev-1", toId: "ext-1", bytes: 100, bytesFromInitiator: 80 }),
    ruleFlow({ id: "b", fromId: "ext-1", toId: "dev-1", bytes: 100, bytesFromInitiator: 30 }),
    ruleFlow({ id: "c", fromId: "dev-1", toId: "dev-2", scope: "internal", bytes: 999, bytesFromInitiator: 999 }),
  ];
  assert.equal(outboundExternalBytes("dev-1", flows), 80 + 70);
});

run("watch rules: chatty DNS and external fan-out", () => {
  const alerts = evaluateTrafficWatchItems({
    devices: [
      ruleDevice({ dnsQueryCount: MANY_DNS_QUERIES_PER_DEVICE_THRESHOLD + 1 }),
      ruleDevice({ id: "dev-2", mac: "aa:bb:cc:00:00:02", externalPeerCount: MANY_EXTERNAL_PEERS_THRESHOLD + 1 }),
    ],
    flows: [],
    uniqueDnsNames: 10,
    inventoryProvided: false,
  });
  assert.equal(findRule(alerts, "many-dns-queries").level, "info");
  assert.ok(findRule(alerts, "many-external-endpoints"));
});

run("watch rules: unknown-device only fires when an inventory was provided", () => {
  const input = {
    devices: [ruleDevice({ isKnown: false })],
    flows: [],
    uniqueDnsNames: 0,
  };
  assert.equal(
    findRule(evaluateTrafficWatchItems({ ...input, inventoryProvided: false }), "unknown-device"),
    null
  );
  assert.ok(
    findRule(evaluateTrafficWatchItems({ ...input, inventoryProvided: true }), "unknown-device")
  );
});

// ---------------------------------------------------------------------------
// Fixture validation + demo
// ---------------------------------------------------------------------------

run("getCaptureUploadKind accepts pcap/pcapng/json and rejects others", () => {
  assert.equal(getCaptureUploadKind("scan.pcap"), "capture");
  assert.equal(getCaptureUploadKind("SCAN.PCAPNG"), "capture");
  assert.equal(getCaptureUploadKind("analysis.json"), "fixture");
  assert.throws(
    () => getCaptureUploadKind("notes.txt"),
    (error) => isTrafficUploadError(error) && /Unsupported file type/.test(error.message)
  );
});

run("capture upload safety rejects oversized files and requests", () => {
  assert.throws(
    () => assertCaptureUploadSize(MAX_CAPTURE_BYTES + 1, "capture"),
    (error) => isTrafficUploadError(error) && /File is too large/.test(error.message)
  );
  assert.throws(
    () => assertCaptureUploadSize(MAX_FIXTURE_BYTES + 1, "fixture"),
    (error) => isTrafficUploadError(error) && /File is too large/.test(error.message)
  );
  assert.throws(
    () => assertCaptureRequestContentLength(String(MAX_CAPTURE_BYTES + 2 * 64 * 1024 + 1024 * 1024 + 1)),
    (error) => isTrafficUploadError(error) && /Upload request is too large/.test(error.message)
  );
});

run("demo capture round-trips through the fixture validator", () => {
  const demo = buildDemoCapture();
  assert.ok(demo.devices.length >= 7);
  assert.ok(findRule(demo.alerts, "unknown-device"));
  assert.ok(findRule(demo.alerts, "unencrypted-http"));
  assert.equal(demo.summary.stats.deviceCount, 6);
  assert.equal(demo.summary.stats.knownDeviceCount, 5);
  assert.ok(demo.summary.lines.some((line) => /1 device was not in the list/.test(line)));

  const restored = parseNormalizedCaptureFixture(JSON.stringify(demo));
  assert.equal(restored.devices.length, demo.devices.length);
  assert.equal(restored.flows.length, demo.flows.length);
  assert.equal(restored.meta.format, "fixture");
  assert.equal(restored.meta.fixtureSanitizationLoss.count, 0);

  const legacy = JSON.parse(JSON.stringify(demo));
  delete legacy.meta.fixtureSanitizationLoss;
  const restoredLegacy = parseNormalizedCaptureFixture(JSON.stringify(legacy));
  assert.equal(restoredLegacy.meta.fixtureSanitizationLoss.count, 0);
});

run("fixture validator rejects invalid JSON and wrong shapes", () => {
  assert.throws(
    () => parseNormalizedCaptureFixture("{not json"),
    (error) => isTrafficUploadError(error) && /isn't valid JSON/.test(error.message)
  );
  assert.throws(
    () => parseNormalizedCaptureFixture(JSON.stringify({ hello: "world" })),
    (error) => isTrafficUploadError(error) && /doesn't look like/.test(error.message)
  );
  assert.throws(
    () => parseNormalizedCaptureFixture(JSON.stringify({ version: 1, meta: {}, devices: [], flows: [] })),
    (error) => isTrafficUploadError(error) && /no devices or flows/.test(error.message)
  );
});

run("fixture validator distinguishes optional absence from invalid required values", () => {
  const demo = buildDemoCapture();
  const optionalAbsence = JSON.parse(JSON.stringify(demo));
  delete optionalAbsence.meta.startTime;
  delete optionalAbsence.meta.durationMs;
  delete optionalAbsence.devices[0].name;
  delete optionalAbsence.devices[0].notes;
  delete optionalAbsence.flows[0].port;

  const optionalRestored = parseNormalizedCaptureFixture(JSON.stringify(optionalAbsence));
  assert.equal(optionalRestored.meta.startTime, null);
  assert.equal(optionalRestored.meta.durationMs, null);
  assert.equal(optionalRestored.devices[0].name, null);
  assert.equal(optionalRestored.devices[0].notes, null);
  assert.equal(optionalRestored.flows[0].port, null);
  assert.equal(optionalRestored.meta.fixtureSanitizationLoss.count, 0);

  const validRole = JSON.parse(JSON.stringify(demo));
  validRole.devices[0].role = "gateway";
  assert.equal(
    parseNormalizedCaptureFixture(JSON.stringify(validRole)).meta.fixtureSanitizationLoss.count,
    0
  );

  const missingRole = JSON.parse(JSON.stringify(demo));
  delete missingRole.devices[0].role;
  const missingRoleRestored = parseNormalizedCaptureFixture(JSON.stringify(missingRole));
  assert.equal(missingRoleRestored.devices[0].role, "device");
  assert.equal(missingRoleRestored.meta.fixtureSanitizationLoss.count, 1);
});

run("fixture validator counts enum and metadata replacements", () => {
  const demo = buildDemoCapture();
  const cases = [
    {
      name: "invalid device role",
      mutate: (fixture) => { fixture.devices[0].role = "administrator"; },
      select: (fixture) => fixture.devices[0].role,
      replacement: "device",
    },
    {
      name: "invalid animation category",
      mutate: (fixture) => { fixture.animationEvents[0].category = "made-up"; },
      select: (fixture) => fixture.animationEvents[0].category,
      replacement: "other",
    },
    {
      name: "invalid DNS kind",
      mutate: (fixture) => { fixture.dnsQueries[0].kind = "netbios"; },
      select: (fixture) => fixture.dnsQueries[0].kind,
      replacement: "dns",
    },
    {
      name: "invalid alert level",
      mutate: (fixture) => { fixture.alerts[0].level = "critical"; },
      select: (fixture) => fixture.alerts[0].level,
      replacement: "info",
    },
    {
      name: "invalid packet count",
      mutate: (fixture) => { fixture.meta.packetCount = "not-a-number"; },
      select: (fixture) => fixture.meta.packetCount,
      replacement: 0,
    },
    {
      name: "invalid generated timestamp",
      mutate: (fixture) => { fixture.meta.generatedAt = "not-a-date"; },
      select: (fixture) => fixture.meta.generatedAt,
      replacement: null,
    },
  ];

  for (const testCase of cases) {
    const fixture = JSON.parse(JSON.stringify(demo));
    testCase.mutate(fixture);
    const restored = parseNormalizedCaptureFixture(JSON.stringify(fixture));
    if (testCase.replacement === null) {
      assert.doesNotMatch(restored.meta.generatedAt, /not-a-date/, testCase.name);
    } else {
      assert.equal(testCase.select(restored), testCase.replacement, testCase.name);
    }
    assert.equal(restored.meta.fixtureSanitizationLoss.count, 1, testCase.name);
  }
});

run("fixture validator adds independent replacements and preserves prior loss idempotently", () => {
  const demo = buildDemoCapture();
  const tampered = JSON.parse(JSON.stringify(demo));
  tampered.devices[0].role = "administrator";
  tampered.animationEvents[0].category = "made-up";
  tampered.dnsQueries[0].kind = "netbios";
  tampered.alerts[0].level = "critical";
  tampered.meta.packetCount = "not-a-number";

  const restored = parseNormalizedCaptureFixture(JSON.stringify(tampered));
  assert.equal(restored.meta.fixtureSanitizationLoss.count, 5);
  const restoredAgain = parseNormalizedCaptureFixture(JSON.stringify(restored));
  assert.equal(restoredAgain.meta.fixtureSanitizationLoss.count, 5);

  const priorLoss = JSON.parse(JSON.stringify(demo));
  priorLoss.meta.fixtureSanitizationLoss = { count: 7 };
  priorLoss.devices[0].role = "administrator";
  const withPriorLoss = parseNormalizedCaptureFixture(JSON.stringify(priorLoss));
  assert.equal(withPriorLoss.devices[0].role, "device");
  assert.equal(withPriorLoss.meta.fixtureSanitizationLoss.count, 8);
  assert.equal(
    parseNormalizedCaptureFixture(JSON.stringify(withPriorLoss)).meta.fixtureSanitizationLoss.count,
    8
  );
});

run("fixture validator counts malformed flow fields path-invariantly", () => {
  const applyAllSecondaryDefects = (flow) => {
    flow.id = 42;
    flow.fromId = false;
    flow.toId = { synthetic: "invalid" };
    flow.packets = -1;
    flow.bytes = "synthetic-invalid-bytes";
    flow.bytesFromInitiator = -2;
    flow.firstSeen = "synthetic-invalid-first-seen";
    flow.lastSeen = "synthetic-invalid-last-seen";
  };
  const assertAllSecondaryReplacements = (flow) => {
    assert.equal(flow.id, "flow-unknown");
    assert.equal(flow.fromId, "");
    assert.equal(flow.toId, "");
    assert.equal(flow.packets, 0);
    assert.equal(flow.bytes, 0);
    assert.equal(flow.bytesFromInitiator, 0);
    assert.equal(flow.firstSeen, null);
    assert.equal(flow.lastSeen, null);
  };
  const secondaryCases = [
    {
      name: "id",
      mutate: (flow) => { flow.id = 42; },
      assertReplacement: (flow) => assert.equal(flow.id, "flow-unknown"),
    },
    {
      name: "fromId",
      mutate: (flow) => { flow.fromId = false; },
      assertReplacement: (flow) => assert.equal(flow.fromId, ""),
    },
    {
      name: "toId",
      mutate: (flow) => { flow.toId = { synthetic: "invalid" }; },
      assertReplacement: (flow) => assert.equal(flow.toId, ""),
    },
    {
      name: "packets",
      mutate: (flow) => { flow.packets = -1; },
      assertReplacement: (flow) => assert.equal(flow.packets, 0),
    },
    {
      name: "bytes",
      mutate: (flow) => { flow.bytes = "synthetic-invalid-bytes"; },
      assertReplacement: (flow) => assert.equal(flow.bytes, 0),
    },
    {
      name: "bytesFromInitiator",
      mutate: (flow) => { flow.bytesFromInitiator = -2; },
      assertReplacement: (flow) => assert.equal(flow.bytesFromInitiator, 0),
    },
    {
      name: "firstSeen",
      mutate: (flow) => { flow.firstSeen = "synthetic-invalid-first-seen"; },
      assertReplacement: (flow) => assert.equal(flow.firstSeen, null),
    },
    {
      name: "lastSeen",
      mutate: (flow) => { flow.lastSeen = "synthetic-invalid-last-seen"; },
      assertReplacement: (flow) => assert.equal(flow.lastSeen, null),
    },
  ];
  const cases = [
    ...secondaryCases.map((testCase) => ({
      name: `invalid scope plus malformed ${testCase.name}`,
      expectedLoss: 2,
      mutate: (flow) => {
        flow.scope = "synthetic-invalid-scope";
        testCase.mutate(flow);
      },
      assertReplacement: (flow) => {
        assert.equal(flow.scope, "external");
        testCase.assertReplacement(flow);
      },
      dropped: true,
    })),
    {
      name: "invalid scope plus all malformed secondary fields",
      expectedLoss: 9,
      mutate: (flow) => {
        flow.scope = "synthetic-invalid-scope";
        applyAllSecondaryDefects(flow);
      },
      assertReplacement: (flow) => {
        assert.equal(flow.scope, "external");
        assertAllSecondaryReplacements(flow);
      },
      dropped: true,
    },
    {
      name: "unknown field and invalid scope",
      expectedLoss: 2,
      mutate: (flow) => {
        flow.syntheticUnknown = "discard-me";
        flow.scope = "synthetic-invalid-scope";
      },
      assertReplacement: (flow) => {
        assert.equal("syntheticUnknown" in flow, false);
        assert.equal(flow.scope, "external");
      },
      dropped: true,
    },
    {
      name: "one invalid critical field",
      expectedLoss: 1,
      mutate: (flow) => {
        flow.scope = "synthetic-invalid-scope";
      },
      assertReplacement: (flow) => assert.equal(flow.scope, "external"),
      dropped: true,
    },
    {
      name: "one malformed secondary field",
      expectedLoss: 1,
      mutate: (flow) => { flow.id = 42; },
      assertReplacement: (flow) => assert.equal(flow.id, "flow-unknown"),
      dropped: false,
    },
    {
      name: "valid flow",
      expectedLoss: 0,
      mutate: () => {},
      assertReplacement: (flow) => assert.equal(flow.category, "quic"),
      dropped: false,
    },
  ];

  for (const testCase of cases) {
    const fixture = JSON.parse(JSON.stringify(buildDemoCapture()));
    fixture.flows = [fixture.flows[0]];
    fixture.animationEvents = [];
    testCase.mutate(fixture.flows[0]);

    const analyze = parseNormalizedCaptureFixture(JSON.stringify(fixture));
    const observation = parseNormalizedCaptureFixture(JSON.stringify(fixture), {
      dropInvalidFlows: true,
    });

    assert.equal(analyze.meta.fixtureSanitizationLoss.count, testCase.expectedLoss,
      `${testCase.name}: analyze loss`);
    assert.equal(observation.meta.fixtureSanitizationLoss.count, testCase.expectedLoss,
      `${testCase.name}: observation loss`);
    assert.equal(analyze.meta.ignoredPackets, 0, `${testCase.name}: analyze packets`);
    assert.equal(observation.meta.ignoredPackets, 0, `${testCase.name}: observation packets`);
    assert.equal(analyze.flows.length, 1, `${testCase.name}: analyze retains flow`);
    testCase.assertReplacement(analyze.flows[0]);
    assert.equal(observation.flows.length, testCase.dropped ? 0 : 1,
      `${testCase.name}: observation drop policy`);
    if (!testCase.dropped) {
      assert.deepEqual(observation.flows[0], analyze.flows[0],
        `${testCase.name}: retained replacement parity`);
    }
  }

  const nonObjectEntry = JSON.parse(JSON.stringify(buildDemoCapture()));
  nonObjectEntry.flows = [nonObjectEntry.flows[0], "synthetic-non-object-flow"];
  nonObjectEntry.animationEvents = [];
  for (const dropInvalidFlows of [false, true]) {
    const sanitized = parseNormalizedCaptureFixture(JSON.stringify(nonObjectEntry), {
      dropInvalidFlows,
    });
    assert.equal(sanitized.meta.fixtureSanitizationLoss.count, 1,
      `non-object entry: ${dropInvalidFlows ? "observation" : "analyze"}`);
    assert.equal(sanitized.flows.length, 1);
  }

  const withPriorLoss = JSON.parse(JSON.stringify(buildDemoCapture()));
  withPriorLoss.flows = [withPriorLoss.flows[0]];
  withPriorLoss.animationEvents = [];
  withPriorLoss.meta.fixtureSanitizationLoss = { count: 999_995 };
  withPriorLoss.flows[0].scope = "synthetic-invalid-scope";
  applyAllSecondaryDefects(withPriorLoss.flows[0]);

  for (const dropInvalidFlows of [false, true]) {
    const sanitized = parseNormalizedCaptureFixture(JSON.stringify(withPriorLoss), {
      dropInvalidFlows,
    });
    assert.equal(sanitized.meta.fixtureSanitizationLoss.count, 1_000_000,
      `saturation: ${dropInvalidFlows ? "observation" : "analyze"}`);
    assert.equal(sanitized.meta.ignoredPackets, 0);
  }

  const analyze = parseNormalizedCaptureFixture(JSON.stringify(withPriorLoss));
  const sanitizedAgain = parseNormalizedCaptureFixture(JSON.stringify(analyze));
  const observationAfterAnalyze = parseNormalizedCaptureFixture(JSON.stringify(analyze), {
    dropInvalidFlows: true,
  });
  assert.equal(sanitizedAgain.meta.fixtureSanitizationLoss.count, 1_000_000);
  assert.equal(observationAfterAnalyze.meta.fixtureSanitizationLoss.count, 1_000_000);
  assert.equal(observationAfterAnalyze.flows.length, 1);
});

run("fixture validator aligns device-note loss with the observation retention boundary", () => {
  assert.equal(MAX_PACKET_HIGHWAY_DEVICE_NOTE_LENGTH, 300);
  const demo = buildDemoCapture();
  const cases = [
    { length: 299, expectedLength: 299, expectedLoss: 0 },
    { length: 300, expectedLength: 300, expectedLoss: 0 },
    { length: 301, expectedLength: 300, expectedLoss: 1 },
    { length: 500, expectedLength: 300, expectedLoss: 1 },
  ];

  for (const testCase of cases) {
    const fixture = JSON.parse(JSON.stringify(demo));
    fixture.devices[0].notes = "n".repeat(testCase.length);
    const restored = parseNormalizedCaptureFixture(JSON.stringify(fixture));
    assert.equal(restored.devices[0].notes.length, testCase.expectedLength, testCase.length);
    assert.equal(
      restored.meta.fixtureSanitizationLoss.count,
      testCase.expectedLoss,
      testCase.length
    );
  }

  const priorLoss = JSON.parse(JSON.stringify(demo));
  priorLoss.meta.fixtureSanitizationLoss = { count: 2 };
  priorLoss.devices[0].notes = "n".repeat(301);
  const restored = parseNormalizedCaptureFixture(JSON.stringify(priorLoss));
  assert.equal(restored.devices[0].notes.length, 300);
  assert.equal(restored.meta.fixtureSanitizationLoss.count, 3);
  const restoredAgain = parseNormalizedCaptureFixture(JSON.stringify(restored));
  assert.equal(restoredAgain.devices[0].notes, restored.devices[0].notes);
  assert.equal(restoredAgain.meta.fixtureSanitizationLoss.count, 3);
});

run("fixture validator counts discarded, truncated, and clamped supplied fields", () => {
  const demo = buildDemoCapture();
  const tampered = JSON.parse(JSON.stringify(demo));
  tampered.devices[0].name = "x".repeat(5000);
  tampered.devices[0].unknownField = "should be dropped";
  tampered.animationEvents[0].t = 2;
  tampered.alerts[0].deviceIds[0] = "d".repeat(100);
  tampered.summary.stats.categoryBytes["not-a-category"] = 10;

  const restored = parseNormalizedCaptureFixture(JSON.stringify(tampered));
  assert.equal(restored.devices[0].name.length, 80);
  assert.equal("unknownField" in restored.devices[0], false);
  assert.equal(restored.animationEvents[0].t, 1);
  assert.equal(restored.alerts[0].deviceIds[0].length, 40);
  assert.equal("not-a-category" in restored.summary.stats.categoryBytes, false);
  assert.equal(restored.meta.fixtureSanitizationLoss.count, 5);
});

// ---------------------------------------------------------------------------
// API route
// ---------------------------------------------------------------------------

function createAnalyzeRequest(parts) {
  const formData = new FormData();
  for (const part of parts) {
    formData.append(
      part.field,
      new File([part.content], part.name, { type: part.type ?? "application/octet-stream" })
    );
  }
  return new Request("http://localhost/api/packet-highway/analyze", {
    method: "POST",
    body: formData,
  });
}

run("analyze API rejects invalid extensions, garbage captures, and missing files", async () => {
  const route = await import("../src/app/api/packet-highway/analyze/route.ts");

  const badExtension = await route.POST(
    createAnalyzeRequest([{ field: "capture", name: "notes.txt", content: "hello" }])
  );
  const badExtensionBody = await badExtension.json();
  assert.equal(badExtension.status, 400);
  assert.equal(badExtensionBody.success, false);
  assert.match(badExtensionBody.error, /Unsupported file type/);

  const garbage = await route.POST(
    createAnalyzeRequest([{ field: "capture", name: "scan.pcap", content: "not really a pcap" }])
  );
  const garbageBody = await garbage.json();
  assert.equal(garbage.status, 400);
  assert.match(garbageBody.error, /doesn't look like a PCAP/);
  assert.doesNotMatch(garbageBody.error, /[A-Za-z]:\\|\/home\//); // no paths leak

  const missing = await route.POST(
    new Request("http://localhost/api/packet-highway/analyze", {
      method: "POST",
      body: new FormData(),
    })
  );
  const missingBody = await missing.json();
  assert.equal(missing.status, 400);
  assert.match(missingBody.error, /No capture file/);
});

run("analyze API rejects a bad inventory CSV extension", async () => {
  const route = await import("../src/app/api/packet-highway/analyze/route.ts");
  const response = await route.POST(
    createAnalyzeRequest([
      { field: "capture", name: "scan.pcap", content: buildTestPcap() },
      { field: "inventory", name: "devices.xlsx", content: "binary" },
    ])
  );
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.match(body.error, /must be a \.csv/);
});

run("analyze API analyzes a synthetic pcap with inventory CSV end-to-end", async () => {
  const route = await import("../src/app/api/packet-highway/analyze/route.ts");
  const csv = [
    "Device,MAC Address,Vendor,IP Address",
    `Work Laptop,${DEV_A_MAC},Notebooks Inc,${DEV_A_IP}`,
  ].join("\n");

  const response = await route.POST(
    createAnalyzeRequest([
      { field: "capture", name: "scan.pcap", content: buildTestPcap() },
      { field: "inventory", name: "devices.csv", content: csv, type: "text/csv" },
    ])
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.meta.packetCount, 5);
  assert.equal(body.data.meta.fileName, "scan.pcap");
  const known = body.data.devices.find((d) => d.name === "Work Laptop");
  assert.ok(known);
  assert.equal(known.isKnown, true);
});

run("analyze API returns partial results for a valid-prefix malformed capture", async () => {
  const route = await import("../src/app/api/packet-highway/analyze/route.ts");
  const validPrefix = pcapFile([
    {
      tsSec: BASE_SEC,
      frame: ethFrame(
        ROUTER_MAC,
        DEV_A_MAC,
        0x0800,
        ipv4Packet(DEV_A_IP, EXTERNAL_IP, 6, tcpSegment(51000, 443))
      ),
    },
  ]);
  const malformedRecord = Buffer.alloc(16);
  malformedRecord.writeUInt32LE(BASE_SEC + 1, 0);
  malformedRecord.writeUInt32LE(0, 4);
  malformedRecord.writeUInt32LE(999, 8);
  malformedRecord.writeUInt32LE(999, 12);

  const response = await route.POST(
    createAnalyzeRequest([
      { field: "capture", name: "partial-tail.pcap", content: Buffer.concat([validPrefix, malformedRecord]) },
    ])
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.meta.packetCount, 1);
  assert.equal(body.data.meta.truncated, true);
  assert.doesNotMatch(JSON.stringify(body), /[A-Za-z]:\\|\/home\//);
});

run("analyze API accepts a previously exported normalized JSON fixture", async () => {
  const route = await import("../src/app/api/packet-highway/analyze/route.ts");
  const demo = buildDemoCapture();

  const response = await route.POST(
    createAnalyzeRequest([
      { field: "capture", name: "analysis.json", content: JSON.stringify(demo), type: "application/json" },
    ])
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.devices.length, demo.devices.length);

  const invalid = await route.POST(
    createAnalyzeRequest([{ field: "capture", name: "analysis.json", content: "{broken" }])
  );
  const invalidBody = await invalid.json();
  assert.equal(invalid.status, 400);
  assert.match(invalidBody.error, /isn't valid JSON/);
});

await finish();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
