import * as fs from "fs";
import * as path from "path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { getRunByUid, type RunManifest } from "./run-registry";
import { hashString } from "@/lib/utils/hash";
import type {
  CollectionVantage,
  CoverageRecord,
  DeviceIdentityEvidence,
  ObservationBatch,
  ObservationBundleV1,
  ObservationCoverageStatus,
  ObservationDevice,
  ObservationEvidenceConfidence,
  ObservationEvidenceKind,
  ObservationOpenPort,
  ObservationSourceKind,
  ObservationSourceRef,
} from "@/lib/types/observation-bundle";

export const MAX_OBSERVATION_BUNDLE_JSON_BYTES = 1024 * 1024;
export const MAX_OBSERVATION_NMAP_XML_BYTES = 5 * 1024 * 1024;
export const MAX_OBSERVATION_HOSTS_UP_BYTES = 1024 * 1024;
export const MAX_OBSERVATION_ARP_SNAPSHOT_BYTES = 1024 * 1024;

const SCHEMA_VERSION = "psec.observation-bundle.v1" as const;
const MAX_SOURCES = 50;
const MAX_DEVICES = 1000;
const MAX_EVIDENCE_PER_DEVICE = 40;
const MAX_OPEN_PORTS_PER_DEVICE = 256;
const MAX_NOTES = 50;
const MAX_SCAN_METADATA_BYTES = 128 * 1024;

const CORE_NMAP_LABELS = ["ports", "discovery"] as const;
const EXTRA_NMAP_LABELS = ["http_titles", "infra_services", "gateway_smoke"] as const;
const EXPECTED_SOURCE_LABELS = [
  "ports",
  "discovery",
  "hosts_up",
  "arp_snapshot",
  "scan_metadata",
];
const COVERAGE_WEIGHTS: Record<string, number> = {
  ports: 0.35,
  discovery: 0.25,
  hosts_up: 0.2,
  arp_snapshot: 0.15,
  scan_metadata: 0.05,
};
const MINIMAL_COVERAGE_SCORE = 0.35;
const COMPLETE_COVERAGE_SCORE = 0.85;

export class ObservationBundleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObservationBundleValidationError";
  }
}

export function isObservationBundleValidationError(
  error: unknown
): error is ObservationBundleValidationError {
  return (
    error instanceof ObservationBundleValidationError ||
    (error instanceof Error && error.name === "ObservationBundleValidationError")
  );
}

class ObservationArtifactReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObservationArtifactReadError";
  }
}

function isObservationArtifactReadError(error: unknown): error is ObservationArtifactReadError {
  return (
    error instanceof ObservationArtifactReadError ||
    (error instanceof Error && error.name === "ObservationArtifactReadError")
  );
}

interface AdaptRunOptions {
  generatedAt?: string;
}

interface ParsedNmapHost {
  ips: string[];
  macs: string[];
  hostnames: string[];
  vendors: string[];
  openPorts: ObservationOpenPort[];
}

interface ParsedScanMetadata {
  target: string | null;
  collectorHost: string | null;
  startedAt: string | null;
  endedAt: string | null;
  collectorVersion: string | null;
  notes: string[];
}

interface DeviceAccumulator {
  key: string;
  ips: Set<string>;
  macs: Set<string>;
  hostnames: Set<string>;
  vendors: Set<string>;
  evidence: Map<string, DeviceIdentityEvidence>;
  openPorts: Map<string, ObservationOpenPort>;
  firstSeen: string | null;
  lastSeen: string | null;
  notes: Set<string>;
}

type XmlRecord = Record<string, unknown>;

export function buildObservationBundleV1FromRun(
  runUid: string,
  options: AdaptRunOptions = {}
): ObservationBundleV1 | null {
  const manifest = getRunByUid(runUid);
  if (!manifest) return null;
  return adaptRunManifestToObservationBundleV1(manifest, options);
}

export function adaptRunManifestToObservationBundleV1(
  manifest: RunManifest,
  options: AdaptRunOptions = {}
): ObservationBundleV1 {
  const generatedAt = toIsoString(options.generatedAt) ?? new Date().toISOString();
  const runStartedAt = toIsoString(manifest.timestamp);
  const sources: ObservationSourceRef[] = [];
  const sourceLabelsPresent = new Set<string>();
  const coverageNotes: string[] = [];
  const bundleNotes: string[] = [];
  const deviceIndex = createDeviceIndex(runStartedAt);
  let sourceSeq = 0;

  const addSource = (
    kind: ObservationSourceKind,
    artifactLabel: string,
    filePath: string | null,
    parsed: boolean,
    recordCount: number,
    notes: string[] = []
  ): ObservationSourceRef => {
    const source: ObservationSourceRef = {
      sourceId: `src-${++sourceSeq}`,
      kind,
      artifactLabel,
      fileName: filePath ? safeBasename(filePath) : null,
      parsed,
      recordCount: Math.max(0, Math.floor(recordCount)),
      notes: notes.map((note) => safeText(note, 240)).filter(Boolean),
    };
    sources.push(source);
    if (parsed) {
      sourceLabelsPresent.add(coverageLabelForSource(artifactLabel));
    }
    return source;
  };

  addSource("run-manifest", "run_manifest", null, true, 1);

  let metadata: ParsedScanMetadata = {
    target: null,
    collectorHost: null,
    startedAt: null,
    endedAt: null,
    collectorVersion: null,
    notes: [],
  };
  const metadataPath = findScanMetadataPath(manifest);
  if (metadataPath) {
    metadata = readScanMetadata(metadataPath);
    const metadataNotes = metadata.notes.length > 0 ? metadata.notes : [];
    addSource(
      "scan-metadata",
      "scan_metadata",
      metadataPath,
      metadata.notes.length === 0,
      metadata.notes.length === 0 ? 1 : 0,
      metadataNotes
    );
  }

  for (const label of [...CORE_NMAP_LABELS, ...EXTRA_NMAP_LABELS]) {
    const xmlPaths = xmlFiles(manifest.keyFiles[label] || []);
    for (const xmlPath of xmlPaths) {
      const source = addSource("nmap-xml", label, xmlPath, false, 0);
      try {
        const hosts = parseNmapHosts(xmlPath, source.sourceId);
        source.parsed = true;
        source.recordCount = hosts.length;
        sourceLabelsPresent.add(coverageLabelForSource(label));
        for (const host of hosts) {
          mergeHostObservation(deviceIndex, host, source.sourceId, "observed", runStartedAt);
        }
      } catch (error) {
        const note = isObservationArtifactReadError(error)
          ? error.message
          : "Nmap XML could not be parsed.";
        source.notes.push(note);
        coverageNotes.push(`${label} was present but could not be parsed.`);
      }
    }
  }

  const hostsUpPath = firstExistingFile(manifest.keyFiles.hosts_up || []);
  if (hostsUpPath) {
    const source = addSource("hosts-up", "hosts_up", hostsUpPath, false, 0);
    try {
      const ips = parseHostsUp(hostsUpPath);
      source.parsed = true;
      source.recordCount = ips.length;
      sourceLabelsPresent.add("hosts_up");
      for (const ip of ips) {
        const host: ParsedNmapHost = {
          ips: [ip],
          macs: [],
          hostnames: [],
          vendors: [],
          openPorts: [],
        };
        mergeHostObservation(deviceIndex, host, source.sourceId, "reported", runStartedAt, [
          { kind: "host-up", value: ip, confidence: "reported" },
        ]);
      }
    } catch (error) {
      const note = isObservationArtifactReadError(error)
        ? error.message
        : "hosts_up.txt could not be parsed.";
      source.notes.push(note);
      coverageNotes.push(note);
    }
  }

  for (const arpPath of arpSnapshotFiles(manifest.keyFiles.snapshots || [])) {
    const source = addSource("arp-snapshot", "arp_snapshot", arpPath, false, 0);
    try {
      const pairs = parseArpSnapshot(arpPath);
      source.parsed = true;
      source.recordCount = pairs.length;
      sourceLabelsPresent.add("arp_snapshot");
      for (const pair of pairs) {
        const host: ParsedNmapHost = {
          ips: [pair.ip],
          macs: [pair.mac],
          hostnames: [],
          vendors: [],
          openPorts: [],
        };
        mergeHostObservation(deviceIndex, host, source.sourceId, "observed", runStartedAt, [
          {
            kind: "arp-neighbor",
            value: `${pair.ip} ${pair.mac}`,
            confidence: "observed",
          },
        ]);
      }
    } catch (error) {
      const note = isObservationArtifactReadError(error)
        ? error.message
        : "ARP snapshot could not be parsed.";
      source.notes.push(note);
      coverageNotes.push(note);
    }
  }

  for (const label of EXPECTED_SOURCE_LABELS) {
    if (!sourceLabelsPresent.has(label)) {
      coverageNotes.push(missingCoverageNote(label));
    }
  }

  const observedStart = metadata.startedAt ?? runStartedAt;
  const observedEnd = metadata.endedAt ?? metadata.startedAt ?? runStartedAt;
  const coverage = buildCoverage(sourceLabelsPresent, coverageNotes);
  const partial = coverage.status !== "complete" || coverage.missingSources.length > 0;
  if (partial) {
    bundleNotes.push("Observation is partial because one or more expected optional artifacts were unavailable or unparsed.");
  }

  const bundle: ObservationBundleV1 = {
    schemaVersion: SCHEMA_VERSION,
    observationId: `obs-${safeId(manifest.runUid, "run").slice(0, 90)}`,
    site: {
      siteId: `site-${hashString(manifest.network || "unknown").slice(0, 12)}`,
      networkName: safeText(manifest.network, 120) || "unknown",
      networkScope: metadata.target,
    },
    collector: {
      collectorId: "psec-baseline-hunter",
      kind: "registered-scan-run",
      name: "PSEC Baseline Hunter scan registry",
      version: metadata.collectorVersion,
    },
    batch: buildBatch(manifest, observedStart, observedEnd, generatedAt, partial, coverage.notes),
    sources,
    vantage: buildVantage(manifest, metadata),
    coverage,
    devices: deviceIndexToDevices(deviceIndex),
    notes: bundleNotes,
  };

  return sanitizeObservationBundleV1(bundle);
}

export function parseObservationBundleV1Json(jsonText: string): ObservationBundleV1 {
  if (Buffer.byteLength(jsonText, "utf-8") > MAX_OBSERVATION_BUNDLE_JSON_BYTES) {
    throw new ObservationBundleValidationError("Observation bundle JSON is too large.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new ObservationBundleValidationError("This file is not valid JSON.");
  }

  return sanitizeObservationBundleV1(raw);
}

export function sanitizeObservationBundleV1(raw: unknown): ObservationBundleV1 {
  if (!isRecord(raw) || raw.schemaVersion !== SCHEMA_VERSION) {
    throw new ObservationBundleValidationError(
      "This JSON does not look like an Observation Bundle v1 export."
    );
  }

  const site = isRecord(raw.site) ? raw.site : null;
  const collector = isRecord(raw.collector) ? raw.collector : null;
  const batch = isRecord(raw.batch) ? raw.batch : null;
  const vantage = isRecord(raw.vantage) ? raw.vantage : null;
  const coverage = isRecord(raw.coverage) ? raw.coverage : null;

  if (!site || !collector || !batch || !vantage || !coverage) {
    throw new ObservationBundleValidationError("Observation bundle is missing required fields.");
  }
  if (!Array.isArray(raw.sources) || !Array.isArray(raw.devices)) {
    throw new ObservationBundleValidationError("Observation bundle has invalid source or device lists.");
  }

  const observationId = safeId(raw.observationId, "obs-unknown");
  const sources = raw.sources.slice(0, MAX_SOURCES).filter(isRecord).map(sanitizeSource);
  if (sources.length === 0) {
    throw new ObservationBundleValidationError("Observation bundle has no source records.");
  }
  const sourceIds = new Set(sources.map((source) => source.sourceId));
  const sanitizedCoverage = sanitizeCoverage(coverage);

  const devices = raw.devices
    .slice(0, MAX_DEVICES)
    .filter(isRecord)
    .map((device) => sanitizeDevice(device, sourceIds));

  const sanitized: ObservationBundleV1 = {
    schemaVersion: SCHEMA_VERSION,
    observationId,
    site: {
      siteId: safeId(site.siteId, "site-unknown"),
      networkName: safeText(site.networkName, 120) || "unknown",
      networkScope: safeTextOrNull(site.networkScope, 120),
    },
    collector: {
      collectorId: safeId(collector.collectorId, "collector-unknown"),
      kind: "registered-scan-run",
      name: safeText(collector.name, 120) || "PSEC Baseline Hunter",
      version: safeTextOrNull(collector.version, 80),
    },
    batch: {
      batchId: safeId(batch.batchId, "batch-unknown"),
      sourceRunUid: safeId(batch.sourceRunUid, "run-unknown"),
      startedAt: isoOrNull(batch.startedAt),
      endedAt: isoOrNull(batch.endedAt),
      generatedAt: isoOrNull(batch.generatedAt) ?? new Date().toISOString(),
      partial:
        batch.partial === true ||
        sanitizedCoverage.status !== "complete" ||
        sanitizedCoverage.missingSources.length > 0,
      notes: sanitizeNotes(batch.notes),
    },
    sources,
    vantage: {
      type: "active-scan-upload",
      runType: safeTextOrNull(vantage.runType, 80),
      networkName: safeText(vantage.networkName, 120) || "unknown",
      collectorHost: safeTextOrNull(vantage.collectorHost, 120),
      target: safeTextOrNull(vantage.target, 120),
      notes: sanitizeNotes(vantage.notes),
    },
    coverage: sanitizedCoverage,
    devices,
    notes: sanitizeNotes(raw.notes),
  };

  return sanitized;
}

function buildBatch(
  manifest: RunManifest,
  startedAt: string | null,
  endedAt: string | null,
  generatedAt: string,
  partial: boolean,
  notes: string[]
): ObservationBatch {
  return {
    batchId: `batch-${safeId(manifest.runUid, "run").slice(0, 90)}`,
    sourceRunUid: safeId(manifest.runUid, "run-unknown"),
    startedAt,
    endedAt,
    generatedAt,
    partial,
    notes: notes.slice(0, 8),
  };
}

function buildVantage(manifest: RunManifest, metadata: ParsedScanMetadata): CollectionVantage {
  return {
    type: "active-scan-upload",
    runType: safeTextOrNull(manifest.runType, 80),
    networkName: safeText(manifest.network, 120) || "unknown",
    collectorHost: metadata.collectorHost,
    target: metadata.target,
    notes: [
      "Adapted from an already registered scan run.",
      "Vantage describes scan context only; device ownership and intent are not inferred.",
    ],
  };
}

function buildCoverage(presentSources: Set<string>, notes: string[]): CoverageRecord {
  const uniqueNotes = uniqueStrings(notes).slice(0, MAX_NOTES);
  const score = EXPECTED_SOURCE_LABELS.reduce(
    (sum, label) => sum + (presentSources.has(label) ? COVERAGE_WEIGHTS[label] : 0),
    0
  );
  const roundedScore = Math.round(score * 100) / 100;
  const missingSources = EXPECTED_SOURCE_LABELS.filter((label) => !presentSources.has(label));
  const status = coverageStatusFor(roundedScore, missingSources);

  return {
    status,
    score: roundedScore,
    expectedSources: EXPECTED_SOURCE_LABELS,
    presentSources: EXPECTED_SOURCE_LABELS.filter((label) => presentSources.has(label)),
    missingSources,
    notes: uniqueNotes,
  };
}

function coverageStatusFor(score: number, missingSources: string[]): ObservationCoverageStatus {
  if (score < MINIMAL_COVERAGE_SCORE) return "minimal";
  if (missingSources.length === 0 && score >= COMPLETE_COVERAGE_SCORE) return "complete";
  return "partial";
}

function parseNmapHosts(xmlPath: string, sourceId: string): ParsedNmapHost[] {
  assertFileSize(
    xmlPath,
    MAX_OBSERVATION_NMAP_XML_BYTES,
    "Nmap XML exceeded the metadata size limit."
  );
  const xmlContent = fs.readFileSync(xmlPath, "utf-8");
  const validation = XMLValidator.validate(xmlContent);
  if (validation !== true) {
    throw new Error("invalid nmap xml");
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: false,
    isArray: (name) => ["host", "address", "hostname", "port"].includes(name),
  });
  const root = asRecord(parser.parse(xmlContent));
  const nmaprun = asRecord(root?.nmaprun);
  if (!nmaprun) return [];

  const hosts: ParsedNmapHost[] = [];
  for (const host of asRecordArray(nmaprun.host)) {
    const status = attr(asRecord(host.status), "@_state");
    if (status && status !== "up") continue;

    const ips: string[] = [];
    const macs: string[] = [];
    const vendors: string[] = [];
    for (const address of asRecordArray(host.address)) {
      const addrType = attr(address, "@_addrtype").toLowerCase();
      const addr = attr(address, "@_addr");
      if (addrType === "ipv4" && isIpv4(addr)) {
        ips.push(addr);
      }
      if (addrType === "mac") {
        const mac = normalizeMac(addr);
        if (mac) {
          macs.push(mac);
          const vendor = safeText(attr(address, "@_vendor"), 120);
          if (vendor) vendors.push(vendor);
        }
      }
    }

    const hostnames = asRecordArray(asRecord(host.hostnames)?.hostname)
      .map((hostname) => safeText(attr(hostname, "@_name"), 120))
      .filter(Boolean);

    const openPorts: ObservationOpenPort[] = [];
    for (const port of asRecordArray(asRecord(host.ports)?.port)) {
      const state = attr(asRecord(port.state), "@_state");
      if (state !== "open") continue;
      const portNumber = Number.parseInt(attr(port, "@_portid"), 10);
      if (!Number.isInteger(portNumber) || portNumber < 0 || portNumber > 65535) continue;
      const service = asRecord(port.service);
      openPorts.push({
        protocol: safeText(attr(port, "@_protocol"), 16) || "tcp",
        port: portNumber,
        state: "open",
        service: safeTextOrNull(attr(service, "@_name"), 80),
        product: safeTextOrNull(attr(service, "@_product"), 120),
        version: safeTextOrNull(attr(service, "@_version"), 80),
        sourceId,
      });
    }

    if (ips.length > 0 || macs.length > 0 || hostnames.length > 0 || openPorts.length > 0) {
      hosts.push({
        ips: uniqueStrings(ips),
        macs: uniqueStrings(macs),
        hostnames: uniqueStrings(hostnames),
        vendors: uniqueStrings(vendors),
        openPorts,
      });
    }
  }

  return hosts;
}

function parseHostsUp(filePath: string): string[] {
  assertFileSize(
    filePath,
    MAX_OBSERVATION_HOSTS_UP_BYTES,
    "hosts_up.txt exceeded the metadata size limit."
  );
  const content = fs.readFileSync(filePath, "utf-8");
  return uniqueStrings(
    content
      .split(/\r?\n/)
      .map((line) => line.replace(/^\uFEFF/, "").trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split(/\s+/)[0])
      .filter(isIpv4)
  );
}

function parseArpSnapshot(filePath: string): { ip: string; mac: string }[] {
  assertFileSize(
    filePath,
    MAX_OBSERVATION_ARP_SNAPSHOT_BYTES,
    "ARP snapshot exceeded the metadata size limit."
  );
  const content = fs.readFileSync(filePath, "utf-8");
  const pairs: { ip: string; mac: string }[] = [];
  const seen = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const ip = line.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0];
    const macMatch =
      line.match(/\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b/)?.[0] ??
      line.match(/\b[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\b/)?.[0];
    const mac = macMatch ? normalizeMac(macMatch) : null;
    if (!ip || !isIpv4(ip) || !mac) continue;
    const key = `${ip}|${mac}`;
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push({ ip, mac });
    }
  }
  return pairs;
}

function readScanMetadata(filePath: string): ParsedScanMetadata {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_SCAN_METADATA_BYTES) {
    return {
      target: null,
      collectorHost: null,
      startedAt: null,
      endedAt: null,
      collectorVersion: null,
      notes: ["scan_metadata.json exceeded the metadata size limit."],
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const record = isRecord(raw) ? raw : {};
    return {
      target: firstSafeString(record, ["target", "targets", "scanTarget", "cidr", "subnet", "network"]),
      collectorHost: firstSafeString(record, ["collectorHost", "scannerHost", "host", "hostname"]),
      startedAt: firstIso(record, ["startedAt", "startTime", "started_at", "timestamp"]),
      endedAt: firstIso(record, ["endedAt", "endTime", "ended_at", "finishedAt"]),
      collectorVersion: firstSafeString(record, ["collectorVersion", "scriptVersion", "scannerVersion", "version"]),
      notes: [],
    };
  } catch {
    return {
      target: null,
      collectorHost: null,
      startedAt: null,
      endedAt: null,
      collectorVersion: null,
      notes: ["scan_metadata.json could not be parsed."],
    };
  }
}

function createDeviceIndex(defaultSeenAt: string | null) {
  const devices = new Map<string, DeviceAccumulator>();
  const ipIndex = new Map<string, string>();
  const macIndex = new Map<string, string>();

  const create = (seed: string): DeviceAccumulator => {
    const key = `dev-${hashString(seed).slice(0, 12)}`;
    const device: DeviceAccumulator = {
      key,
      ips: new Set(),
      macs: new Set(),
      hostnames: new Set(),
      vendors: new Set(),
      evidence: new Map(),
      openPorts: new Map(),
      firstSeen: defaultSeenAt,
      lastSeen: defaultSeenAt,
      notes: new Set(),
    };
    devices.set(key, device);
    return device;
  };

  return {
    devices,
    ipIndex,
    macIndex,
    create,
  };
}

function mergeHostObservation(
  index: ReturnType<typeof createDeviceIndex>,
  host: ParsedNmapHost,
  sourceId: string,
  confidence: ObservationEvidenceConfidence,
  seenAt: string | null,
  extraEvidence: Array<{
    kind: ObservationEvidenceKind;
    value: string;
    confidence: ObservationEvidenceConfidence;
  }> = []
): void {
  const existingKeys = [
    ...host.macs.map((mac) => index.macIndex.get(mac)).filter((key): key is string => Boolean(key)),
    ...host.ips.map((ip) => index.ipIndex.get(ip)).filter((key): key is string => Boolean(key)),
  ];
  const primaryKey = existingKeys[0];
  let device = primaryKey ? index.devices.get(primaryKey) : null;
  if (!device) {
    const seed = host.macs[0] ?? host.ips[0] ?? `${sourceId}-${index.devices.size}`;
    device = index.create(seed);
  }

  for (const key of uniqueStrings(existingKeys).filter((key) => key !== device.key)) {
    const other = index.devices.get(key);
    if (other) {
      mergeDeviceAccumulators(device, other);
      repointDeviceIndexes(index, other, device.key);
      index.devices.delete(key);
    }
  }

  touchSeen(device, seenAt);
  for (const ip of host.ips) {
    device.ips.add(ip);
    index.ipIndex.set(ip, device.key);
    addEvidence(device, "ip-address", ip, sourceId, confidence);
  }
  for (const mac of host.macs) {
    device.macs.add(mac);
    index.macIndex.set(mac, device.key);
    addEvidence(device, "mac-address", mac, sourceId, confidence);
  }
  for (const hostname of host.hostnames) {
    device.hostnames.add(hostname);
    addEvidence(device, "hostname", hostname, sourceId, "reported");
  }
  for (const vendor of host.vendors) {
    device.vendors.add(vendor);
    addEvidence(device, "vendor", vendor, sourceId, "reported");
  }
  for (const evidence of extraEvidence) {
    addEvidence(device, evidence.kind, evidence.value, sourceId, evidence.confidence);
  }
  for (const port of host.openPorts) {
    const key = `${port.protocol}:${port.port}:${port.service ?? ""}:${port.product ?? ""}:${port.version ?? ""}:${port.sourceId}`;
    device.openPorts.set(key, port);
  }
}

function repointDeviceIndexes(
  index: ReturnType<typeof createDeviceIndex>,
  source: DeviceAccumulator,
  targetKey: string
): void {
  for (const ip of source.ips) {
    index.ipIndex.set(ip, targetKey);
  }
  for (const mac of source.macs) {
    index.macIndex.set(mac, targetKey);
  }
}
function mergeDeviceAccumulators(target: DeviceAccumulator, source: DeviceAccumulator): void {
  for (const value of source.ips) target.ips.add(value);
  for (const value of source.macs) target.macs.add(value);
  for (const value of source.hostnames) target.hostnames.add(value);
  for (const value of source.vendors) target.vendors.add(value);
  for (const [key, value] of source.evidence) target.evidence.set(key, value);
  for (const [key, value] of source.openPorts) target.openPorts.set(key, value);
  for (const value of source.notes) target.notes.add(value);
  if (source.firstSeen && (!target.firstSeen || source.firstSeen < target.firstSeen)) {
    target.firstSeen = source.firstSeen;
  }
  if (source.lastSeen && (!target.lastSeen || source.lastSeen > target.lastSeen)) {
    target.lastSeen = source.lastSeen;
  }
}

function deviceIndexToDevices(index: ReturnType<typeof createDeviceIndex>): ObservationDevice[] {
  return [...index.devices.values()]
    .sort((a, b) => firstSortValue(a).localeCompare(firstSortValue(b)))
    .map((device) => ({
      deviceId: device.key,
      firstSeen: device.firstSeen,
      lastSeen: device.lastSeen,
      ips: [...device.ips].sort(),
      macs: [...device.macs].sort(),
      hostnames: [...device.hostnames].sort(),
      vendors: [...device.vendors].sort(),
      identityEvidence: [...device.evidence.values()].slice(0, MAX_EVIDENCE_PER_DEVICE),
      openPorts: [...device.openPorts.values()]
        .sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol))
        .slice(0, MAX_OPEN_PORTS_PER_DEVICE),
      notes: [...device.notes].slice(0, 10),
    }));
}

function firstSortValue(device: DeviceAccumulator): string {
  return [...device.ips][0] ?? [...device.macs][0] ?? [...device.hostnames][0] ?? device.key;
}

function touchSeen(device: DeviceAccumulator, seenAt: string | null): void {
  if (!seenAt) return;
  if (!device.firstSeen || seenAt < device.firstSeen) device.firstSeen = seenAt;
  if (!device.lastSeen || seenAt > device.lastSeen) device.lastSeen = seenAt;
}

function addEvidence(
  device: DeviceAccumulator,
  kind: ObservationEvidenceKind,
  value: string,
  sourceId: string,
  confidence: ObservationEvidenceConfidence
): void {
  const cleanValue = safeText(value, 160);
  if (!cleanValue) return;
  const evidenceKey = `${kind}|${cleanValue}|${sourceId}`;
  if (device.evidence.has(evidenceKey)) return;
  device.evidence.set(evidenceKey, {
    evidenceId: `ev-${hashString(evidenceKey).slice(0, 12)}`,
    kind,
    value: cleanValue,
    sourceId,
    confidence,
  });
}

function sanitizeSource(raw: Record<string, unknown>): ObservationSourceRef {
  const kind = SOURCE_KIND_SET.has(raw.kind as ObservationSourceKind)
    ? (raw.kind as ObservationSourceKind)
    : "run-manifest";
  return {
    sourceId: safeId(raw.sourceId, "src-unknown"),
    kind,
    artifactLabel: safeText(raw.artifactLabel, 80) || "unknown",
    fileName: sanitizeFileName(raw.fileName),
    parsed: raw.parsed === true,
    recordCount: nonNegativeInteger(raw.recordCount),
    notes: sanitizeNotes(raw.notes),
  };
}

function sanitizeDevice(raw: Record<string, unknown>, sourceIds: Set<string>): ObservationDevice {
  const identityEvidence = Array.isArray(raw.identityEvidence)
    ? raw.identityEvidence
        .filter(isRecord)
        .map((evidence) => sanitizeEvidence(evidence, sourceIds))
        .filter((evidence): evidence is DeviceIdentityEvidence => evidence !== null)
        .slice(0, MAX_EVIDENCE_PER_DEVICE)
    : [];

  const openPorts = Array.isArray(raw.openPorts)
    ? raw.openPorts
        .filter(isRecord)
        .map((port) => sanitizeOpenPort(port, sourceIds))
        .filter((port): port is ObservationOpenPort => port !== null)
        .slice(0, MAX_OPEN_PORTS_PER_DEVICE)
    : [];

  return {
    deviceId: safeId(raw.deviceId, "dev-unknown"),
    firstSeen: isoOrNull(raw.firstSeen),
    lastSeen: isoOrNull(raw.lastSeen),
    ips: sanitizeStringArray(raw.ips, 45).filter(isIpv4),
    macs: sanitizeStringArray(raw.macs, 17).map(normalizeMac).filter((mac): mac is string => mac !== null),
    hostnames: sanitizeStringArray(raw.hostnames, 120),
    vendors: sanitizeStringArray(raw.vendors, 120),
    identityEvidence,
    openPorts,
    notes: sanitizeNotes(raw.notes),
  };
}

function sanitizeEvidence(
  raw: Record<string, unknown>,
  sourceIds: Set<string>
): DeviceIdentityEvidence | null {
  const kind = EVIDENCE_KIND_SET.has(raw.kind as ObservationEvidenceKind)
    ? (raw.kind as ObservationEvidenceKind)
    : null;
  const sourceId = safeId(raw.sourceId, "");
  const value = safeText(raw.value, 160);
  if (!kind || !sourceId || !sourceIds.has(sourceId) || !value) return null;
  const confidence = EVIDENCE_CONFIDENCE_SET.has(raw.confidence as ObservationEvidenceConfidence)
    ? (raw.confidence as ObservationEvidenceConfidence)
    : "weak";
  return {
    evidenceId: safeId(raw.evidenceId, `ev-${hashString(`${kind}|${value}|${sourceId}`).slice(0, 12)}`),
    kind,
    value,
    sourceId,
    confidence,
  };
}

function sanitizeOpenPort(
  raw: Record<string, unknown>,
  sourceIds: Set<string>
): ObservationOpenPort | null {
  const port = portInteger(raw.port);
  const sourceId = safeId(raw.sourceId, "");
  if (port === null || !sourceId || !sourceIds.has(sourceId)) return null;
  return {
    protocol: safeText(raw.protocol, 16) || "tcp",
    port,
    state: "open",
    service: safeTextOrNull(raw.service, 80),
    product: safeTextOrNull(raw.product, 120),
    version: safeTextOrNull(raw.version, 80),
    sourceId,
  };
}

function sanitizeCoverage(raw: Record<string, unknown>): CoverageRecord {
  const score =
    typeof raw.score === "number" && Number.isFinite(raw.score)
      ? Math.min(1, Math.max(0, Math.round(raw.score * 100) / 100))
      : 0;
  const expectedSources = sanitizeStringArray(raw.expectedSources, 80);
  const presentSources = sanitizeStringArray(raw.presentSources, 80);
  const declaredMissingSources = sanitizeStringArray(raw.missingSources, 80);
  const missingSources = uniqueStrings([
    ...declaredMissingSources,
    ...expectedSources.filter((label) => !presentSources.includes(label)),
  ]);
  const status = coverageStatusFor(score, missingSources);

  return {
    status,
    score,
    expectedSources,
    presentSources,
    missingSources,
    notes: sanitizeNotes(raw.notes),
  };
}

function assertFileSize(filePath: string, maxBytes: number, message: string): void {
  const stat = fs.statSync(filePath);
  if (stat.size > maxBytes) {
    throw new ObservationArtifactReadError(message);
  }
}
function findScanMetadataPath(manifest: RunManifest): string | null {
  const candidate = path.join(manifest.runFolder, "scan_metadata.json");
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
}

function xmlFiles(files: string[]): string[] {
  return files.filter((file) => file.toLowerCase().endsWith(".xml") && fs.existsSync(file));
}

function firstExistingFile(files: string[]): string | null {
  return files.find((file) => fs.existsSync(file) && fs.statSync(file).isFile()) ?? null;
}

function arpSnapshotFiles(files: string[]): string[] {
  return files.filter((file) => {
    const base = path.basename(file).toLowerCase();
    return base.startsWith("arp") && fs.existsSync(file) && fs.statSync(file).isFile();
  });
}

function coverageLabelForSource(label: string): string {
  if (label === "ports") return "ports";
  if (label === "discovery") return "discovery";
  if (label === "hosts_up") return "hosts_up";
  if (label === "arp_snapshot") return "arp_snapshot";
  if (label === "scan_metadata") return "scan_metadata";
  return label;
}

function missingCoverageNote(label: string): string {
  switch (label) {
    case "ports":
      return "No ports XML was available; open-port observations are incomplete.";
    case "discovery":
      return "No discovery XML was available; host identity coverage is reduced.";
    case "hosts_up":
      return "No hosts_up.txt was available; live-host count evidence is reduced.";
    case "arp_snapshot":
      return "No ARP snapshot was available; IP-to-MAC identity evidence is reduced.";
    case "scan_metadata":
      return "No scan_metadata.json was available; scan target and collector metadata are unknown.";
    default:
      return `${label} was unavailable.`;
  }
}

function firstSafeString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = safeTextOrNull(record[key], 120);
    if (direct) return direct;
    if (Array.isArray(record[key])) {
      const joined = record[key]
        .filter((value): value is string => typeof value === "string")
        .map((value) => safeText(value, 60))
        .filter(Boolean)
        .join(", ");
      if (joined) return joined.slice(0, 120);
    }
  }
  return null;
}

function firstIso(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const iso = isoOrNull(record[key]);
    if (iso) return iso;
  }
  return null;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return isoOrNull(value);
}

function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function asRecord(value: unknown): XmlRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as XmlRecord)
    : null;
}

function asRecordArray(value: unknown): XmlRecord[] {
  if (Array.isArray(value)) return value.map(asRecord).filter((item): item is XmlRecord => item !== null);
  const record = asRecord(value);
  return record ? [record] : [];
}

function attr(record: XmlRecord | null, name: string): string {
  const value = record?.[name];
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

function normalizeMac(value: string): string | null {
  const cleaned = value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (cleaned.length !== 12) return null;
  return cleaned.match(/.{2}/g)?.join(":") ?? null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function sanitizeNotes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((note): note is string => typeof note === "string")
    .map((note) => safeText(note, 300))
    .filter(Boolean)
    .slice(0, MAX_NOTES);
}

function sanitizeStringArray(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => safeText(item, maxLength))
      .filter(Boolean)
  );
}

function sanitizeFileName(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const base = safeBasename(value);
  const clean = base.replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  return clean && !looksUnsafe(clean) ? clean : null;
}

function safeBasename(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? "artifact";
  return base.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "artifact";
}

function safeId(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed || looksUnsafe(trimmed)) return fallback;

  const clean = trimmed.replace(/[^a-zA-Z0-9_.:-]/g, "-").replace(/-+/g, "-").slice(0, 120);
  if (!clean || looksUnsafe(clean) || looksLikeNormalizedRawCaptureOrScanId(clean)) {
    return fallback;
  }
  return clean;
}

function safeTextOrNull(value: unknown, maxLength: number): string | null {
  const clean = safeText(value, maxLength);
  return clean || null;
}

function safeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const clean = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  if (!clean || looksUnsafe(clean)) return "";
  return clean;
}

function looksUnsafe(value: string): boolean {
  return (
    looksLikeAbsolutePath(value) ||
    looksLikeSecret(value) ||
    looksLikeRawCaptureOrScanBody(value)
  );
}

function looksLikeAbsolutePath(value: string): boolean {
  return (
    /(?:^|[\s("'=])[A-Za-z]:[\\/][^\s"']*/.test(value) ||
    /(?:^|[\s("'=])\\\\[^\\\s]+\\[^\s"']+/.test(value) ||
    /(?:^|[\s("'=])\/[^\s"']+/.test(value)
  );
}

function looksLikeSecret(value: string): boolean {
  return (
    /\bsk-[A-Za-z0-9_-]{20,}\b/.test(value) ||
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/.test(value) ||
    /\bAKIA[0-9A-Z]{16}\b/.test(value) ||
    /BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY/.test(value) ||
    /\b(api[_-]?key|secret|password|token)\s*[:=]/i.test(value)
  );
}

function looksLikeRawCaptureOrScanBody(value: string): boolean {
  return /<\??xml\b|<nmaprun\b|<host\b|<packet\b|pcap(?:ng)?\s+global\s+header|\b(?:starting\s+nmap|nmap\s+scan\s+report\s+for|port\s+state\s+service|raw\s+packets\s+sent)\b|(?:^|\s)(?:IP|TCP|UDP|ICMP)\s+[^\r\n]{1,160}\s+>/i.test(value);
}

function looksLikeNormalizedRawCaptureOrScanId(value: string): boolean {
  return /(?:^|[-_.:])nmaprun(?:$|[-_.:])|(?:^|[-_.:])pcap(?:ng)?[-_.:]global[-_.:]header(?:$|[-_.:])|(?:^|[-_.:])host[-_.:]address[-_.:]addr(?:$|[-_.:])|(?:^|[-_.:])port[-_.:]state[-_.:]service(?:$|[-_.:])/i.test(value);
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function portInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 65535
    ? value
    : null;
}

const SOURCE_KIND_SET = new Set<ObservationSourceKind>([
  "run-manifest",
  "nmap-xml",
  "hosts-up",
  "arp-snapshot",
  "scan-metadata",
]);
const EVIDENCE_KIND_SET = new Set<ObservationEvidenceKind>([
  "ip-address",
  "mac-address",
  "hostname",
  "vendor",
  "host-up",
  "arp-neighbor",
]);
const EVIDENCE_CONFIDENCE_SET = new Set<ObservationEvidenceConfidence>([
  "observed",
  "reported",
  "weak",
]);
