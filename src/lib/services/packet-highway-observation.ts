import { parseNormalizedCaptureFixture } from "./capture-upload-safety";
import { sanitizeObservationBundleV1 } from "./observation-bundle";
import { hashString } from "@/lib/utils/hash";
import type {
  CollectionVantage,
  CoverageRecord,
  DeviceIdentityEvidence,
  ObservationBundleV1,
  ObservationDevice,
  ObservationRegistryEntry,
} from "@/lib/types";
import type { NormalizedCapture, TrafficDevice } from "@/lib/types/packet-highway";

export type PacketHighwayCollectionVantage =
  | "this-computer"
  | "gateway-router"
  | "mirror-tap"
  | "unknown";

export interface PacketHighwayObservationSiteInput {
  siteId?: string | null;
  networkName: string;
  networkScope?: string | null;
}

export interface PacketHighwayObservationInput {
  capture: NormalizedCapture;
  site: PacketHighwayObservationSiteInput;
  collectionVantage: PacketHighwayCollectionVantage;
  generatedAt?: string | Date;
}

const PACKET_HIGHWAY_SOURCE_ID = "src-packet-highway-analysis";
const PACKET_HIGHWAY_EXPECTED_SOURCES = [
  "packet_highway_analysis",
  "collection_vantage",
  "capture_timing",
  "parser_limits",
];

const VANTAGE_DETAILS: Record<
  PacketHighwayCollectionVantage,
  {
    type: CollectionVantage["type"];
    label: string;
    score: number;
    note: string;
  }
> = {
  "this-computer": {
    type: "packet-highway-this-computer",
    label: "this computer only",
    score: 0.45,
    note: "Endpoint capture: this can explain traffic visible from this computer, not whole-network coverage.",
  },
  "gateway-router": {
    type: "packet-highway-gateway-router",
    label: "gateway/router",
    score: 0.65,
    note: "Gateway/router capture: broader than one endpoint, but still limited to the captured interface and time window.",
  },
  "mirror-tap": {
    type: "packet-highway-mirror-tap",
    label: "mirror/tap",
    score: 0.7,
    note: "Mirror/tap capture: may observe a network segment, but this metadata alone does not prove complete network coverage.",
  },
  unknown: {
    type: "packet-highway-unknown",
    label: "unknown",
    score: 0.25,
    note: "Unknown capture vantage: use only as visual context, not absence or whole-network evidence.",
  },
};

export function adaptPacketHighwayCaptureToObservationBundleV1(
  input: PacketHighwayObservationInput
): ObservationBundleV1 {
  const vantageDetails = VANTAGE_DETAILS[input.collectionVantage];
  if (!vantageDetails) {
    throw new Error("Packet Highway collection vantage is required before saving.");
  }

  const capture = parseNormalizedCaptureFixture(JSON.stringify(input.capture));
  const networkName = safeText(input.site.networkName, 120) || "packet-highway-site";
  const networkScope = safeTextOrNull(input.site.networkScope, 120);
  const siteId = safeId(
    input.site.siteId,
    `site-${hashString(networkName.toLowerCase()).slice(0, 12)}`
  );
  const generatedAt = toIsoString(input.generatedAt) ?? capture.meta.generatedAt;
  const observedStart = capture.meta.startTime ?? capture.meta.generatedAt;
  const observedEnd = capture.meta.endTime ?? capture.meta.startTime ?? capture.meta.generatedAt;
  const captureHash = hashString(
    stableStringify({ capture, siteId, networkName, networkScope, vantage: input.collectionVantage })
  );
  const coverage = buildPacketHighwayCoverage(capture, input.collectionVantage);

  return sanitizeObservationBundleV1({
    schemaVersion: "psec.observation-bundle.v1",
    observationId: `obs-packet-highway-${captureHash.slice(0, 24)}`,
    site: {
      siteId,
      networkName,
      networkScope,
    },
    collector: {
      collectorId: "packet-highway",
      kind: "packet-highway-analysis",
      name: "Packet Highway traffic visualizer",
      version: "v1",
    },
    batch: {
      batchId: `batch-packet-highway-${captureHash.slice(0, 24)}`,
      sourceRunUid: `packet-highway-${captureHash.slice(0, 24)}`,
      startedAt: observedStart,
      endedAt: observedEnd,
      generatedAt,
      partial: true,
      notes: coverage.notes.slice(0, 8),
    },
    sources: [
      {
        sourceId: PACKET_HIGHWAY_SOURCE_ID,
        kind: "packet-highway-analysis",
        artifactLabel: "packet_highway_analysis",
        fileName: capture.meta.fileName,
        parsed: true,
        recordCount:
          capture.devices.length +
          capture.flows.length +
          capture.dnsQueries.length +
          capture.alerts.length,
        notes: [
          "Saved normalized Packet Highway metadata only; no raw capture file or packet payload is stored.",
          "Traffic flows are visual evidence and are not converted into open-service claims.",
        ],
      },
    ],
    vantage: {
      type: vantageDetails.type,
      runType: `packet-highway:${vantageDetails.label}`,
      networkName,
      collectorHost: null,
      target: networkScope,
      notes: [
        vantageDetails.note,
        "Packet Highway evidence is supplemental and must not replace scan, gateway, or discovery evidence.",
      ],
    },
    coverage,
    devices: capture.devices
      .filter((device) => device.role !== "broadcast")
      .map((device) => packetDeviceToObservationDevice(device, observedStart, observedEnd)),
    supplementalEvidence: [
      {
        evidenceId: `phe-${captureHash.slice(0, 16)}`,
        kind: "packet-highway-analysis",
        label: "Packet Highway visual evidence",
        summary:
          "Supplemental traffic visualization metadata. Use it to inspect what this capture saw, not to infer ownership, safety, or complete coverage.",
        packetHighway: {
          capture,
          canSupport: [
            "Visual drill-down into normalized devices, flows, DNS names, watch items, timing, and parser limits from the saved analysis.",
            "Context for traffic observed from the selected collection vantage and capture window.",
          ],
          cannotProve: [
            "It cannot prove complete network inventory or absence of devices outside the captured vantage and time window.",
            "It cannot prove device ownership, user intent, safety, compromise, or causality for Network Activity changes.",
          ],
          limitations: coverage.notes,
        },
      },
    ],
    notes: [
      "Packet Highway observation is supplemental metadata-only evidence.",
      "No raw PCAP, PCAPNG, packet payload, capture buffer, or absolute local path is retained.",
    ],
  });
}

export function isPacketHighwayObservationEntry(entry: ObservationRegistryEntry): boolean {
  return (
    entry.sources.some((source) => source.kind === "packet-highway-analysis") ||
    entry.vantage.type.startsWith("packet-highway-")
  );
}

export function isPacketHighwayObservationBundle(bundle: ObservationBundleV1): boolean {
  return (
    bundle.collector.kind === "packet-highway-analysis" ||
    bundle.sources.some((source) => source.kind === "packet-highway-analysis") ||
    bundle.vantage.type.startsWith("packet-highway-")
  );
}

function packetDeviceToObservationDevice(
  device: TrafficDevice,
  observedStart: string | null,
  observedEnd: string | null
): ObservationDevice {
  const identityEvidence: DeviceIdentityEvidence[] = [];
  const deviceId = `dev-ph-${hashString(
    stableStringify({ id: device.id, mac: device.mac, ips: device.ips })
  ).slice(0, 12)}`;

  for (const ip of device.ips) {
    identityEvidence.push(evidence("ip-address", ip));
  }
  if (device.mac) {
    identityEvidence.push(evidence("mac-address", device.mac));
  }
  if (device.vendor) {
    identityEvidence.push(evidence("vendor", device.vendor, "reported"));
  }

  return {
    deviceId,
    firstSeen: device.firstSeen ?? observedStart,
    lastSeen: device.lastSeen ?? observedEnd,
    ips: device.ips,
    macs: device.mac ? [device.mac] : [],
    hostnames: [],
    vendors: device.vendor ? [device.vendor] : [],
    identityEvidence,
    openPorts: [],
    notes: [
      `${device.role} observed in Packet Highway metadata with ${device.packetsSent + device.packetsReceived} packets.`,
      "Traffic participation only; no open service, ownership, or safety verdict is inferred.",
    ],
  };
}

function evidence(
  kind: DeviceIdentityEvidence["kind"],
  value: string,
  confidence: DeviceIdentityEvidence["confidence"] = "observed"
): DeviceIdentityEvidence {
  return {
    evidenceId: `ev-ph-${hashString(`${kind}|${value}`).slice(0, 12)}`,
    kind,
    value,
    sourceId: PACKET_HIGHWAY_SOURCE_ID,
    confidence,
  };
}

function buildPacketHighwayCoverage(
  capture: NormalizedCapture,
  vantage: PacketHighwayCollectionVantage
): CoverageRecord {
  const details = VANTAGE_DETAILS[vantage];
  const presentSources = ["packet_highway_analysis", "collection_vantage", "parser_limits"];
  if (capture.meta.startTime || capture.meta.endTime || capture.meta.durationMs !== null) {
    presentSources.push("capture_timing");
  }

  const missingSources = PACKET_HIGHWAY_EXPECTED_SOURCES.filter(
    (source) => !presentSources.includes(source)
  );
  const notes = [
    "Packet Highway evidence is supplemental metadata and is not primary scan, gateway, or discovery evidence.",
    details.note,
    capture.meta.durationMs !== null
      ? `Capture duration: ${Math.round(capture.meta.durationMs / 1000)} seconds.`
      : "Capture duration was not available in the normalized analysis.",
    `Supported normalized metadata: ${capture.devices.length} devices, ${capture.flows.length} flows, ${capture.dnsQueries.length} DNS names, ${capture.alerts.length} watch items.`,
  ];

  let score = details.score;
  if (capture.meta.truncated) {
    score -= 0.15;
    notes.push("Partial analysis flag is set; parser or output caps limited the saved metadata.");
  }
  if (capture.meta.ignoredPackets > 0) {
    score -= 0.05;
    notes.push(`${capture.meta.ignoredPackets} packets were ignored because they were unsupported or unparseable.`);
  }
  if (missingSources.includes("capture_timing")) {
    score -= 0.1;
  }

  const roundedScore = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  return {
    status: roundedScore < 0.35 ? "minimal" : "partial",
    score: roundedScore,
    expectedSources: PACKET_HIGHWAY_EXPECTED_SOURCES,
    presentSources,
    missingSources,
    notes,
  };
}

function safeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function safeTextOrNull(value: unknown, maxLength: number): string | null {
  const clean = safeText(value, maxLength);
  return clean || null;
}

function safeId(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const clean = value
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return clean || fallback;
}

function toIsoString(value: string | Date | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}