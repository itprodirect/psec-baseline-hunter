/**
 * Observation Bundle v1
 *
 * Metadata-only normalized view of one scan-run observation. It records what a
 * collector observed and which source produced each claim; it does not retain
 * raw scan bodies, packet payloads, filesystem paths, or secrets.
 */

export type ObservationBundleSchemaVersion = "psec.observation-bundle.v1";

export type ObservationSourceKind =
  | "run-manifest"
  | "nmap-xml"
  | "hosts-up"
  | "arp-snapshot"
  | "scan-metadata"
  | "packet-highway-analysis";

export type ObservationEvidenceKind =
  | "ip-address"
  | "mac-address"
  | "hostname"
  | "vendor"
  | "host-up"
  | "arp-neighbor";

export type ObservationEvidenceConfidence = "observed" | "reported" | "weak";

export type ObservationCoverageStatus = "complete" | "partial" | "minimal";

export type ObservationNormalizationReasonCode =
  | "normalization-record-missing"
  | "normalization-record-inconsistent"
  | "source-limit-exceeded"
  | "device-limit-exceeded"
  | "identity-evidence-limit-exceeded"
  | "open-port-limit-exceeded"
  | "port-coverage-limit-exceeded"
  | "port-range-limit-exceeded"
  | "supplemental-evidence-limit-exceeded"
  | "invalid-source-record-dropped"
  | "invalid-device-record-dropped"
  | "invalid-identity-evidence-dropped"
  | "invalid-open-port-dropped"
  | "invalid-port-coverage-dropped"
  | "invalid-port-range-dropped"
  | "invalid-supplemental-evidence-dropped"
  | "invalid-collector-kind"
  | "invalid-vantage-type";

export interface ObservationNormalizationLoss {
  reasonCode: ObservationNormalizationReasonCode;
  path: string;
  inputCount: number;
  retainedCount: number;
  limit: number;
}

export interface ObservationNormalizationRecord {
  status: "complete" | "truncated";
  reasonCodes: ObservationNormalizationReasonCode[];
  losses: ObservationNormalizationLoss[];
}

export type ObservationCoverageReasonCode =
  | "empty-hosts-up"
  | "empty-arp-snapshot"
  | "target-coverage-unverified"
  | "target-provenance-conflict"
  | "normalization-truncated";

export interface ObservationTargetProvenance {
  status: "verified" | "unverified" | "conflicting";
  declaredScope: string | null;
  observedScopes: string[];
}

export type ObservationIdentityReasonCode =
  | "conflicting-identifiers"
  | "weak-identity-evidence"
  | "locator-only-identity";

export interface ObservationIdentityRecord {
  status: "supported" | "uncertain" | "conflicting";
  reasonCodes: ObservationIdentityReasonCode[];
}

export interface SiteRef {
  siteId: string;
  networkName: string;
  networkScope: string | null;
}

export interface CollectorRef {
  collectorId: string;
  kind: "registered-scan-run" | "packet-highway-analysis" | "unknown";
  name: string;
  version: string | null;
}

export interface ObservationBatch {
  batchId: string;
  sourceRunUid: string;
  startedAt: string | null;
  endedAt: string | null;
  generatedAt: string;
  partial: boolean;
  notes: string[];
}

export interface ObservationSourceRef {
  sourceId: string;
  kind: ObservationSourceKind;
  artifactLabel: string;
  fileName: string | null;
  parsed: boolean;
  recordCount: number;
  notes: string[];
  /** Canonical collection targets parsed from the source artifact, when available. */
  targetScopes?: string[];
  /** Artifact completion state used when evaluating collection provenance. */
  completionStatus?: "success" | "failed" | "unknown";
}

export interface CollectionVantage {
  type:
    | "active-scan-upload"
    | "packet-highway-this-computer"
    | "packet-highway-gateway-router"
    | "packet-highway-mirror-tap"
    | "packet-highway-unknown"
    | "unknown";
  runType: string | null;
  networkName: string;
  collectorHost: string | null;
  target: string | null;
  notes: string[];
}

export interface CoverageRecord {
  status: ObservationCoverageStatus;
  score: number;
  expectedSources: string[];
  presentSources: string[];
  missingSources: string[];
  notes: string[];
  /** Stable loss/provenance reasons computed by the normalizer. */
  reasonCodes?: ObservationCoverageReasonCode[];
  /** Target scope corroborated by collection artifacts, not metadata alone. */
  targetProvenance?: ObservationTargetProvenance;
}

export interface DeviceIdentityEvidence {
  evidenceId: string;
  kind: ObservationEvidenceKind;
  value: string;
  sourceId: string;
  confidence: ObservationEvidenceConfidence;
}

export interface ObservationOpenPort {
  protocol: string;
  port: number;
  state: "open";
  service: string | null;
  product: string | null;
  version: string | null;
  sourceId: string;
}

export interface ObservationPortRange {
  start: number;
  end: number;
}

export interface ObservationPortCoverage {
  sourceId: string;
  protocol: string;
  ranges: ObservationPortRange[];
}

export interface ObservationDevice {
  deviceId: string;
  firstSeen: string | null;
  lastSeen: string | null;
  ips: string[];
  macs: string[];
  hostnames: string[];
  vendors: string[];
  identityEvidence: DeviceIdentityEvidence[];
  openPorts: ObservationOpenPort[];
  /** Declared Nmap scan ranges for this device, only when port-state evidence was present. */
  portCoverage?: ObservationPortCoverage[];
  notes: string[];
}

export type ObservationSupplementalEvidenceKind = "packet-highway-analysis";

export interface ObservationSupplementalEvidence {
  evidenceId: string;
  kind: ObservationSupplementalEvidenceKind;
  label: string;
  summary: string;
  packetHighway?: {
    capture: import("./packet-highway").NormalizedCapture;
    canSupport: string[];
    cannotProve: string[];
    limitations: string[];
  };
}

export interface ObservationBundleV1 {
  schemaVersion: ObservationBundleSchemaVersion;
  observationId: string;
  site: SiteRef;
  collector: CollectorRef;
  batch: ObservationBatch;
  sources: ObservationSourceRef[];
  vantage: CollectionVantage;
  coverage: CoverageRecord;
  /** Present on normalized output; optional only for backwards-compatible imports. */
  normalization?: ObservationNormalizationRecord;
  /** Within-observation identity integrity computed during normalization. */
  identity?: ObservationIdentityRecord;
  devices: ObservationDevice[];
  supplementalEvidence?: ObservationSupplementalEvidence[];
  notes: string[];
}
