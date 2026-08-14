import * as fs from "fs";
import * as path from "path";
import { isIP } from "node:net";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { getRunByUid, type RunManifest } from "./run-registry";
import {
  MAX_PACKET_HIGHWAY_DEVICE_NOTE_LENGTH,
  parseNormalizedCaptureFixture,
} from "./capture-upload-safety";
import { hashString } from "@/lib/utils/hash";
import { OBSERVATION_NORMALIZATION_LOSS_CODES } from "@/lib/types/observation-bundle";
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
  ObservationNormalization,
  ObservationNormalizationLossCode,
  ObservationOriginKind,
  ObservationPortCoverage,
  ObservationPortProtocol,
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
const MAX_NORMALIZATION_LOSS_COUNT = 1_000_000;

const PACKET_HIGHWAY_CAN_SUPPORT = [
  "Review of retained, normalized traffic metadata from the selected capture window and vantage.",
  "Bounded positive observations of retained devices, external endpoints, flows, animation events, and DNS records.",
] as const;
const PACKET_HIGHWAY_CANNOT_PROVE = [
  "Identity continuity, complete inventory, device absence, service or port closure, stability, or persistence eligibility.",
  "External reachability, Internet exposure, authoritative summaries, ownership, intent, safety, compromise, or causality.",
] as const;
const PACKET_HIGHWAY_LIMITATIONS = [
  "Packet Highway evidence is supplemental review context only and never replaces canonical local scan evidence.",
  "Visibility is limited to the retained capture window, selected collection vantage, and parser limits.",
] as const;
const SUPPLEMENTAL_PACKET_HIGHWAY_LABEL = "Packet Highway visual evidence";
const SUPPLEMENTAL_PACKET_HIGHWAY_SUMMARY =
  "Supplemental traffic visualization metadata. Use it to inspect what this capture saw, not to infer ownership, safety, or complete coverage.";
const IMPORTED_PACKET_HIGHWAY_LABEL = "Imported Packet Highway analysis";
const IMPORTED_PACKET_HIGHWAY_SUMMARY = "Imported traffic metadata retained as bounded review-only positive observations.";
const IMPORTED_PACKET_HIGHWAY_HEADLINE = "Imported traffic metadata is available for review.";
const IMPORTED_PACKET_HIGHWAY_LINES = ["Retained records are review-only and do not establish external reachability or completeness."] as const;

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
  portCoverage: ObservationPortCoverage[];
}

interface ParsedNmapArtifact {
  hosts: ParsedNmapHost[];
  portScanRanges: Array<{
    protocol: ObservationPortProtocol;
    ranges: ObservationPortRange[];
  }>;
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
  portCoverage: Map<string, ObservationPortCoverage>;
  firstSeen: string | null;
  lastSeen: string | null;
  notes: Set<string>;
}

type XmlRecord = Record<string, unknown>;

interface NormalizationCollector {
  inherited: Map<ObservationNormalizationLossCode, number>;
  current: Map<ObservationNormalizationLossCode, number>;
}

interface SanitizeContext {
  origin: ObservationOriginKind;
  requireAuthorityMetadata: boolean;
  requireNormalizationMetadata: boolean;
}

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
  const coverageNotes: string[] = [];
  const bundleNotes: string[] = [];
  const deviceIndex = createDeviceIndex(runStartedAt);
  const normalization = createNormalizationCollector(undefined, false);
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
    if (metadataNotes.length > 0) {
      recordLoss(
        normalization,
        metadataNotes.some((note) => /size limit/i.test(note))
          ? "artifact-limit-exceeded"
          : "artifact-read-failed"
      );
    }
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
        const parsedArtifact = parseNmapHosts(xmlPath, source.sourceId, normalization);
        source.parsed = true;
        source.recordCount = parsedArtifact.hosts.length;
        sourceLabelsPresent.add(coverageLabelForSource(label));
        for (const host of parsedArtifact.hosts) {
          mergeHostObservation(deviceIndex, host, source.sourceId, "observed", runStartedAt);
        }
      } catch (error) {
        const note = isObservationArtifactReadError(error)
          ? error.message
          : "Nmap XML could not be parsed.";
        source.notes.push(note);
        coverageNotes.push(`${label} was present but could not be parsed.`);
        recordLoss(
          normalization,
          /size limit/i.test(note) ? "artifact-limit-exceeded" : "artifact-read-failed"
        );
      }
    }
  }

  const hostsUpPath = firstExistingFile(manifest.keyFiles.hosts_up || []);
  if (hostsUpPath) {
    const source = addSource("hosts-up", "hosts_up", hostsUpPath, false, 0);
    try {
      const ips = parseHostsUp(hostsUpPath, normalization);
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
          portCoverage: [],
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
      recordLoss(
        normalization,
        /size limit/i.test(note) ? "artifact-limit-exceeded" : "artifact-read-failed"
      );
    }
  }

  for (const arpPath of arpSnapshotFiles(manifest.keyFiles.snapshots || [])) {
    const source = addSource("arp-snapshot", "arp_snapshot", arpPath, false, 0);
    try {
      const pairs = parseArpSnapshot(arpPath, normalization);
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
          portCoverage: [],
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
      recordLoss(
        normalization,
        /size limit/i.test(note) ? "artifact-limit-exceeded" : "artifact-read-failed"
      );
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
    origin: { kind: "canonical-local-artifacts", assignedBy: "server" },
    normalization: finalizeNormalization(normalization),
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

  return sanitizeCanonicalLocalObservationBundleV1(bundle);
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

  return sanitizeImportedObservationBundleV1(raw);
}

export function sanitizeObservationBundleV1(raw: unknown): ObservationBundleV1 {
  return sanitizeImportedObservationBundleV1(raw);
}

export function sanitizeCanonicalLocalObservationBundleV1(
  raw: unknown
): ObservationBundleV1 {
  return sanitizeObservationBundleWithContext(raw, {
    origin: "canonical-local-artifacts",
    requireAuthorityMetadata: false,
    requireNormalizationMetadata: false,
  });
}

export function sanitizeImportedObservationBundleV1(raw: unknown): ObservationBundleV1 {
  return sanitizeObservationBundleWithContext(raw, {
    origin: "external-import",
    requireAuthorityMetadata: true,
    requireNormalizationMetadata: true,
  });
}

export function sanitizeSupplementalObservationBundleV1(raw: unknown): ObservationBundleV1 {
  return sanitizeObservationBundleWithContext(raw, {
    origin: "supplemental-review",
    requireAuthorityMetadata: false,
    requireNormalizationMetadata: false,
  });
}

export function sanitizeStoredObservationBundleV1(raw: unknown): ObservationBundleV1 {
  const origin = storedOriginKind(raw);
  return sanitizeObservationBundleWithContext(raw, {
    origin,
    requireAuthorityMetadata: true,
    requireNormalizationMetadata: true,
  });
}

export function isObservationNormalizationLossCode(
  value: unknown
): value is ObservationNormalizationLossCode {
  return (
    typeof value === "string" &&
    NORMALIZATION_LOSS_CODE_SET.has(value as ObservationNormalizationLossCode)
  );
}

function sanitizeObservationBundleWithContext(
  raw: unknown,
  context: SanitizeContext
): ObservationBundleV1 {
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

  const normalization = createNormalizationCollector(
    raw.normalization,
    context.requireNormalizationMetadata
  );
  validateStoredAuthority(raw.origin, context, normalization);
  const observationId = safeId(raw.observationId, "obs-unknown");
  const sources = sanitizeSources(raw.sources, normalization, context.origin);
  if (sources.length === 0) {
    throw new ObservationBundleValidationError("Observation bundle has no source records.");
  }
  const sourceIds = new Set(sources.map((source) => source.sourceId));
  const devices = sanitizeDevices(raw.devices, sourceIds, normalization);
  const supplementalEvidence = sanitizeSupplementalEvidence(
    raw.supplementalEvidence,
    normalization,
    context.origin
  );
  const collectorKind = sanitizeCollectorKind(collector.kind, normalization);
  const vantageType = sanitizeVantageType(vantage.type, normalization);
  const networkScope = sanitizeTargetText(site.networkScope, normalization);
  const vantageTarget = sanitizeTargetText(vantage.target, normalization);
  if (networkScope && vantageTarget && networkScope !== vantageTarget) {
    recordLoss(normalization, "conflicting-target-scope");
  }
  const startedAt = sanitizeOptionalTimestamp(batch.startedAt, normalization);
  const endedAt = sanitizeOptionalTimestamp(batch.endedAt, normalization);
  const generatedAt = isoOrNull(batch.generatedAt);
  if (!generatedAt) {
    throw new ObservationBundleValidationError("batch.generatedAt must be a valid ISO timestamp.");
  }
  recordUntrustedCoverageClaim(coverage, context.origin, normalization);
  const normalizedState = finalizeNormalization(normalization);
  const sanitizedCoverage = sanitizeCoverage(
    coverage,
    sources,
    context.origin,
    normalizedState
  );

  const sanitized: ObservationBundleV1 = {
    schemaVersion: SCHEMA_VERSION,
    observationId,
    origin: { kind: context.origin, assignedBy: "server" },
    normalization: normalizedState,
    site: {
      siteId: safeId(site.siteId, "site-unknown"),
      networkName: safeText(site.networkName, 120) || "unknown",
      networkScope,
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
      startedAt,
      endedAt,
      generatedAt,
      partial:
        batch.partial === true ||
        context.origin !== "canonical-local-artifacts" ||
        normalizedState.status === "lossy" ||
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
      target: vantageTarget,
      notes: sanitizeNotes(vantage.notes),
    },
    coverage: sanitizedCoverage,
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

function parseNmapHosts(
  xmlPath: string,
  sourceId: string,
  normalization: NormalizationCollector
): ParsedNmapArtifact {
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
  if (!nmaprun) return { hosts: [], portScanRanges: [] };

  const hosts: ParsedNmapHost[] = [];
  const portScanRanges = parseNmapPortScanRanges(nmaprun, normalization);
  for (const host of asRecordArray(nmaprun.host)) {
    const status = attr(asRecord(host.status), "@_state").toLowerCase();
    if (!status) {
      recordLoss(normalization, "invalid-device-record-dropped");
      continue;
    }
    if (status !== "up") continue;

    const ips: string[] = [];
    const macs: string[] = [];
    const vendors: string[] = [];
    for (const address of asRecordArray(host.address)) {
      const addrType = attr(address, "@_addrtype").toLowerCase();
      const addr = attr(address, "@_addr");
      if (addrType === "ipv4" || addrType === "ipv6") {
        const family = isIP(addr);
        if ((addrType === "ipv4" && family === 4) || (addrType === "ipv6" && family === 6)) {
          ips.push(addr.toLowerCase());
        } else {
          recordLoss(normalization, "invalid-ip-address-dropped");
        }
      }
      if (addrType === "mac") {
        const mac = normalizeMac(addr);
        if (mac) {
          macs.push(mac);
          const vendor = safeText(attr(address, "@_vendor"), 120);
          if (vendor) vendors.push(vendor);
        } else {
          recordLoss(normalization, "invalid-mac-address-dropped");
        }
      }
    }

    const hostnameRecords = asRecordArray(asRecord(host.hostnames)?.hostname);
    const hostnames = hostnameRecords
      .map((hostname) => safeText(attr(hostname, "@_name"), 120))
      .filter(Boolean);
    if (hostnames.length < hostnameRecords.length) {
      recordLoss(
        normalization,
        "invalid-identity-evidence-dropped",
        hostnameRecords.length - hostnames.length
      );
    }

    const openPorts: ObservationOpenPort[] = [];
    const portsRecord = asRecord(host.ports);
    const portRecords = asRecordArray(portsRecord?.port);
    const extraPortRecords = asRecordArray(portsRecord?.extraports);
    const completeStateEvidence = hasCompletePortStateEvidence(
      portRecords,
      extraPortRecords,
      portScanRanges
    );
    for (const port of portRecords) {
      const state = attr(asRecord(port.state), "@_state").toLowerCase();
      if (state === "closed") continue;
      if (state !== "open") {
        recordLoss(normalization, "non-open-port-state");
        continue;
      }
      const portNumber = strictPortString(attr(port, "@_portid"));
      if (portNumber === null) {
        recordLoss(normalization, "invalid-open-port-dropped");
        continue;
      }
      const protocol = sanitizePortProtocol(attr(port, "@_protocol"));
      if (!protocol) {
        recordLoss(normalization, "unsupported-port-protocol");
        continue;
      }
      const service = asRecord(port.service);
      openPorts.push({
        protocol,
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
        portCoverage: portScanRanges.map((coverage) => ({
          sourceId,
          protocol: coverage.protocol,
          ranges: coverage.ranges,
          stateEvidence: completeStateEvidence ? "complete" : "partial",
        })),
      });
    }
  }

  return { hosts, portScanRanges };
}

function parseNmapPortScanRanges(
  nmaprun: XmlRecord,
  normalization: NormalizationCollector
): Array<{ protocol: ObservationPortProtocol; ranges: ObservationPortRange[] }> {
  const byProtocol = new Map<ObservationPortProtocol, ObservationPortRange[]>();
  for (const scanInfo of asRecordArray(nmaprun.scaninfo)) {
    const protocol = sanitizePortProtocol(attr(scanInfo, "@_protocol"));
    const ranges = parseDeclaredPortRanges(attr(scanInfo, "@_services"));
    const declaredCount = strictNonNegativeIntegerString(attr(scanInfo, "@_numservices"));
    const actualCount = ranges.reduce((sum, range) => sum + range.end - range.start + 1, 0);
    if (!protocol || ranges.length === 0 || declaredCount === null || declaredCount !== actualCount) {
      recordLoss(normalization, "invalid-port-range-dropped");
      continue;
    }
    byProtocol.set(
      protocol,
      mergePortRanges([...(byProtocol.get(protocol) ?? []), ...ranges])
    );
  }
  return [...byProtocol.entries()].map(([protocol, ranges]) => ({ protocol, ranges }));
}

function parseDeclaredPortRanges(value: string): ObservationPortRange[] {
  if (!value.trim()) return [];
  const ranges: ObservationPortRange[] = [];
  for (const token of value.split(",")) {
    const match = /^\s*(\d{1,5})(?:-(\d{1,5}))?\s*$/.exec(token);
    if (!match) return [];
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end > 65535 || start > end) return [];
    ranges.push({ start, end });
  }
  return mergePortRanges(ranges);
}

function mergePortRanges(ranges: ObservationPortRange[]): ObservationPortRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
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

function weakerPortStateEvidence(
  left: ObservationPortCoverage["stateEvidence"],
  right: ObservationPortCoverage["stateEvidence"]
): ObservationPortCoverage["stateEvidence"] {
  const rank: Record<ObservationPortCoverage["stateEvidence"], number> = {
    unknown: 0,
    partial: 1,
    complete: 2,
  };
  return rank[left] <= rank[right] ? left : right;
}

function hasCompletePortStateEvidence(
  portRecords: XmlRecord[],
  extraPortRecords: XmlRecord[],
  declarations: Array<{ protocol: ObservationPortProtocol; ranges: ObservationPortRange[] }>
): boolean {
  const declaredCount = declarations.reduce(
    (sum, declaration) =>
      sum + declaration.ranges.reduce((count, range) => count + range.end - range.start + 1, 0),
    0
  );
  if (declaredCount === 0) return false;

  const explicit = new Set<string>();
  for (const port of portRecords) {
    const protocol = sanitizePortProtocol(attr(port, "@_protocol"));
    const portNumber = strictPortString(attr(port, "@_portid"));
    const state = attr(asRecord(port.state), "@_state").toLowerCase();
    const declaration = declarations.find((candidate) => candidate.protocol === protocol);
    if (
      !protocol ||
      portNumber === null ||
      (state !== "open" && state !== "closed") ||
      !declaration?.ranges.some((range) => portNumber >= range.start && portNumber <= range.end)
    ) {
      return false;
    }
    const key = `${protocol}:${portNumber}`;
    if (explicit.has(key)) return false;
    explicit.add(key);
  }

  let implicitClosed = 0;
  for (const extra of extraPortRecords) {
    const count = strictNonNegativeIntegerString(attr(extra, "@_count"));
    if (count === null || attr(extra, "@_state").toLowerCase() !== "closed") return false;
    implicitClosed += count;
  }
  return explicit.size + implicitClosed === declaredCount;
}

function parseHostsUp(
  filePath: string,
  normalization: NormalizationCollector
): string[] {
  assertFileSize(
    filePath,
    MAX_OBSERVATION_HOSTS_UP_BYTES,
    "hosts_up.txt exceeded the metadata size limit."
  );
  const content = fs.readFileSync(filePath, "utf-8");
  const ips: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const value = line.split(/\s+/)[0];
    if (isIP(value)) {
      ips.push(value.toLowerCase());
    } else {
      recordLoss(normalization, "invalid-ip-address-dropped");
    }
  }
  return uniqueStrings(ips);
}

function parseArpSnapshot(
  filePath: string,
  normalization: NormalizationCollector
): { ip: string; mac: string }[] {
  assertFileSize(
    filePath,
    MAX_OBSERVATION_ARP_SNAPSHOT_BYTES,
    "ARP snapshot exceeded the metadata size limit."
  );
  const content = fs.readFileSync(filePath, "utf-8");
  const pairs: { ip: string; mac: string }[] = [];
  const seen = new Set<string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (
      !line ||
      /^Interface:/i.test(line) ||
      /^Internet\s+Address\s+Physical\s+Address\s+Type$/i.test(line) ||
      line.startsWith("#")
    ) continue;
    const ip = line.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0];
    const macMatch =
      line.match(/\b(?:[0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}\b/)?.[0] ??
      line.match(/\b[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\.[0-9a-fA-F]{4}\b/)?.[0];
    const mac = macMatch ? normalizeMac(macMatch) : null;
    if (!ip || !isIpv4(ip) || !mac) {
      recordLoss(normalization, ip ? "invalid-mac-address-dropped" : "invalid-ip-address-dropped");
      continue;
    }
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
  for (const coverage of host.portCoverage) {
    const key = `${coverage.sourceId}:${coverage.protocol}`;
    const existing = device.portCoverage.get(key);
    device.portCoverage.set(key, {
      ...coverage,
      ranges: mergePortRanges([...(existing?.ranges ?? []), ...coverage.ranges]),
      stateEvidence: existing
        ? weakerPortStateEvidence(existing.stateEvidence, coverage.stateEvidence)
        : coverage.stateEvidence,
    });
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
  for (const [key, value] of source.portCoverage) {
    const existing = target.portCoverage.get(key);
    target.portCoverage.set(
      key,
      existing
        ? {
            ...existing,
            ranges: mergePortRanges([...existing.ranges, ...value.ranges]),
            stateEvidence: weakerPortStateEvidence(
              existing.stateEvidence,
              value.stateEvidence
            ),
          }
        : value
    );
  }
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
      identityEvidence: [...device.evidence.values()],
      openPorts: [...device.openPorts.values()]
        .sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol)),
      portCoverage: [...device.portCoverage.values()],
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

function createNormalizationCollector(
  value: unknown,
  requireMetadata: boolean
): NormalizationCollector {
  const collector: NormalizationCollector = {
    inherited: new Map(),
    current: new Map(),
  };
  if (value === undefined || value === null) {
    if (requireMetadata) recordLoss(collector, "normalization-metadata-missing");
    return collector;
  }
  if (!isRecord(value) || !Array.isArray(value.losses)) {
    recordLoss(collector, "normalization-metadata-invalid");
    return collector;
  }

  let invalid = value.status !== "complete" && value.status !== "lossy";
  for (const rawLoss of value.losses) {
    if (
      !isRecord(rawLoss) ||
      !NORMALIZATION_LOSS_CODE_SET.has(rawLoss.code as ObservationNormalizationLossCode) ||
      typeof rawLoss.count !== "number" ||
      !Number.isInteger(rawLoss.count) ||
      rawLoss.count < 1
    ) {
      invalid = true;
      continue;
    }
    const code = rawLoss.code as ObservationNormalizationLossCode;
    const count = Math.min(MAX_NORMALIZATION_LOSS_COUNT, rawLoss.count);
    collector.inherited.set(code, Math.max(collector.inherited.get(code) ?? 0, count));
  }
  if (
    (value.status === "complete" && collector.inherited.size > 0) ||
    (value.status === "lossy" && collector.inherited.size === 0)
  ) {
    invalid = true;
  }
  if (invalid) recordLoss(collector, "normalization-metadata-invalid");
  return collector;
}

function recordLoss(
  collector: NormalizationCollector,
  code: ObservationNormalizationLossCode,
  count = 1
): void {
  if (!Number.isFinite(count) || count <= 0) return;
  const bounded = Math.min(MAX_NORMALIZATION_LOSS_COUNT, Math.floor(count));
  collector.current.set(
    code,
    Math.min(MAX_NORMALIZATION_LOSS_COUNT, (collector.current.get(code) ?? 0) + bounded)
  );
}

function recordRetainedLoss(
  collector: NormalizationCollector,
  code: ObservationNormalizationLossCode,
  count = 1
): void {
  if (!Number.isFinite(count) || count <= 0) return;
  const target = Math.min(MAX_NORMALIZATION_LOSS_COUNT, Math.floor(count));
  const alreadyRecorded =
    (collector.inherited.get(code) ?? 0) + (collector.current.get(code) ?? 0);
  if (target > alreadyRecorded) {
    recordLoss(collector, code, target - alreadyRecorded);
  }
}

function finalizeNormalization(collector: NormalizationCollector): ObservationNormalization {
  const codes = new Set([...collector.inherited.keys(), ...collector.current.keys()]);
  const losses = [...codes]
    .sort()
    .map((code) => ({
      code,
      count: Math.min(
        MAX_NORMALIZATION_LOSS_COUNT,
        (collector.inherited.get(code) ?? 0) + (collector.current.get(code) ?? 0)
      ),
    }));
  return { status: losses.length > 0 ? "lossy" : "complete", losses };
}

function storedOriginKind(raw: unknown): ObservationOriginKind {
  if (!isRecord(raw) || !isRecord(raw.origin)) return "legacy-unknown";
  return raw.origin.assignedBy === "server" &&
    ORIGIN_KIND_SET.has(raw.origin.kind as ObservationOriginKind)
    ? (raw.origin.kind as ObservationOriginKind)
    : "legacy-unknown";
}

function validateStoredAuthority(
  value: unknown,
  context: SanitizeContext,
  normalization: NormalizationCollector
): void {
  if (!context.requireAuthorityMetadata) return;
  if (value === undefined || value === null) {
    recordLoss(normalization, "authority-metadata-missing");
    return;
  }
  if (
    !isRecord(value) ||
    value.assignedBy !== "server" ||
    value.kind !== context.origin ||
    !ORIGIN_KIND_SET.has(value.kind as ObservationOriginKind)
  ) {
    recordLoss(normalization, "authority-metadata-invalid");
  }
}

function sanitizeSources(
  rawSources: unknown[],
  normalization: NormalizationCollector,
  origin: ObservationOriginKind
): ObservationSourceRef[] {
  const candidates: ObservationSourceRef[] = [];
  const untrustedClaims = { count: 0 };
  for (const raw of rawSources) {
    if (!isRecord(raw)) {
      recordLoss(normalization, "invalid-source-record-dropped");
      continue;
    }
    const source = sanitizeSource(raw, normalization, origin, untrustedClaims);
    if (source) candidates.push(source);
  }
  recordRetainedLoss(
    normalization,
    "untrusted-source-claim-ignored",
    untrustedClaims.count
  );
  const counts = new Map<string, number>();
  for (const source of candidates) {
    counts.set(source.sourceId, (counts.get(source.sourceId) ?? 0) + 1);
  }
  const collidedIds = new Set(
    [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id)
  );
  const unique = candidates.filter((source) => !collidedIds.has(source.sourceId));
  const collisions = candidates.length - unique.length;
  if (collisions > 0) recordLoss(normalization, "source-id-collision", collisions);
  if (unique.length > MAX_SOURCES) {
    recordLoss(normalization, "source-limit-exceeded", unique.length - MAX_SOURCES);
  }
  return unique.slice(0, MAX_SOURCES);
}

function sanitizeSource(
  raw: Record<string, unknown>,
  normalization: NormalizationCollector,
  origin: ObservationOriginKind,
  untrustedClaims: { count: number }
): ObservationSourceRef | null {
  const sourceId = safeId(raw.sourceId, "");
  if (!sourceId) {
    recordLoss(normalization, "invalid-source-record-dropped");
    return null;
  }
  if (!SOURCE_KIND_SET.has(raw.kind as ObservationSourceKind)) {
    recordLoss(normalization, "invalid-source-kind");
    return null;
  }
  if (
    typeof raw.parsed !== "boolean" ||
    typeof raw.recordCount !== "number" ||
    !Number.isFinite(raw.recordCount) ||
    raw.recordCount < 0
  ) {
    recordLoss(normalization, "invalid-source-record-dropped");
    return null;
  }
  const preserveSourceClaim =
    origin === "canonical-local-artifacts" ||
    origin === "supplemental-review" ||
    origin === "server-synthetic-demo";
  if (!preserveSourceClaim && (raw.parsed !== false || raw.recordCount !== 0)) {
    untrustedClaims.count += 1;
  }
  return {
    sourceId,
    kind: raw.kind as ObservationSourceKind,
    artifactLabel: safeText(raw.artifactLabel, 80) || "unknown",
    fileName: sanitizeFileName(raw.fileName),
    parsed: preserveSourceClaim ? raw.parsed : false,
    recordCount: preserveSourceClaim ? Math.floor(raw.recordCount) : 0,
    notes: sanitizeNotes(raw.notes),
  };
}

function sanitizeDevices(
  rawDevices: unknown[],
  sourceIds: Set<string>,
  normalization: NormalizationCollector
): ObservationDevice[] {
  const candidates: ObservationDevice[] = [];
  for (const raw of rawDevices) {
    if (!isRecord(raw)) {
      recordLoss(normalization, "invalid-device-record-dropped");
      continue;
    }
    const device = sanitizeDevice(raw, sourceIds, normalization);
    if (device) candidates.push(device);
  }
  const counts = new Map<string, number>();
  for (const device of candidates) {
    counts.set(device.deviceId, (counts.get(device.deviceId) ?? 0) + 1);
  }
  const unique = candidates.filter((device) => counts.get(device.deviceId) === 1);
  const collisions = candidates.length - unique.length;
  if (collisions > 0) recordLoss(normalization, "device-id-collision", collisions);
  if (unique.length > MAX_DEVICES) {
    recordLoss(normalization, "device-limit-exceeded", unique.length - MAX_DEVICES);
  }
  return unique.slice(0, MAX_DEVICES);
}

function sanitizeDevice(
  raw: Record<string, unknown>,
  sourceIds: Set<string>,
  normalization: NormalizationCollector
): ObservationDevice | null {
  const deviceId = safeId(raw.deviceId, "");
  if (!deviceId) {
    recordLoss(normalization, "invalid-device-record-dropped");
    return null;
  }
  const evidenceRecords = Array.isArray(raw.identityEvidence) ? raw.identityEvidence : [];
  if (raw.identityEvidence !== undefined && !Array.isArray(raw.identityEvidence)) {
    recordLoss(normalization, "invalid-identity-evidence-dropped");
  }
  const identityEvidence = evidenceRecords
    .map((evidence) =>
      isRecord(evidence) ? sanitizeEvidence(evidence, sourceIds, normalization) : null
    )
    .filter((evidence): evidence is DeviceIdentityEvidence => evidence !== null);
  const invalidEvidenceRecords = evidenceRecords.filter((evidence) => !isRecord(evidence)).length;
  if (invalidEvidenceRecords) {
    recordLoss(normalization, "invalid-identity-evidence-dropped", invalidEvidenceRecords);
  }
  if (identityEvidence.length > MAX_EVIDENCE_PER_DEVICE) {
    recordLoss(
      normalization,
      "identity-evidence-limit-exceeded",
      identityEvidence.length - MAX_EVIDENCE_PER_DEVICE
    );
  }

  const portRecords = Array.isArray(raw.openPorts) ? raw.openPorts : [];
  if (raw.openPorts !== undefined && !Array.isArray(raw.openPorts)) {
    recordLoss(normalization, "invalid-open-port-dropped");
  }
  const openPorts = portRecords
    .map((port) => (isRecord(port) ? sanitizeOpenPort(port, sourceIds, normalization) : null))
    .filter((port): port is ObservationOpenPort => port !== null);
  const invalidPortRecords = portRecords.filter((port) => !isRecord(port)).length;
  if (invalidPortRecords) recordLoss(normalization, "invalid-open-port-dropped", invalidPortRecords);
  if (openPorts.length > MAX_OPEN_PORTS_PER_DEVICE) {
    recordLoss(
      normalization,
      "open-port-limit-exceeded",
      openPorts.length - MAX_OPEN_PORTS_PER_DEVICE
    );
  }

  const portCoverage = sanitizePortCoverage(raw.portCoverage, sourceIds, normalization);
  const device: ObservationDevice = {
    deviceId,
    firstSeen: sanitizeOptionalTimestamp(raw.firstSeen, normalization),
    lastSeen: sanitizeOptionalTimestamp(raw.lastSeen, normalization),
    ips: sanitizeIpArray(raw.ips, normalization),
    macs: sanitizeMacArray(raw.macs, normalization),
    hostnames: sanitizeIdentityTextArray(raw.hostnames, 120, normalization),
    vendors: sanitizeIdentityTextArray(raw.vendors, 120, normalization),
    identityEvidence: identityEvidence.slice(0, MAX_EVIDENCE_PER_DEVICE),
    openPorts: openPorts.slice(0, MAX_OPEN_PORTS_PER_DEVICE),
    notes: sanitizeNotes(raw.notes),
  };
  if (portCoverage.length > 0) device.portCoverage = portCoverage;
  return device;
}

function sanitizeEvidence(
  raw: Record<string, unknown>,
  sourceIds: Set<string>,
  normalization: NormalizationCollector
): DeviceIdentityEvidence | null {
  const kind = EVIDENCE_KIND_SET.has(raw.kind as ObservationEvidenceKind)
    ? (raw.kind as ObservationEvidenceKind)
    : null;
  const sourceId = safeId(raw.sourceId, "");
  if (!sourceId || !sourceIds.has(sourceId)) {
    recordLoss(normalization, "invalid-source-reference");
    return null;
  }
  if (!kind || !EVIDENCE_CONFIDENCE_SET.has(raw.confidence as ObservationEvidenceConfidence)) {
    recordLoss(normalization, "invalid-identity-evidence-dropped");
    return null;
  }
  let value = safeText(raw.value, 160);
  if (kind === "ip-address" || kind === "host-up") {
    value = isIP(value) ? value.toLowerCase() : "";
  } else if (kind === "mac-address") {
    value = normalizeMac(value) ?? "";
  } else if (kind === "arp-neighbor") {
    const [ip, macValue, ...rest] = value.split(/\s+/);
    const mac = normalizeMac(macValue ?? "");
    value = rest.length === 0 && isIP(ip) && mac ? `${ip.toLowerCase()} ${mac}` : "";
  }
  if (!value) {
    recordLoss(normalization, "invalid-identity-evidence-dropped");
    return null;
  }
  return {
    evidenceId: safeId(
      raw.evidenceId,
      `ev-${hashString(`${kind}|${value}|${sourceId}`).slice(0, 12)}`
    ),
    kind,
    value,
    sourceId,
    confidence: raw.confidence as ObservationEvidenceConfidence,
  };
}

function sanitizeOpenPort(
  raw: Record<string, unknown>,
  sourceIds: Set<string>,
  normalization: NormalizationCollector
): ObservationOpenPort | null {
  const sourceId = safeId(raw.sourceId, "");
  if (!sourceId || !sourceIds.has(sourceId)) {
    recordLoss(normalization, "invalid-source-reference");
    return null;
  }
  if (raw.state !== "open") {
    recordLoss(normalization, "non-open-port-state");
    return null;
  }
  const protocol = sanitizePortProtocol(raw.protocol);
  if (!protocol) {
    recordLoss(normalization, "unsupported-port-protocol");
    return null;
  }
  const port = portInteger(raw.port);
  if (port === null) {
    recordLoss(normalization, "invalid-open-port-dropped");
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

function sanitizePortCoverage(
  value: unknown,
  sourceIds: Set<string>,
  normalization: NormalizationCollector
): ObservationPortCoverage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    recordLoss(normalization, "invalid-port-coverage-dropped");
    return [];
  }
  const valid: ObservationPortCoverage[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) {
      recordLoss(normalization, "invalid-port-coverage-dropped");
      continue;
    }
    const sourceId = safeId(raw.sourceId, "");
    const protocol = sanitizePortProtocol(raw.protocol);
    const stateEvidence = raw.stateEvidence;
    if (
      !sourceId ||
      !sourceIds.has(sourceId) ||
      !protocol ||
      (stateEvidence !== "complete" && stateEvidence !== "partial" && stateEvidence !== "unknown") ||
      !Array.isArray(raw.ranges)
    ) {
      recordLoss(normalization, "invalid-port-coverage-dropped");
      continue;
    }
    const ranges: ObservationPortRange[] = [];
    for (const range of raw.ranges) {
      if (
        !isRecord(range) ||
        portInteger(range.start) === null ||
        portInteger(range.end) === null ||
        (range.start as number) > (range.end as number)
      ) {
        recordLoss(normalization, "invalid-port-range-dropped");
        continue;
      }
      ranges.push({ start: range.start as number, end: range.end as number });
    }
    const merged = mergePortRanges(ranges);
    if (merged.length > MAX_PORT_RANGES_PER_COVERAGE) {
      recordLoss(
        normalization,
        "port-range-limit-exceeded",
        merged.length - MAX_PORT_RANGES_PER_COVERAGE
      );
    }
    if (merged.length === 0) {
      recordLoss(normalization, "invalid-port-coverage-dropped");
      continue;
    }
    valid.push({
      sourceId,
      protocol,
      ranges: merged.slice(0, MAX_PORT_RANGES_PER_COVERAGE),
      stateEvidence,
    });
  }
  if (valid.length > MAX_PORT_COVERAGE_PER_DEVICE) {
    recordLoss(
      normalization,
      "port-coverage-limit-exceeded",
      valid.length - MAX_PORT_COVERAGE_PER_DEVICE
    );
  }
  return valid.slice(0, MAX_PORT_COVERAGE_PER_DEVICE);
}

function sanitizeIpArray(value: unknown, normalization: NormalizationCollector): string[] {
  if (!Array.isArray(value)) {
    if (value !== undefined) recordLoss(normalization, "invalid-ip-address-dropped");
    return [];
  }
  const ips: string[] = [];
  for (const item of value) {
    const candidate = safeText(item, 80);
    if (candidate && isIP(candidate)) {
      ips.push(candidate.toLowerCase());
    } else {
      recordLoss(normalization, "invalid-ip-address-dropped");
    }
  }
  return uniqueStrings(ips);
}

function sanitizeMacArray(value: unknown, normalization: NormalizationCollector): string[] {
  if (!Array.isArray(value)) {
    if (value !== undefined) recordLoss(normalization, "invalid-mac-address-dropped");
    return [];
  }
  const macs: string[] = [];
  for (const item of value) {
    const mac = typeof item === "string" ? normalizeMac(item) : null;
    if (mac) macs.push(mac);
    else recordLoss(normalization, "invalid-mac-address-dropped");
  }
  return uniqueStrings(macs);
}

function sanitizeIdentityTextArray(
  value: unknown,
  maxLength: number,
  normalization: NormalizationCollector
): string[] {
  if (!Array.isArray(value)) {
    if (value !== undefined) recordLoss(normalization, "invalid-identity-evidence-dropped");
    return [];
  }
  const sanitized = value.map((item) => safeText(item, maxLength)).filter(Boolean);
  if (sanitized.length < value.length) {
    recordLoss(
      normalization,
      "invalid-identity-evidence-dropped",
      value.length - sanitized.length
    );
  }
  return uniqueStrings(sanitized);
}

function sanitizeCoverage(
  raw: Record<string, unknown>,
  sources: ObservationSourceRef[],
  origin: ObservationOriginKind,
  normalization: ObservationNormalization
): CoverageRecord {
  const retainedLabels = uniqueStrings(
    sources.filter((source) => source.parsed).map((source) => coverageLabelForSource(source.artifactLabel))
  );
  if (origin !== "canonical-local-artifacts") {
    return {
      status: "minimal",
      score: 0,
      expectedSources: [],
      presentSources: [],
      missingSources: [],
      notes: sanitizeNotes(raw.notes),
    };
  }

  const present = EXPECTED_SOURCE_LABELS.filter((label) => retainedLabels.includes(label));
  const score = EXPECTED_SOURCE_LABELS.reduce(
    (sum, label) => sum + (present.includes(label) ? COVERAGE_WEIGHTS[label] : 0),
    0
  );
  const roundedScore = Math.round(score * 100) / 100;
  const missingSources = EXPECTED_SOURCE_LABELS.filter((label) => !present.includes(label));
  let status = coverageStatusFor(roundedScore, missingSources);
  if (normalization.status === "lossy" && status === "complete") status = "partial";
  return {
    status,
    score: roundedScore,
    expectedSources: [...EXPECTED_SOURCE_LABELS],
    presentSources: present,
    missingSources,
    notes: sanitizeNotes(raw.notes),
  };
}

function recordUntrustedCoverageClaim(
  raw: Record<string, unknown>,
  origin: ObservationOriginKind,
  normalization: NormalizationCollector
): void {
  if (origin !== "external-import") return;
  if (
    raw.status !== "minimal" ||
    raw.score !== 0 ||
    hasNonEmptyArray(raw.expectedSources) ||
    hasNonEmptyArray(raw.presentSources) ||
    hasNonEmptyArray(raw.missingSources)
  ) {
    recordLoss(normalization, "untrusted-coverage-claim-ignored");
  }
}

function hasNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function sameStringArray(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function sanitizeCollectorKind(
  value: unknown,
  normalization: NormalizationCollector
): "registered-scan-run" | "packet-highway-analysis" | "unknown" {
  if (value === "registered-scan-run" || value === "packet-highway-analysis") return value;
  recordLoss(normalization, "invalid-collector-kind");
  return "unknown";
}

function sanitizeVantageType(
  value: unknown,
  normalization: NormalizationCollector
): CollectionVantage["type"] {
  if (VANTAGE_TYPE_SET.has(value as CollectionVantage["type"])) {
    return value as CollectionVantage["type"];
  }
  recordLoss(normalization, "invalid-vantage-type");
  return "unknown";
}

function sanitizeOptionalTimestamp(
  value: unknown,
  normalization: NormalizationCollector
): string | null {
  const timestamp = isoOrNull(value);
  if (value !== undefined && value !== null && !timestamp) {
    recordLoss(normalization, "invalid-timestamp");
  }
  return timestamp;
}

function sanitizeTargetText(
  value: unknown,
  normalization: NormalizationCollector
): string | null {
  if (value === undefined || value === null || value === "") return null;
  const target = safeTextOrNull(value, 120);
  if (!target) recordLoss(normalization, "invalid-target-scope");
  return target;
}

function sanitizeSupplementalEvidence(
  value: unknown,
  normalization: NormalizationCollector,
  origin: ObservationOriginKind
): ObservationSupplementalEvidence[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    recordLoss(normalization, "invalid-supplemental-evidence-dropped");
    return undefined;
  }

  const evidence = value
    .map((item) =>
      isRecord(item) ? sanitizeSupplementalEvidenceItem(item, normalization, origin) : null
    )
    .filter((item): item is ObservationSupplementalEvidence => item !== null);
  const invalid = value.length - evidence.length;
  if (invalid > 0) {
    recordLoss(normalization, "invalid-supplemental-evidence-dropped", invalid);
  }
  if (evidence.length > MAX_SUPPLEMENTAL_EVIDENCE) {
    recordLoss(
      normalization,
      "supplemental-evidence-limit-exceeded",
      evidence.length - MAX_SUPPLEMENTAL_EVIDENCE
    );
  }

  const retainedEvidence = evidence.slice(0, MAX_SUPPLEMENTAL_EVIDENCE);
  const fixtureSanitizationLoss = retainedEvidence.reduce(
    (total, item) => saturatingAddNormalizationLoss(
      total,
      item.packetHighway?.capture.meta.fixtureSanitizationLoss.count ?? 0
    ),
    0
  );
  recordRetainedLoss(
    normalization,
    "packet-highway-fixture-sanitization-loss",
    fixtureSanitizationLoss
  );

  return retainedEvidence.length > 0 ? retainedEvidence : undefined;
}

function saturatingAddNormalizationLoss(total: number, count: number): number {
  const boundedTotal = Math.min(MAX_NORMALIZATION_LOSS_COUNT, Math.max(0, Math.floor(total)));
  const boundedCount = Math.min(MAX_NORMALIZATION_LOSS_COUNT, Math.max(0, Math.floor(count)));
  return Math.min(MAX_NORMALIZATION_LOSS_COUNT, boundedTotal + boundedCount);
}

function isUntrustedPacketHighwayOrigin(origin: ObservationOriginKind): boolean {
  return origin !== "canonical-local-artifacts" && origin !== "server-synthetic-demo";
}

function sanitizeSupplementalEvidenceItem(
  raw: Record<string, unknown>,
  normalization: NormalizationCollector,
  origin: ObservationOriginKind
): ObservationSupplementalEvidence | null {
  if (raw.kind !== "packet-highway-analysis") return null;

  const packetHighway = sanitizePacketHighwayEvidence(
    raw.packetHighway,
    normalization,
    origin
  );
  if (!packetHighway) return null;

  const reviewOnly = isUntrustedPacketHighwayOrigin(origin);
  const reviewLabel = origin === "supplemental-review"
    ? SUPPLEMENTAL_PACKET_HIGHWAY_LABEL : IMPORTED_PACKET_HIGHWAY_LABEL;
  const reviewSummary = origin === "supplemental-review"
    ? SUPPLEMENTAL_PACKET_HIGHWAY_SUMMARY : IMPORTED_PACKET_HIGHWAY_SUMMARY;
  if (reviewOnly && (raw.label !== reviewLabel || raw.summary !== reviewSummary)) {
    recordLoss(normalization, "untrusted-supplemental-claim-ignored");
  }

  return {
    evidenceId: safeId(raw.evidenceId, `phe-${hashString(packetHighway.capture.meta.generatedAt).slice(0, 12)}`),
    kind: "packet-highway-analysis",
    label: reviewOnly ? reviewLabel :
      safeText(raw.label, 120) || "Packet Highway analysis",
    summary: reviewOnly ? reviewSummary :
      safeText(raw.summary, 240) || "Supplemental Packet Highway metadata linked to this observation.",
    packetHighway,
  };
}

function sanitizePacketHighwayEvidence(
  raw: unknown,
  normalization: NormalizationCollector,
  origin: ObservationOriginKind
): ObservationSupplementalEvidence["packetHighway"] | undefined {
  if (!isRecord(raw)) return undefined;

  const captureJson = JSON.stringify(raw.capture);
  if (!captureJson) return undefined;

  try {
    const capture = sanitizePacketHighwayCaptureForObservation(
      parseNormalizedCaptureFixture(captureJson, { dropInvalidFlows: true }),
      normalization,
      origin
    );
    if (capture.meta.truncated) {
      recordRetainedLoss(normalization, "packet-highway-capture-truncated");
    }
    if (capture.meta.ignoredPackets > 0) {
      recordRetainedLoss(
        normalization,
        "packet-highway-records-ignored",
        capture.meta.ignoredPackets
      );
    }
    if (
      isUntrustedPacketHighwayOrigin(origin) &&
      (!sameStringArray(raw.canSupport, PACKET_HIGHWAY_CAN_SUPPORT) ||
        !sameStringArray(raw.cannotProve, PACKET_HIGHWAY_CANNOT_PROVE) ||
        !sameStringArray(raw.limitations, PACKET_HIGHWAY_LIMITATIONS))
    ) {
      recordLoss(normalization, "untrusted-supplemental-claim-ignored");
    }
    return {
      capture,
      canSupport: [...PACKET_HIGHWAY_CAN_SUPPORT],
      cannotProve: [...PACKET_HIGHWAY_CANNOT_PROVE],
      limitations: [...PACKET_HIGHWAY_LIMITATIONS],
    };
  } catch {
    return undefined;
  }
}

function sanitizePacketHighwayCaptureForObservation(
  capture: NormalizedCapture,
  normalization: NormalizationCollector,
  origin: ObservationOriginKind
): NormalizedCapture {
  const sanitized: NormalizedCapture = {
    ...capture,
    meta: {
      ...capture.meta,
      fileName: sanitizeFileName(capture.meta.fileName) ?? "analysis.json",
    },
    devices: capture.devices.map((device) => {
      const ips = device.ips.filter((ip) => isIP(ip)).map((ip) => ip.toLowerCase());
      if (ips.length < device.ips.length) {
        recordLoss(
          normalization,
          "invalid-ip-address-dropped",
          device.ips.length - ips.length
        );
      }
      const mac = device.mac ? normalizeMac(device.mac) : null;
      if (device.mac && !mac) recordLoss(normalization, "invalid-mac-address-dropped");
      return {
        ...device,
        id: safeId(device.id, "dev-unknown"),
        mac,
        ips,
        name: safeTextOrNull(device.name, 80),
        vendor: safeTextOrNull(device.vendor, 80),
        notes: safeTextOrNull(device.notes, MAX_PACKET_HIGHWAY_DEVICE_NOTE_LENGTH),
      };
    }),
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
  if (isUntrustedPacketHighwayOrigin(origin)) {
    const importedSummary = summarizeImportedPacketHighwayCapture(sanitized);
    const changed = JSON.stringify(sanitized.summary) !== JSON.stringify(importedSummary) ||
      sanitized.alerts.length > 0;
    if (changed) {
      recordLoss(normalization, "untrusted-supplemental-claim-ignored");
    }
    sanitized.summary = importedSummary;
    sanitized.alerts = [];
  }
  return sanitized;
}

function summarizeImportedPacketHighwayCapture(capture: NormalizedCapture): NormalizedCapture["summary"] {
  return {
    headline: IMPORTED_PACKET_HIGHWAY_HEADLINE,
    lines: [...IMPORTED_PACKET_HIGHWAY_LINES],
    stats: {
      deviceCount: capture.devices.length,
      knownDeviceCount: capture.devices.filter((device) => device.isKnown).length,
      externalEndpointCount: capture.externalEndpoints.length,
      flowCount: capture.flows.length,
      dnsQueryCount: Math.min(Number.MAX_SAFE_INTEGER,
        capture.dnsQueries.reduce((sum, query) => sum + query.count, 0)),
      uniqueDnsNames: new Set(capture.dnsQueries.map((query) => query.name)).size,
      categoryBytes: {},
    },
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

function portInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 65535
    ? value
    : null;
}

function strictPortString(value: string): number | null {
  if (!/^\d{1,5}$/.test(value)) return null;
  return portInteger(Number(value));
}

function strictNonNegativeIntegerString(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function sanitizePortProtocol(value: unknown): ObservationPortProtocol | null {
  if (typeof value !== "string") return null;
  const protocol = value.trim().toLowerCase();
  return PORT_PROTOCOL_SET.has(protocol as ObservationPortProtocol)
    ? (protocol as ObservationPortProtocol)
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

const PORT_PROTOCOL_SET = new Set<ObservationPortProtocol>(["tcp", "udp", "sctp"]);
const ORIGIN_KIND_SET = new Set<ObservationOriginKind>([
  "canonical-local-artifacts",
  "server-synthetic-demo",
  "external-import",
  "supplemental-review",
  "legacy-unknown",
]);
const NORMALIZATION_LOSS_CODE_SET = new Set<ObservationNormalizationLossCode>(
  OBSERVATION_NORMALIZATION_LOSS_CODES
);
