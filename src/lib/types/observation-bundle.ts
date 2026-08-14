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

/**
 * Authority assigned by a server-controlled construction or import boundary.
 * Bundle input may contain a field with this shape, but sanitizers must replace
 * it with the classification supplied by the server call site.
 */
export type ObservationOriginKind =
  | "canonical-local-artifacts"
  | "server-synthetic-demo"
  | "external-import"
  | "supplemental-review"
  | "legacy-unknown";

export interface ObservationOrigin {
  kind: ObservationOriginKind;
  assignedBy: "server";
}

export const OBSERVATION_NORMALIZATION_LOSS_CODES = [
  "authority-metadata-missing",
  "authority-metadata-invalid",
  "normalization-metadata-missing",
  "normalization-metadata-invalid",
  "untrusted-coverage-claim-ignored",
  "untrusted-supplemental-claim-ignored",
  "untrusted-source-claim-ignored",
  "source-limit-exceeded",
  "device-limit-exceeded",
  "identity-evidence-limit-exceeded",
  "open-port-limit-exceeded",
  "port-coverage-limit-exceeded",
  "port-range-limit-exceeded",
  "supplemental-evidence-limit-exceeded",
  "invalid-source-record-dropped",
  "source-id-collision",
  "invalid-device-record-dropped",
  "device-id-collision",
  "invalid-identity-evidence-dropped",
  "invalid-open-port-dropped",
  "invalid-port-coverage-dropped",
  "invalid-port-range-dropped",
  "invalid-supplemental-evidence-dropped",
  "invalid-ip-address-dropped",
  "invalid-mac-address-dropped",
  "invalid-source-reference",
  "invalid-source-kind",
  "invalid-collector-kind",
  "invalid-vantage-type",
  "unsupported-port-protocol",
  "non-open-port-state",
  "invalid-target-scope",
  "conflicting-target-scope",
  "invalid-timestamp",
  "artifact-read-failed",
  "artifact-limit-exceeded",
  "packet-highway-capture-truncated",
  "packet-highway-records-ignored",
  "packet-highway-fixture-sanitization-loss",
] as const;
export type ObservationNormalizationLossCode =
  (typeof OBSERVATION_NORMALIZATION_LOSS_CODES)[number];

export interface ObservationNormalizationLoss {
  code: ObservationNormalizationLossCode;
  /** Bounded count; no discarded raw values are retained. */
  count: number;
}

export interface ObservationNormalization {
  status: "complete" | "lossy";
  losses: ObservationNormalizationLoss[];
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
}

export interface DeviceIdentityEvidence {
  evidenceId: string;
  kind: ObservationEvidenceKind;
  value: string;
  sourceId: string;
  confidence: ObservationEvidenceConfidence;
}

export interface ObservationOpenPort {
  protocol: ObservationPortProtocol;
  port: number;
  state: "open";
  service: string | null;
  product: string | null;
  version: string | null;
  sourceId: string;
}

export type ObservationPortProtocol = "tcp" | "udp" | "sctp";

export interface ObservationPortRange {
  start: number;
  end: number;
}

/**
 * Normalized collection metadata only. Slice 2 decides whether a retained
 * range is sufficient for any particular conclusion.
 */
export interface ObservationPortCoverage {
  sourceId: string;
  protocol: ObservationPortProtocol;
  ranges: ObservationPortRange[];
  stateEvidence: "complete" | "partial" | "unknown";
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
  origin: ObservationOrigin;
  normalization: ObservationNormalization;
  site: SiteRef;
  collector: CollectorRef;
  batch: ObservationBatch;
  sources: ObservationSourceRef[];
  vantage: CollectionVantage;
  coverage: CoverageRecord;
  devices: ObservationDevice[];
  supplementalEvidence?: ObservationSupplementalEvidence[];
  notes: string[];
}
