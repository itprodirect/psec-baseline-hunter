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

export interface SiteRef {
  siteId: string;
  networkName: string;
  networkScope: string | null;
}

export interface CollectorRef {
  collectorId: string;
  kind: "registered-scan-run" | "packet-highway-analysis";
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
    | "packet-highway-unknown";
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
  protocol: string;
  port: number;
  state: "open";
  service: string | null;
  product: string | null;
  version: string | null;
  sourceId: string;
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
  devices: ObservationDevice[];
  supplementalEvidence?: ObservationSupplementalEvidence[];
  notes: string[];
}
