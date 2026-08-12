import * as fs from "fs";
import * as path from "path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { getRunByUid, type RunManifest } from "./run-registry";
import { parseNormalizedCaptureFixture } from "./capture-upload-safety";
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
  ObservationIdentityReasonCode,
  ObservationIdentityRecord,
  ObservationNormalizationLoss,
  ObservationNormalizationReasonCode,
  ObservationOpenPort,
  ObservationPortCoverage,
  ObservationPortRange,
  ObservationSourceKind,
  ObservationSourceRef,
  ObservationSupplementalEvidence,
} from "@/lib/types/observation-bundle";
import type { NormalizedCapture } from "@/lib/types/packet-highway";

export const MAX_OBSERVATION_BUNDLE_JSON_BYTES = 1024 * 1024;
export const MAX_OBSERVATION_NMAP_XML_BYTES = 5 * 1024 * 1024;
export const MAX_OBSERVATION_HOSTS_UP_BYTES = 1024 * 1024;
export const MAX_OBSERVATION_ARP_SNAPSHOT_BYTES = 1024 * 1024;

const SCHEMA_VERSION = "psec.observation-bundle.v1" as const;
const MAX_SOURCES = 50;
const MAX_DEVICES = 1000;
const MAX_EVIDENCE_PER_DEVICE = 40;
const MAX_OPEN_PORTS_PER_DEVICE = 256;
const MAX_PORT_COVERAGE_PER_DEVICE = 50;
const MAX_PORT_RANGES_PER_COVERAGE = 512;
const MAX_NOTES = 50;
const MAX_SUPPLEMENTAL_EVIDENCE = 5;
const MAX_SCAN_METADATA_BYTES = 128 * 1024;
const OPEN_PORT_PROTOCOL_SET = new Set(["tcp", "udp", "sctp", "ip"]);

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
  /** True only when usable states account for the full declared scan range. */
  hasPortStateEvidence?: boolean;
}

interface ParsedNmapArtifact {
  hosts: ParsedNmapHost[];
  portScanRanges: Array<{
    protocol: string;
    ranges: ObservationPortRange[];
  }>;
  completionStatus: "success" | "failed" | "unknown";
  targetScopes: string[];
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
  /** Once identifiers conflict, later records cannot safely enrich this aggregate. */
  identityConflicted: boolean;
  ips: Set<string>;
  macs: Set<string>;
  hostnames: Set<string>;
  vendors: Set<string>;
  evidence: Map<string, DeviceIdentityEvidence>;
  openPorts: Map<string, ObservationOpenPort>;
  portCoverage: Map<string, ObservationPortCoverage>;
  firstSeen: string | null;
  lastSeen: string | null;
  notes: Set<string>;
}

interface NormalizationCollector {
  losses: ObservationNormalizationLoss[];
  inheritedReasonCodes: Set<ObservationNormalizationReasonCode>;
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
  // Anchor generatedAt to stable, run-derived values so adapting the same
  // registered run is deterministic. Re-uploading a duplicate scan then yields
  // an identical bundle (and content hash), letting the observation registry
  // dedupe it instead of creating a repeated record. An explicit option still
  // wins; new Date() is only a last resort when no run timestamps exist.
  const generatedAt =
    toIsoString(options.generatedAt) ??
    toIsoString(manifest.timestamp) ??
    toIsoString(manifest.createdAt) ??
    new Date().toISOString();
  const runStartedAt = toIsoString(manifest.timestamp);
  const sources: ObservationSourceRef[] = [];
  const sourceLabelsPresent = new Set<string>();
  const unusableCoverageLabels = new Set<string>();
  const coverageNotes: string[] = [];
  const coverageReasonCodes = new Set<NonNullable<CoverageRecord["reasonCodes"]>[number]>();
  const bundleNotes: string[] = [];
  const deviceIndex = createDeviceIndex(runStartedAt);
  const nmapTargetScopes = new Set<string>();
  const verifiedDiscoveryScopes = new Set<string>();
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
        const parsedArtifact = parseNmapHosts(xmlPath, source.sourceId);
        const hosts = parsedArtifact.hosts;
        for (const scope of parsedArtifact.targetScopes) {
          nmapTargetScopes.add(scope);
        }
        source.parsed = true;
        source.recordCount = hosts.length;
        source.targetScopes = parsedArtifact.targetScopes;
        source.completionStatus = parsedArtifact.completionStatus;
        const completed = parsedArtifact.completionStatus === "success";
        const targetRelationship = compareTargetScopes(
          metadata.target,
          parsedArtifact.targetScopes
        );
        if (targetRelationship === "conflicting") {
          coverageReasonCodes.add("target-provenance-conflict");
        }
        if (label === "discovery" && targetRelationship === "verified") {
          for (const scope of parsedArtifact.targetScopes) {
            verifiedDiscoveryScopes.add(scope);
          }
        }
        const supportsDeclaredCapability =
          completed &&
          (label === "discovery"
            ? targetRelationship === "verified"
            : label !== "ports" ||
              (parsedArtifact.portScanRanges.length > 0 &&
                hosts.some((host) => host.hasPortStateEvidence === true)));
        if (supportsDeclaredCapability) {
          sourceLabelsPresent.add(coverageLabelForSource(label));
        } else {
          unusableCoverageLabels.add(coverageLabelForSource(label));
          const note = !completed
            ? "The Nmap artifact did not record successful completion and cannot support absence, closure, or no-change conclusions."
            : label === "discovery"
              ? "The discovery artifact did not verify collection across the declared target scope."
            : "The ports artifact did not account for its complete declared scan range and cannot support port absence or closure conclusions.";
          source.notes.push(note);
          coverageNotes.push(note);
        }
        for (const host of hosts) {
          const portCoverage: ObservationPortCoverage[] =
            label === "ports" && completed && host.hasPortStateEvidence
              ? parsedArtifact.portScanRanges.map((coverage) => ({
                  sourceId: source.sourceId,
                  protocol: coverage.protocol,
                  ranges: coverage.ranges,
                }))
              : [];
          mergeHostObservation(
            deviceIndex,
            host,
            source.sourceId,
            "observed",
            runStartedAt,
            [],
            portCoverage
          );
        }
      } catch (error) {
        const note = isObservationArtifactReadError(error)
          ? error.message
          : "Nmap XML could not be parsed.";
        source.notes.push(note);
        coverageNotes.push(`${label} was present but could not be parsed.`);
        unusableCoverageLabels.add(coverageLabelForSource(label));
      }
    }
  }

  // Multiple artifacts for one capability are treated as one evidence set.
  // A failed/partial member prevents a successful sibling from silently
  // upgrading the whole capability to complete.
  for (const label of unusableCoverageLabels) {
    sourceLabelsPresent.delete(label);
  }

  const hostsUpPath = firstExistingFile(manifest.keyFiles.hosts_up || []);
  if (hostsUpPath) {
    const source = addSource("hosts-up", "hosts_up", hostsUpPath, false, 0);
    try {
      const ips = parseHostsUp(hostsUpPath);
      source.parsed = true;
      source.recordCount = ips.length;
      if (ips.length > 0) {
        sourceLabelsPresent.add("hosts_up");
      } else {
        coverageReasonCodes.add("empty-hosts-up");
        const note = "hosts_up.txt was empty and cannot establish discovery coverage.";
        source.notes.push(note);
        coverageNotes.push(note);
      }
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
      if (pairs.length > 0) {
        sourceLabelsPresent.add("arp_snapshot");
      } else {
        coverageReasonCodes.add("empty-arp-snapshot");
        const note = "The ARP snapshot was empty and cannot establish device identity coverage.";
        source.notes.push(note);
        coverageNotes.push(note);
      }
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

  const targetProvenance = buildTargetProvenance(
    metadata.target,
    [...nmapTargetScopes],
    [...verifiedDiscoveryScopes],
    coverageReasonCodes
  );
  if (targetProvenance.status !== "verified") {
    sourceLabelsPresent.delete("discovery");
    coverageReasonCodes.add(
      targetProvenance.status === "conflicting"
        ? "target-provenance-conflict"
        : "target-coverage-unverified"
    );
  }

  const observedStart = metadata.startedAt ?? runStartedAt;
  const observedEnd = metadata.endedAt ?? metadata.startedAt ?? runStartedAt;
  const coverage = buildCoverage(
    sourceLabelsPresent,
    coverageNotes,
    [...coverageReasonCodes],
    targetProvenance
  );
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
    normalization: {
      status: "complete",
      reasonCodes: [],
      losses: [],
    },
    identity: identityRecordFromDeviceIndex(deviceIndex),
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
  const normalizationCollector = createNormalizationCollector(raw.normalization);
  recordLimitLoss(
    normalizationCollector,
    "source-limit-exceeded",
    "sources",
    raw.sources.length,
    MAX_SOURCES
  );
  const boundedRawSources = raw.sources.slice(0, MAX_SOURCES);
  const sourceRecords = boundedRawSources.filter(isRecord);
  recordInvalidLoss(
    normalizationCollector,
    "invalid-source-record-dropped",
    "sources",
    boundedRawSources.length,
    sourceRecords.length
  );
  const sources = sourceRecords.map(sanitizeSource);
  if (sources.length === 0) {
    throw new ObservationBundleValidationError("Observation bundle has no source records.");
  }
  const sourceIds = new Set(sources.map((source) => source.sourceId));
  const completedPortSourceIds = new Set(
    sources
      .filter(
        (source) =>
          source.kind === "nmap-xml" &&
          source.artifactLabel === "ports" &&
          source.parsed &&
          source.completionStatus === "success"
      )
      .map((source) => source.sourceId)
  );

  recordLimitLoss(
    normalizationCollector,
    "device-limit-exceeded",
    "devices",
    raw.devices.length,
    MAX_DEVICES
  );
  const boundedRawDevices = raw.devices.slice(0, MAX_DEVICES);
  const deviceRecords = boundedRawDevices.filter(isRecord);
  recordInvalidLoss(
    normalizationCollector,
    "invalid-device-record-dropped",
    "devices",
    boundedRawDevices.length,
    deviceRecords.length
  );
  const devices = deviceRecords
    .map((device, index) =>
      sanitizeDevice(
        device,
        sourceIds,
        completedPortSourceIds,
        normalizationCollector,
        `devices[${index}]`
      )
    );
  const supplementalEvidence = sanitizeSupplementalEvidence(
    raw.supplementalEvidence,
    normalizationCollector
  );
  const collectorKind = sanitizeCollectorKind(collector.kind);
  if (!COLLECTOR_KIND_SET.has(collector.kind as CollectorRefKind)) {
    recordInvalidLoss(
      normalizationCollector,
      "invalid-collector-kind",
      "collector.kind",
      1,
      0
    );
  }
  const vantageType = sanitizeVantageType(vantage.type);
  if (!VANTAGE_TYPE_SET.has(vantage.type as CollectionVantage["type"])) {
    recordInvalidLoss(
      normalizationCollector,
      "invalid-vantage-type",
      "vantage.type",
      1,
      0
    );
  }
  const normalization = finalizeNormalization(normalizationCollector);
  const sanitizedCoverage = sanitizeCoverage(
    coverage,
    normalization.status === "truncated",
    sources,
    safeTextOrNull(site.networkScope, 120) ?? safeTextOrNull(vantage.target, 120)
  );
  const identity = evaluateBundleIdentity(devices, raw.identity);

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
      kind: collectorKind,
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
        normalization.status === "truncated" ||
        sanitizedCoverage.status !== "complete" ||
        sanitizedCoverage.missingSources.length > 0,
      notes: sanitizeNotes(batch.notes),
    },
    sources,
    vantage: {
      type: vantageType,
      runType: safeTextOrNull(vantage.runType, 80),
      networkName: safeText(vantage.networkName, 120) || "unknown",
      collectorHost: safeTextOrNull(vantage.collectorHost, 120),
      target: safeTextOrNull(vantage.target, 120),
      notes: sanitizeNotes(vantage.notes),
    },
    coverage: sanitizedCoverage,
    normalization,
    identity,
    devices,
    notes: sanitizeNotes(raw.notes),
  };

  if (supplementalEvidence) {
    sanitized.supplementalEvidence = supplementalEvidence;
  }

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

function buildCoverage(
  presentSources: Set<string>,
  notes: string[],
  reasonCodes: NonNullable<CoverageRecord["reasonCodes"]> = [],
  targetProvenance?: CoverageRecord["targetProvenance"]
): CoverageRecord {
  const uniqueNotes = uniqueStrings(notes).slice(0, MAX_NOTES);
  const score = EXPECTED_SOURCE_LABELS.reduce(
    (sum, label) => sum + (presentSources.has(label) ? COVERAGE_WEIGHTS[label] : 0),
    0
  );
  const roundedScore = Math.round(score * 100) / 100;
  const missingSources = EXPECTED_SOURCE_LABELS.filter((label) => !presentSources.has(label));
  const status = coverageStatusFor(roundedScore, missingSources);

  const coverage: CoverageRecord = {
    status,
    score: roundedScore,
    expectedSources: EXPECTED_SOURCE_LABELS,
    presentSources: EXPECTED_SOURCE_LABELS.filter((label) => presentSources.has(label)),
    missingSources,
    notes: uniqueNotes,
    reasonCodes: uniqueStrings(reasonCodes),
  };
  if (targetProvenance) coverage.targetProvenance = targetProvenance;
  return coverage;
}

function coverageStatusFor(score: number, missingSources: string[]): ObservationCoverageStatus {
  if (score < MINIMAL_COVERAGE_SCORE) return "minimal";
  if (missingSources.length === 0 && score >= COMPLETE_COVERAGE_SCORE) return "complete";
  return "partial";
}

function parseNmapHosts(xmlPath: string, sourceId: string): ParsedNmapArtifact {
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
    isArray: (name) =>
      ["scaninfo", "host", "address", "hostname", "port", "extraports"].includes(name),
  });
  const root = asRecord(parser.parse(xmlContent));
  const nmaprun = asRecord(root?.nmaprun);
  if (!nmaprun) {
    return { hosts: [], portScanRanges: [], completionStatus: "unknown", targetScopes: [] };
  }

  const hosts: ParsedNmapHost[] = [];
  const portScanRanges = parseNmapPortScanRanges(nmaprun);
  const completionStatus = parseNmapCompletionStatus(nmaprun);
  const targetScopes = parseNmapTargetScopes(attr(nmaprun, "@_args"));
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

    const portsRecord = asRecord(host.ports);
    const portRecords = asRecordArray(portsRecord?.port);
    const extraPortRecords = asRecordArray(portsRecord?.extraports);
    const hasPortStateEvidence = hasCompleteDeclaredPortStateCoverage(
      portRecords,
      extraPortRecords,
      portScanRanges
    );

    const openPorts: ObservationOpenPort[] = [];
    for (const port of portRecords) {
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
        hasPortStateEvidence,
      });
    }
  }

  return { hosts, portScanRanges, completionStatus, targetScopes };
}

const USABLE_EXPLICIT_NMAP_PORT_STATES = new Set(["open", "closed"]);

function hasCompleteDeclaredPortStateCoverage(
  portRecords: XmlRecord[],
  extraPortRecords: XmlRecord[],
  declarations: Array<{ protocol: string; ranges: ObservationPortRange[] }>
): boolean {
  if (declarations.length === 0) return false;

  const declaredCount = declarations.reduce(
    (total, declaration) => total + rangeCardinality(declaration.ranges),
    0
  );
  if (declaredCount <= 0) return false;

  const explicitPorts = new Set<string>();
  for (const port of portRecords) {
    const protocol = safeText(attr(port, "@_protocol"), 16).toLowerCase();
    const portNumber = Number.parseInt(attr(port, "@_portid"), 10);
    const state = attr(asRecord(port.state), "@_state").toLowerCase();
    const declaration = declarations.find((candidate) => candidate.protocol === protocol);
    if (
      !declaration ||
      !Number.isInteger(portNumber) ||
      !declaration.ranges.some(
        (range) => portNumber >= range.start && portNumber <= range.end
      ) ||
      !USABLE_EXPLICIT_NMAP_PORT_STATES.has(state)
    ) {
      return false;
    }
    const key = `${protocol}:${portNumber}`;
    if (explicitPorts.has(key)) return false;
    explicitPorts.add(key);
  }

  let extraPortCount = 0;
  for (const extraPorts of extraPortRecords) {
    const count = Number.parseInt(attr(extraPorts, "@_count"), 10);
    const state = attr(extraPorts, "@_state").toLowerCase();
    // Extraports do not identify individual ports. Only an exact closed state
    // can safely establish that the remaining declared ports were not open.
    if (!Number.isInteger(count) || count < 0 || state !== "closed") {
      return false;
    }
    extraPortCount += count;
  }

  return explicitPorts.size + extraPortCount === declaredCount;
}

function parseNmapCompletionStatus(
  nmaprun: XmlRecord
): "success" | "failed" | "unknown" {
  const exit = attr(asRecord(asRecord(nmaprun.runstats)?.finished), "@_exit")
    .trim()
    .toLowerCase();
  if (exit === "success") return "success";
  if (exit) return "failed";
  return "unknown";
}

function parseNmapTargetScopes(args: string): string[] {
  if (!args) return [];
  const matches = args.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g) ?? [];
  return uniqueStrings(
    matches
      .map(canonicalIpv4Scope)
      .filter((scope): scope is string => scope !== null)
  );
}

function buildTargetProvenance(
  declaredTarget: string | null,
  observedScopes: string[],
  verifiedDiscoveryScopes: string[],
  reasonCodes: Set<NonNullable<CoverageRecord["reasonCodes"]>[number]>
): NonNullable<CoverageRecord["targetProvenance"]> {
  const declaredScopes = parseTargetClaim(declaredTarget);
  const normalizedObserved = uniqueStrings(
    observedScopes
      .map(canonicalIpv4Scope)
      .filter((scope): scope is string => scope !== null)
  );
  const normalizedDiscovery = uniqueStrings(
    verifiedDiscoveryScopes
      .map(canonicalIpv4Scope)
      .filter((scope): scope is string => scope !== null)
  );

  let status: "verified" | "unverified" | "conflicting" = "unverified";
  if (reasonCodes.has("target-provenance-conflict")) {
    status = "conflicting";
  } else if (
    declaredScopes.length === 1 &&
    normalizedDiscovery.some((scope) => scope === declaredScopes[0])
  ) {
    status = "verified";
  }

  return {
    status,
    declaredScope: declaredScopes.length === 1 ? declaredScopes[0] : null,
    observedScopes: normalizedObserved,
  };
}

function compareTargetScopes(
  declaredTarget: string | null,
  observedScopes: string[]
): "verified" | "unverified" | "conflicting" {
  const declaredScopes = parseTargetClaim(declaredTarget);
  const normalizedObserved = observedScopes
    .map(canonicalIpv4Scope)
    .filter((scope): scope is string => scope !== null);
  if (declaredScopes.length !== 1 || normalizedObserved.length === 0) return "unverified";

  const declared = ipv4ScopeRange(declaredScopes[0]);
  if (!declared) return "unverified";
  let exact = false;
  for (const scope of normalizedObserved) {
    const observed = ipv4ScopeRange(scope);
    if (!observed) continue;
    if (observed.start > declared.end || observed.end < declared.start) {
      return "conflicting";
    }
    if (scope === declaredScopes[0]) exact = true;
  }
  return exact ? "verified" : "unverified";
}

function parseTargetClaim(value: string | null): string[] {
  if (!value) return [];
  const matches = value.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g) ?? [];
  return uniqueStrings(
    matches
      .map(canonicalIpv4Scope)
      .filter((scope): scope is string => scope !== null)
  );
}

function canonicalIpv4Scope(value: string): string | null {
  const match = /^((?:\d{1,3}\.){3}\d{1,3})(?:\/(\d{1,2}))?$/.exec(value.trim());
  if (!match || !isIpv4(match[1])) return null;
  const prefix = match[2] === undefined ? 32 : Number.parseInt(match[2], 10);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const address = ipv4ToUint(match[1]);
  if (address === null) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return `${uintToIpv4((address & mask) >>> 0)}/${prefix}`;
}

function ipv4ScopeRange(scope: string): { start: number; end: number } | null {
  const match = /^((?:\d{1,3}\.){3}\d{1,3})\/(\d{1,2})$/.exec(scope);
  if (!match) return null;
  const address = ipv4ToUint(match[1]);
  const prefix = Number.parseInt(match[2], 10);
  if (address === null || prefix < 0 || prefix > 32) return null;
  const hostMask = prefix === 32 ? 0 : (2 ** (32 - prefix) - 1) >>> 0;
  const start = (address & (~hostMask >>> 0)) >>> 0;
  return { start, end: (start | hostMask) >>> 0 };
}

function ipv4ToUint(value: string): number | null {
  if (!isIpv4(value)) return null;
  return value.split(".").reduce((total, octet) => ((total << 8) | Number(octet)) >>> 0, 0);
}

function uintToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function parseNmapPortScanRanges(
  nmaprun: XmlRecord
): Array<{ protocol: string; ranges: ObservationPortRange[] }> {
  const scanInfoRecords = asRecordArray(nmaprun.scaninfo);
  if (scanInfoRecords.length === 0) return [];
  const byProtocol = new Map<string, ObservationPortRange[]>();
  for (const scanInfo of scanInfoRecords) {
    const protocol = safeText(attr(scanInfo, "@_protocol"), 16).toLowerCase();
    if (!protocol) return [];
    const ranges = parseDeclaredPortRanges(attr(scanInfo, "@_services"));
    const numServices = Number.parseInt(attr(scanInfo, "@_numservices"), 10);
    if (
      ranges.length === 0 ||
      !Number.isInteger(numServices) ||
      numServices <= 0 ||
      numServices !== rangeCardinality(ranges)
    ) {
      return [];
    }
    byProtocol.set(protocol, mergePortRanges([...(byProtocol.get(protocol) ?? []), ...ranges]));
  }
  return [...byProtocol.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([protocol, ranges]) => ({ protocol, ranges }));
}

function rangeCardinality(ranges: ObservationPortRange[]): number {
  return ranges.reduce((total, range) => total + range.end - range.start + 1, 0);
}

function parseDeclaredPortRanges(value: string): ObservationPortRange[] {
  const ranges: ObservationPortRange[] = [];
  for (const token of value.split(",")) {
    const match = /^\s*(\d{1,5})(?:-(\d{1,5}))?\s*$/.exec(token);
    if (!match) continue;
    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2] ?? match[1], 10);
    if (start < 0 || end > 65535 || start > end) continue;
    ranges.push({ start, end });
  }
  return mergePortRanges(ranges);
}

function mergePortRanges(ranges: ObservationPortRange[]): ObservationPortRange[] {
  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: ObservationPortRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end + 1) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
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
  const ipIndex = new Map<string, Set<string>>();
  const macIndex = new Map<string, Set<string>>();
  const identityReasonCodes = new Set<ObservationIdentityReasonCode>();

  const create = (seed: string): DeviceAccumulator => {
    const baseKey = `dev-${hashString(seed).slice(0, 12)}`;
    let key = baseKey;
    let suffix = 1;
    while (devices.has(key)) {
      key = `${baseKey}-${suffix++}`;
    }
    const device: DeviceAccumulator = {
      key,
      identityConflicted: false,
      ips: new Set(),
      macs: new Set(),
      hostnames: new Set(),
      vendors: new Set(),
      evidence: new Map(),
      openPorts: new Map(),
      portCoverage: new Map(),
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
    identityReasonCodes,
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
  }> = [],
  portCoverage: ObservationPortCoverage[] = []
): void {
  const macCandidates = indexCandidates(index.macIndex, host.macs);
  const ipCandidates = indexCandidates(index.ipIndex, host.ips);
  const allCandidates = new Set([...macCandidates, ...ipCandidates]);
  const incomingMacs = new Set(host.macs);
  const candidatesDisagreeWithIncomingMac = [...allCandidates].some((key) => {
    const candidate = index.devices.get(key);
    return Boolean(
      candidate &&
        incomingMacs.size > 0 &&
        candidate.macs.size > 0 &&
        ![...incomingMacs].some((mac) => candidate.macs.has(mac))
    );
  });
  let conflict =
    allCandidates.size > 1 ||
    candidatesDisagreeWithIncomingMac ||
    [...allCandidates].some((key) => index.devices.get(key)?.identityConflicted === true);
  let candidateKey: string | null = null;

  if (!conflict && macCandidates.size === 1) {
    candidateKey = [...macCandidates][0];
  } else if (!conflict && macCandidates.size === 0 && ipCandidates.size === 1) {
    const ipCandidateKey = [...ipCandidates][0];
    const ipCandidate = index.devices.get(ipCandidateKey);
    const candidateHasDifferentMac = Boolean(
      ipCandidate &&
        incomingMacs.size > 0 &&
        ipCandidate.macs.size > 0 &&
        ![...incomingMacs].some((mac) => ipCandidate.macs.has(mac))
    );
    if (candidateHasDifferentMac) {
      conflict = true;
    } else {
      candidateKey = ipCandidateKey;
    }
  }

  let device = candidateKey ? index.devices.get(candidateKey) : null;
  if (!device) {
    const seed = `${host.macs[0] ?? host.ips[0] ?? sourceId}|${sourceId}|${index.devices.size}`;
    device = index.create(seed);
  }

  if (conflict) {
    index.identityReasonCodes.add("conflicting-identifiers");
    device.identityConflicted = true;
    device.notes.add(
      "Conflicting identifier evidence was preserved without merging device records."
    );
    for (const key of allCandidates) {
      const candidate = index.devices.get(key);
      if (candidate) {
        candidate.identityConflicted = true;
        candidate.notes.add(
          "Conflicting identifier evidence was preserved without merging device records."
        );
      }
    }
  }
  if (confidence === "weak") {
    index.identityReasonCodes.add("weak-identity-evidence");
  }

  touchSeen(device, seenAt);
  for (const ip of host.ips) {
    device.ips.add(ip);
    addDeviceIndexValue(index.ipIndex, ip, device.key);
    addEvidence(device, "ip-address", ip, sourceId, confidence);
  }
  for (const mac of host.macs) {
    device.macs.add(mac);
    addDeviceIndexValue(index.macIndex, mac, device.key);
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
  for (const coverage of portCoverage) {
    const key = `${coverage.sourceId}|${coverage.protocol}`;
    device.portCoverage.set(key, coverage);
  }
}

function indexCandidates(index: Map<string, Set<string>>, values: string[]): Set<string> {
  const candidates = new Set<string>();
  for (const value of values) {
    for (const key of index.get(value) ?? []) candidates.add(key);
  }
  return candidates;
}

function addDeviceIndexValue(index: Map<string, Set<string>>, value: string, key: string): void {
  const keys = index.get(value) ?? new Set<string>();
  keys.add(key);
  index.set(value, keys);
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
      identityEvidence: [...device.evidence.values()],
      openPorts: [...device.openPorts.values()]
        .sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol)),
      portCoverage: [...device.portCoverage.values()]
        .sort((a, b) => a.protocol.localeCompare(b.protocol) || a.sourceId.localeCompare(b.sourceId)),
      notes: [...device.notes].slice(0, 10),
    }));
}

function identityRecordFromDeviceIndex(
  index: ReturnType<typeof createDeviceIndex>
): ObservationIdentityRecord {
  const reasonCodes = [...index.identityReasonCodes].sort();
  return {
    status: reasonCodes.includes("conflicting-identifiers")
      ? "conflicting"
      : reasonCodes.length > 0
        ? "uncertain"
        : "supported",
    reasonCodes,
  };
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
  const source: ObservationSourceRef = {
    sourceId: safeId(raw.sourceId, "src-unknown"),
    kind,
    artifactLabel: safeText(raw.artifactLabel, 80) || "unknown",
    fileName: sanitizeFileName(raw.fileName),
    parsed: raw.parsed === true,
    recordCount: nonNegativeInteger(raw.recordCount),
    notes: sanitizeNotes(raw.notes),
  };
  if (Array.isArray(raw.targetScopes)) {
    source.targetScopes = uniqueStrings(
      raw.targetScopes
        .filter((scope): scope is string => typeof scope === "string")
        .map(canonicalIpv4Scope)
        .filter((scope): scope is string => scope !== null)
    );
  }
  if (
    raw.completionStatus === "success" ||
    raw.completionStatus === "failed" ||
    raw.completionStatus === "unknown"
  ) {
    source.completionStatus = raw.completionStatus;
  }
  return source;
}

function sanitizeDevice(
  raw: Record<string, unknown>,
  sourceIds: Set<string>,
  completedPortSourceIds: Set<string>,
  normalization: NormalizationCollector,
  pathPrefix: string
): ObservationDevice {
  const rawIdentityEvidence = Array.isArray(raw.identityEvidence) ? raw.identityEvidence : [];
  recordLimitLoss(
    normalization,
    "identity-evidence-limit-exceeded",
    `${pathPrefix}.identityEvidence`,
    rawIdentityEvidence.length,
    MAX_EVIDENCE_PER_DEVICE
  );
  const boundedRawIdentityEvidence = rawIdentityEvidence.slice(0, MAX_EVIDENCE_PER_DEVICE);
  const identityEvidence = Array.isArray(raw.identityEvidence)
    ? boundedRawIdentityEvidence
        .filter(isRecord)
        .map((evidence) => sanitizeEvidence(evidence, sourceIds))
        .filter((evidence): evidence is DeviceIdentityEvidence => evidence !== null)
    : [];
  recordInvalidLoss(
    normalization,
    "invalid-identity-evidence-dropped",
    `${pathPrefix}.identityEvidence`,
    boundedRawIdentityEvidence.length,
    identityEvidence.length
  );

  const rawOpenPorts = Array.isArray(raw.openPorts) ? raw.openPorts : [];
  recordLimitLoss(
    normalization,
    "open-port-limit-exceeded",
    `${pathPrefix}.openPorts`,
    rawOpenPorts.length,
    MAX_OPEN_PORTS_PER_DEVICE
  );
  const boundedRawOpenPorts = rawOpenPorts.slice(0, MAX_OPEN_PORTS_PER_DEVICE);
  const openPorts = Array.isArray(raw.openPorts)
    ? boundedRawOpenPorts
        .filter(isRecord)
        .map((port) => sanitizeOpenPort(port, completedPortSourceIds))
        .filter((port): port is ObservationOpenPort => port !== null)
    : [];
  recordInvalidLoss(
    normalization,
    "invalid-open-port-dropped",
    `${pathPrefix}.openPorts`,
    boundedRawOpenPorts.length,
    openPorts.length
  );

  const rawPortCoverage = Array.isArray(raw.portCoverage) ? raw.portCoverage : [];
  recordLimitLoss(
    normalization,
    "port-coverage-limit-exceeded",
    `${pathPrefix}.portCoverage`,
    rawPortCoverage.length,
    MAX_PORT_COVERAGE_PER_DEVICE
  );
  const boundedRawPortCoverage = rawPortCoverage.slice(0, MAX_PORT_COVERAGE_PER_DEVICE);
  const portCoverage = Array.isArray(raw.portCoverage)
    ? boundedRawPortCoverage
        .filter(isRecord)
        .map((coverage, index) =>
          sanitizePortCoverage(
            coverage,
            completedPortSourceIds,
            normalization,
            `${pathPrefix}.portCoverage[${index}]`
          )
        )
        .filter((coverage): coverage is ObservationPortCoverage => coverage !== null)
    : [];
  recordInvalidLoss(
    normalization,
    "invalid-port-coverage-dropped",
    `${pathPrefix}.portCoverage`,
    boundedRawPortCoverage.length,
    portCoverage.length
  );

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
    portCoverage,
    notes: sanitizeNotes(raw.notes),
  };
}

function sanitizePortCoverage(
  raw: Record<string, unknown>,
  completedPortSourceIds: Set<string>,
  normalization: NormalizationCollector,
  pathPrefix: string
): ObservationPortCoverage | null {
  const sourceId = safeId(raw.sourceId, "");
  const protocol = safeText(raw.protocol, 16).toLowerCase();
  if (
    !sourceId ||
    !completedPortSourceIds.has(sourceId) ||
    !protocol ||
    !Array.isArray(raw.ranges)
  ) {
    return null;
  }

  const validRanges = raw.ranges
    .filter(isRecord)
    .map((range) => ({ start: Number(range.start), end: Number(range.end) }))
    .filter(
      (range) =>
        Number.isInteger(range.start) &&
        Number.isInteger(range.end) &&
        range.start >= 0 &&
        range.end <= 65535 &&
        range.start <= range.end
    );
  recordInvalidLoss(
    normalization,
    "invalid-port-range-dropped",
    `${pathPrefix}.ranges`,
    raw.ranges.length,
    validRanges.length
  );
  const mergedRanges = mergePortRanges(validRanges);
  recordLimitLoss(
    normalization,
    "port-range-limit-exceeded",
    `${pathPrefix}.ranges`,
    mergedRanges.length,
    MAX_PORT_RANGES_PER_COVERAGE
  );
  const ranges = mergedRanges.slice(0, MAX_PORT_RANGES_PER_COVERAGE);
  return ranges.length > 0 ? { sourceId, protocol, ranges } : null;
}

function createNormalizationCollector(value: unknown): NormalizationCollector {
  const collector: NormalizationCollector = {
    losses: [],
    inheritedReasonCodes: new Set(),
  };
  if (!isRecord(value)) {
    collector.inheritedReasonCodes.add("normalization-record-missing");
    return collector;
  }

  const declaredStatus = value.status;
  if (
    (declaredStatus !== "complete" && declaredStatus !== "truncated") ||
    !Array.isArray(value.reasonCodes) ||
    !Array.isArray(value.losses)
  ) {
    collector.inheritedReasonCodes.add("normalization-record-inconsistent");
  }

  if (Array.isArray(value.reasonCodes)) {
    for (const reason of value.reasonCodes) {
      if (NORMALIZATION_REASON_CODE_SET.has(reason as ObservationNormalizationReasonCode)) {
        collector.inheritedReasonCodes.add(reason as ObservationNormalizationReasonCode);
      }
    }
  }
  if (Array.isArray(value.losses)) {
    for (const rawLoss of value.losses) {
      if (!isRecord(rawLoss)) continue;
      const reasonCode = rawLoss.reasonCode as ObservationNormalizationReasonCode;
      if (!NORMALIZATION_REASON_CODE_SET.has(reasonCode)) continue;
      const inputCount = nonNegativeInteger(rawLoss.inputCount);
      const retainedCount = nonNegativeInteger(rawLoss.retainedCount);
      const limit = nonNegativeInteger(rawLoss.limit);
      collector.losses.push({
        reasonCode,
        path: safeText(rawLoss.path, 160) || "observation",
        inputCount,
        retainedCount,
        limit,
      });
      collector.inheritedReasonCodes.add(reasonCode);
    }
  }
  if (
    declaredStatus === "truncated" &&
    collector.inheritedReasonCodes.size === 0 &&
    collector.losses.length === 0
  ) {
    collector.inheritedReasonCodes.add("normalization-record-inconsistent");
  }
  return collector;
}

function recordLimitLoss(
  collector: NormalizationCollector,
  reasonCode: ObservationNormalizationReasonCode,
  path: string,
  inputCount: number,
  limit: number
): void {
  if (inputCount <= limit) return;
  collector.losses.push({
    reasonCode,
    path,
    inputCount,
    retainedCount: limit,
    limit,
  });
}

function recordInvalidLoss(
  collector: NormalizationCollector,
  reasonCode: ObservationNormalizationReasonCode,
  path: string,
  inputCount: number,
  retainedCount: number
): void {
  if (retainedCount >= inputCount) return;
  collector.losses.push({
    reasonCode,
    path,
    inputCount,
    retainedCount,
    // Invalid-record loss is validation-bounded rather than count-bounded;
    // the stable reason code distinguishes it from a configured limit.
    limit: inputCount,
  });
}

function finalizeNormalization(
  collector: NormalizationCollector
): NonNullable<ObservationBundleV1["normalization"]> {
  const reasonCodes = new Set(collector.inheritedReasonCodes);
  for (const loss of collector.losses) reasonCodes.add(loss.reasonCode);
  const losses = [...new Map(
    collector.losses.map((loss) => [
      `${loss.reasonCode}|${loss.path}|${loss.inputCount}|${loss.retainedCount}|${loss.limit}`,
      loss,
    ])
  ).values()];
  return {
    status: reasonCodes.size > 0 ? "truncated" : "complete",
    reasonCodes: [...reasonCodes].sort(),
    losses,
  };
}

function evaluateBundleIdentity(
  devices: ObservationDevice[],
  declaredIdentity: unknown
): ObservationIdentityRecord {
  const reasonCodes = new Set<ObservationIdentityReasonCode>();
  if (isRecord(declaredIdentity)) {
    if (declaredIdentity.status === "conflicting") {
      reasonCodes.add("conflicting-identifiers");
    }
    if (declaredIdentity.status === "uncertain") {
      reasonCodes.add("weak-identity-evidence");
    }
    if (Array.isArray(declaredIdentity.reasonCodes)) {
      for (const reason of declaredIdentity.reasonCodes) {
        if (IDENTITY_REASON_CODE_SET.has(reason as ObservationIdentityReasonCode)) {
          reasonCodes.add(reason as ObservationIdentityReasonCode);
        }
      }
    }
  }

  const devicesByStrongIdentity = new Map<string, Set<string>>();
  const strongIdentitySignaturesByIp = new Map<string, Set<string>>();
  for (const [deviceIndex, device] of devices.entries()) {
    const observedStableIdentities = uniqueStrings(
      device.identityEvidence
        .filter(
          (evidence) =>
            evidence.kind === "mac-address" && evidence.confidence === "observed"
        )
        .map((evidence) => {
          const mac = normalizeMac(evidence.value);
          if (mac) return `mac:${mac}`;
          const hashedMac = normalizeHashedMacIdentity(evidence.value);
          return hashedMac ? `hashed-mac:${hashedMac}` : null;
        })
        .filter((identity): identity is string => identity !== null)
    );
    const weakMacs = device.identityEvidence.filter(
      (evidence) =>
        evidence.kind === "mac-address" && evidence.confidence !== "observed"
    );
    if (weakMacs.length > 0) reasonCodes.add("weak-identity-evidence");
    if (observedStableIdentities.length === 0) {
      reasonCodes.add(
        device.ips.length > 0
          ? "locator-only-identity"
          : "weak-identity-evidence"
      );
    }

    for (const identity of observedStableIdentities) {
      addDeviceIndexValue(devicesByStrongIdentity, identity, String(deviceIndex));
    }
    const signature = observedStableIdentities.slice().sort().join("|");
    if (signature) {
      for (const ip of device.ips) {
        const signatures = strongIdentitySignaturesByIp.get(ip) ?? new Set<string>();
        signatures.add(signature);
        strongIdentitySignaturesByIp.set(ip, signatures);
      }
    }
  }

  if (
    [...devicesByStrongIdentity.values()].some((deviceIds) => deviceIds.size > 1) ||
    [...strongIdentitySignaturesByIp.values()].some((signatures) => signatures.size > 1)
  ) {
    reasonCodes.add("conflicting-identifiers");
  }

  const sortedReasonCodes = [...reasonCodes].sort();
  return {
    status: reasonCodes.has("conflicting-identifiers")
      ? "conflicting"
      : reasonCodes.size > 0
        ? "uncertain"
        : "supported",
    reasonCodes: sortedReasonCodes,
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
  completedPortSourceIds: Set<string>
): ObservationOpenPort | null {
  const port = portInteger(raw.port);
  const sourceId = safeId(raw.sourceId, "");
  const protocol = safeText(raw.protocol, 16).toLowerCase();
  if (
    port === null ||
    !sourceId ||
    !completedPortSourceIds.has(sourceId) ||
    !OPEN_PORT_PROTOCOL_SET.has(protocol) ||
    raw.state !== "open"
  ) {
    return null;
  }
  return {
    protocol,
    port,
    state: "open",
    service: safeTextOrNull(raw.service, 80),
    product: safeTextOrNull(raw.product, 120),
    version: safeTextOrNull(raw.version, 80),
    sourceId,
  };
}

function sanitizeCoverage(
  raw: Record<string, unknown>,
  normalizationTruncated: boolean,
  sources: ObservationSourceRef[],
  declaredTarget: string | null
): CoverageRecord {
  const expectedSources = [...EXPECTED_SOURCE_LABELS];
  const declaredMissingSources = new Set(
    sanitizeStringArray(raw.missingSources, 80).filter((label) =>
      EXPECTED_SOURCE_LABEL_SET.has(label)
    )
  );
  const reasonCodes = new Set<NonNullable<CoverageRecord["reasonCodes"]>[number]>();
  if (Array.isArray(raw.reasonCodes)) {
    for (const reason of raw.reasonCodes) {
      if (COVERAGE_REASON_CODE_SET.has(reason as NonNullable<CoverageRecord["reasonCodes"]>[number])) {
        reasonCodes.add(reason as NonNullable<CoverageRecord["reasonCodes"]>[number]);
      }
    }
  }

  const emptyHostsUp = sources.some(
    (source) =>
      source.artifactLabel === "hosts_up" &&
      source.kind === "hosts-up" &&
      source.parsed &&
      source.recordCount === 0
  );
  const emptyArp = sources.some(
    (source) =>
      source.artifactLabel === "arp_snapshot" &&
      source.kind === "arp-snapshot" &&
      source.parsed &&
      source.recordCount === 0
  );
  if (emptyHostsUp) {
    reasonCodes.add("empty-hosts-up");
  }
  if (emptyArp) {
    reasonCodes.add("empty-arp-snapshot");
  }

  const targetProvenance = deriveTargetProvenance(sources, declaredTarget);
  if (targetProvenance.status === "conflicting") {
    reasonCodes.add("target-provenance-conflict");
  } else if (targetProvenance.status !== "verified") {
    reasonCodes.add("target-coverage-unverified");
  }
  if (normalizationTruncated) reasonCodes.add("normalization-truncated");

  const derivedPresentSources = new Set(
    expectedSources.filter((label) =>
      sourceRecordsSupportCoverageCapability(label, sources, targetProvenance)
    )
  );
  for (const declaredMissing of declaredMissingSources) {
    derivedPresentSources.delete(declaredMissing);
  }
  const presentSources = expectedSources.filter((label) =>
    derivedPresentSources.has(label)
  );
  const missingSources = expectedSources.filter(
    (label) => !derivedPresentSources.has(label)
  );
  let score = Math.round(
    presentSources.reduce(
      (sum, label) => sum + (COVERAGE_WEIGHTS[label] ?? 0),
      0
    ) * 100
  ) / 100;
  const computedStatus = coverageStatusFor(score, missingSources);
  const status =
    computedStatus === "minimal"
      ? "minimal"
      : reasonCodes.size > 0
        ? "partial"
        : computedStatus;
  if (status !== "complete" && score === 1) score = 0.99;

  return {
    status,
    score,
    expectedSources,
    presentSources,
    missingSources,
    notes: sanitizeNotes(raw.notes),
    reasonCodes: [...reasonCodes].sort(),
    targetProvenance,
  };
}

function sourceRecordsSupportCoverageCapability(
  label: string,
  sources: ObservationSourceRef[],
  targetProvenance: NonNullable<CoverageRecord["targetProvenance"]>
): boolean {
  const candidates = sources.filter((source) => source.artifactLabel === label);
  if (candidates.length === 0) return false;

  return candidates.every((source) => {
    switch (label) {
      case "ports":
        return (
          source.kind === "nmap-xml" &&
          source.parsed &&
          source.completionStatus === "success"
        );
      case "discovery":
        return (
          source.kind === "nmap-xml" &&
          source.parsed &&
          source.completionStatus === "success" &&
          targetProvenance.status === "verified"
        );
      case "hosts_up":
        return source.kind === "hosts-up" && source.parsed && source.recordCount > 0;
      case "arp_snapshot":
        return source.kind === "arp-snapshot" && source.parsed && source.recordCount > 0;
      case "scan_metadata":
        return source.kind === "scan-metadata" && source.parsed && source.recordCount > 0;
      default:
        return false;
    }
  });
}

function deriveTargetProvenance(
  sources: ObservationSourceRef[],
  declaredTarget: string | null
): NonNullable<CoverageRecord["targetProvenance"]> {
  const declaredScopes = parseTargetClaim(declaredTarget);
  const observedScopes = uniqueStrings(
    sources.flatMap((source) => source.targetScopes ?? [])
  );
  if (declaredScopes.length !== 1) {
    return { status: "unverified", declaredScope: null, observedScopes };
  }

  let conflicting = false;
  for (const source of sources) {
    if ((source.targetScopes?.length ?? 0) === 0) continue;
    if (compareTargetScopes(declaredScopes[0], source.targetScopes ?? []) === "conflicting") {
      conflicting = true;
      break;
    }
  }
  if (conflicting) {
    return {
      status: "conflicting",
      declaredScope: declaredScopes[0],
      observedScopes,
    };
  }

  const verified = sources.some(
    (source) =>
      source.kind === "nmap-xml" &&
      source.artifactLabel === "discovery" &&
      source.parsed &&
      source.completionStatus === "success" &&
      compareTargetScopes(declaredScopes[0], source.targetScopes ?? []) === "verified"
  );
  return {
    status: verified ? "verified" : "unverified",
    declaredScope: declaredScopes[0],
    observedScopes,
  };
}

type CollectorRefKind = ObservationBundleV1["collector"]["kind"];

function sanitizeCollectorKind(value: unknown): CollectorRefKind {
  return COLLECTOR_KIND_SET.has(value as CollectorRefKind)
    ? (value as CollectorRefKind)
    : "unknown";
}

function sanitizeVantageType(value: unknown): CollectionVantage["type"] {
  return VANTAGE_TYPE_SET.has(value as CollectionVantage["type"])
    ? (value as CollectionVantage["type"])
    : "unknown";
}

function sanitizeSupplementalEvidence(
  value: unknown,
  normalization: NormalizationCollector
): ObservationSupplementalEvidence[] | undefined {
  if (!Array.isArray(value)) return undefined;

  recordLimitLoss(
    normalization,
    "supplemental-evidence-limit-exceeded",
    "supplementalEvidence",
    value.length,
    MAX_SUPPLEMENTAL_EVIDENCE
  );

  const boundedRawEvidence = value.slice(0, MAX_SUPPLEMENTAL_EVIDENCE);
  const evidence = boundedRawEvidence
    .filter(isRecord)
    .map(sanitizeSupplementalEvidenceItem)
    .filter((item): item is ObservationSupplementalEvidence => item !== null);
  recordInvalidLoss(
    normalization,
    "invalid-supplemental-evidence-dropped",
    "supplementalEvidence",
    boundedRawEvidence.length,
    evidence.length
  );

  return evidence.length > 0 ? evidence : undefined;
}

function sanitizeSupplementalEvidenceItem(
  raw: Record<string, unknown>
): ObservationSupplementalEvidence | null {
  if (raw.kind !== "packet-highway-analysis") return null;

  const packetHighway = sanitizePacketHighwayEvidence(raw.packetHighway);
  if (!packetHighway) return null;

  return {
    evidenceId: safeId(raw.evidenceId, `phe-${hashString(packetHighway.capture.meta.generatedAt).slice(0, 12)}`),
    kind: "packet-highway-analysis",
    label: safeText(raw.label, 120) || "Packet Highway analysis",
    summary:
      safeText(raw.summary, 240) ||
      "Supplemental Packet Highway metadata linked to this observation.",
    packetHighway,
  };
}

function sanitizePacketHighwayEvidence(
  raw: unknown
): ObservationSupplementalEvidence["packetHighway"] | undefined {
  if (!isRecord(raw)) return undefined;

  const captureJson = JSON.stringify(raw.capture);
  if (!captureJson) return undefined;

  try {
    const capture = sanitizePacketHighwayCaptureForObservation(
      parseNormalizedCaptureFixture(captureJson)
    );
    return {
      capture,
      canSupport: sanitizeStringArray(raw.canSupport, 220).slice(0, 12),
      cannotProve: sanitizeStringArray(raw.cannotProve, 220).slice(0, 12),
      limitations: sanitizeStringArray(raw.limitations, 260).slice(0, 16),
    };
  } catch {
    return undefined;
  }
}

function sanitizePacketHighwayCaptureForObservation(
  capture: NormalizedCapture
): NormalizedCapture {
  return {
    ...capture,
    meta: {
      ...capture.meta,
      fileName: sanitizeFileName(capture.meta.fileName) ?? "analysis.json",
    },
    devices: capture.devices.map((device) => ({
      ...device,
      id: safeId(device.id, "dev-unknown"),
      mac: device.mac ? normalizeMac(device.mac) : null,
      ips: device.ips.filter(isIpv4),
      name: safeTextOrNull(device.name, 80),
      vendor: safeTextOrNull(device.vendor, 80),
      notes: safeTextOrNull(device.notes, 300),
    })),
    externalEndpoints: capture.externalEndpoints.map((endpoint) => ({
      ...endpoint,
      id: safeId(endpoint.id, "ext-unknown"),
      ip: safeText(endpoint.ip, 80) || "unknown",
    })),
    flows: capture.flows.map((flow) => ({
      ...flow,
      id: safeId(flow.id, "flow-unknown"),
      fromId: safeId(flow.fromId, "node-unknown"),
      toId: safeId(flow.toId, "node-unknown"),
    })),
    animationEvents: capture.animationEvents.map((event) => ({
      ...event,
      flowId: safeId(event.flowId, "flow-unknown"),
      fromId: safeId(event.fromId, "node-unknown"),
      toId: safeId(event.toId, "node-unknown"),
    })),
    dnsQueries: capture.dnsQueries.map((query) => ({
      ...query,
      name: safeText(query.name, 260) || "(redacted name)",
    })),
    summary: {
      ...capture.summary,
      headline: safeText(capture.summary.headline, 240) || "Traffic analysis metadata.",
      lines: capture.summary.lines
        .map((line) => safeText(line, 500))
        .filter(Boolean),
    },
    alerts: capture.alerts.map((alert) => ({
      ...alert,
      id: safeId(alert.id, "alert-unknown"),
      ruleId: safeId(alert.ruleId, "rule-unknown"),
      title: safeText(alert.title, 160) || "Watch item",
      detail: safeText(alert.detail, 800),
      deviceIds: alert.deviceIds.map((id) => safeId(id, "dev-unknown")),
      flowIds: alert.flowIds.map((id) => safeId(id, "flow-unknown")),
    })),
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

function normalizeHashedMacIdentity(value: string): string | null {
  const match = /^(?:sha256:|hash:)?([a-f0-9]{32,128})$/i.exec(value.trim());
  return match ? `hash:${match[1].toLowerCase()}` : null;
}

function uniqueStrings<T extends string>(values: T[]): T[] {
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
  "packet-highway-analysis",
]);
const COLLECTOR_KIND_SET = new Set<CollectorRefKind>([
  "registered-scan-run",
  "packet-highway-analysis",
  "unknown",
]);
const VANTAGE_TYPE_SET = new Set<CollectionVantage["type"]>([
  "active-scan-upload",
  "packet-highway-this-computer",
  "packet-highway-gateway-router",
  "packet-highway-mirror-tap",
  "packet-highway-unknown",
  "unknown",
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
const NORMALIZATION_REASON_CODE_SET = new Set<ObservationNormalizationReasonCode>([
  "normalization-record-missing",
  "normalization-record-inconsistent",
  "source-limit-exceeded",
  "device-limit-exceeded",
  "identity-evidence-limit-exceeded",
  "open-port-limit-exceeded",
  "port-coverage-limit-exceeded",
  "port-range-limit-exceeded",
  "supplemental-evidence-limit-exceeded",
  "invalid-source-record-dropped",
  "invalid-device-record-dropped",
  "invalid-identity-evidence-dropped",
  "invalid-open-port-dropped",
  "invalid-port-coverage-dropped",
  "invalid-port-range-dropped",
  "invalid-supplemental-evidence-dropped",
  "invalid-collector-kind",
  "invalid-vantage-type",
]);
const EXPECTED_SOURCE_LABEL_SET = new Set(EXPECTED_SOURCE_LABELS);
const IDENTITY_REASON_CODE_SET = new Set<ObservationIdentityReasonCode>([
  "conflicting-identifiers",
  "weak-identity-evidence",
  "locator-only-identity",
]);
const COVERAGE_REASON_CODE_SET = new Set<
  NonNullable<CoverageRecord["reasonCodes"]>[number]
>([
  "empty-hosts-up",
  "empty-arp-snapshot",
  "target-coverage-unverified",
  "target-provenance-conflict",
  "normalization-truncated",
]);
