import type {
  ObservationCoverageStatus,
  ObservationEvidenceKind,
} from "./observation-bundle";

export type ObservationComparisonRuleVersion = "psec.observation-comparison.v1";

export type ObservationIdentityConfidence = "strongest" | "strong" | "medium" | "low";

export type ObservationChangeEventType =
  | "new-device-observed"
  | "previously-observed-device-not-observed"
  | "identity-uncertain-possibly-same-device"
  | "service-or-port-opened"
  | "service-or-port-closed"
  | "important-device-metadata-changed";

export type ObservationComparisonGuardrailCode =
  | "partial-coverage"
  | "port-coverage-incomplete"
  | "stale-data"
  | "ambiguous-identity";

export type ObservationComparisonFreshnessStatus = "fresh" | "stale" | "unknown";

export interface ObservationComparisonObservationRef {
  observationId: string;
  batchId: string;
  sourceRunUid: string;
  siteId: string;
  networkName: string;
  observedAt: string | null;
}

export interface ObservationComparisonDeviceRef {
  observationId: string;
  deviceId: string;
  ips: string[];
  macs: string[];
  hostnames: string[];
  vendors: string[];
}

export interface ObservationComparisonFreshnessContext {
  status: ObservationComparisonFreshnessStatus;
  evaluatedAt: string;
  observedAt: string | null;
  staleAfterDays: number;
  ageDays: number | null;
}

export interface ObservationComparisonCoverageSnapshot {
  status: ObservationCoverageStatus;
  score: number;
  partial: boolean;
  expectedSources: string[];
  presentSources: string[];
  missingSources: string[];
  freshness: ObservationComparisonFreshnessContext;
  notes: string[];
}

export interface ObservationComparisonCoverageContext {
  baseline: ObservationComparisonCoverageSnapshot;
  current: ObservationComparisonCoverageSnapshot;
  notes: string[];
}

export interface ObservationComparisonIdentityEvidence {
  ruleId: string;
  confidence: ObservationIdentityConfidence;
  summary: string;
  values: string[];
  evidenceKinds: ObservationEvidenceKind[];
  baselineEvidenceIds: string[];
  currentEvidenceIds: string[];
}

export interface ObservationComparisonRuleMetadata {
  engine: "observation-comparison";
  version: ObservationComparisonRuleVersion;
  ruleId: string;
  deterministic: true;
}

export interface ObservationComparisonPortRef {
  protocol: string;
  port: number;
  service: string | null;
  product: string | null;
  version: string | null;
  sourceId: string;
}

export interface ObservationChangeEventDetails {
  changedFields?: string[];
  baselinePort?: ObservationComparisonPortRef | null;
  currentPort?: ObservationComparisonPortRef | null;
  notes: string[];
}

export interface ObservationChangeEvent {
  eventId: string;
  eventType: ObservationChangeEventType;
  summary: string;
  observations: {
    baseline: ObservationComparisonObservationRef;
    current: ObservationComparisonObservationRef;
  };
  baselineDevice: ObservationComparisonDeviceRef | null;
  currentDevice: ObservationComparisonDeviceRef | null;
  identityEvidence: ObservationComparisonIdentityEvidence;
  confidence: ObservationIdentityConfidence;
  coverageContext: ObservationComparisonCoverageContext;
  rule: ObservationComparisonRuleMetadata;
  details: ObservationChangeEventDetails;
}

export interface ObservationComparisonGuardrail {
  code: ObservationComparisonGuardrailCode;
  severity: "info" | "warning";
  message: string;
}

export interface ObservationComparisonResult {
  ruleVersion: ObservationComparisonRuleVersion;
  site: {
    siteId: string;
    networkName: string;
    networkScope: string | null;
  };
  observations: {
    baseline: ObservationComparisonObservationRef;
    current: ObservationComparisonObservationRef;
  };
  coverageContext: ObservationComparisonCoverageContext;
  guardrails: ObservationComparisonGuardrail[];
  events: ObservationChangeEvent[];
}
