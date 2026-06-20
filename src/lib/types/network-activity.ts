import type {
  ActivityDeviceResponse,
  DeviceResponseState,
} from "./device-response";
import type {
  ObservationChangeEventType,
  ObservationComparisonFreshnessStatus,
  ObservationIdentityConfidence,
} from "./observation-comparison";
import type { ObservationFreshnessStatus } from "./observation-registry";

export type NetworkActivitySource = "registry" | "synthetic-guided-scenario";

export type NetworkActivityStatus =
  | "empty"
  | "one-observation"
  | "no-comparison"
  | "ready";

export interface NetworkActivityResponse {
  success: boolean;
  activity?: NetworkActivityModel;
  error?: string;
}

export interface NetworkActivityModel {
  status: NetworkActivityStatus;
  source: NetworkActivitySource;
  generatedAt: string;
  title: string;
  summary: string;
  site: NetworkActivitySite | null;
  latestObservation: NetworkActivityLatestObservation | null;
  period: NetworkActivityPeriod | null;
  coverage: NetworkActivityCoverage | null;
  limitations: NetworkActivityLimitation[];
  reviewCount: number;
  events: NetworkActivityEvent[];
  availableObservationCount: number;
  scenario: NetworkActivityScenario | null;
}

export interface NetworkActivitySite {
  networkName: string;
  networkScope: string | null;
}

export interface NetworkActivityLatestObservation {
  observationId: string;
  checkedAt: string | null;
  freshnessStatus: ObservationFreshnessStatus;
  freshnessReason: string;
  deviceCount: number;
}

export interface NetworkActivityPeriod {
  label: string;
  baselineObservedAt: string | null;
  currentObservedAt: string | null;
  baselineObservationId: string;
  currentObservationId: string;
  baselineRunUid: string;
  currentRunUid: string;
}

export interface NetworkActivityCoverage {
  status: string;
  score: number;
  freshnessStatus: ObservationComparisonFreshnessStatus;
  sources: {
    present: string[];
    missing: string[];
    expected: string[];
  };
  vantage: {
    label: string;
    runType: string | null;
    networkName: string;
  };
  technicalVantage: {
    collectorHost: string | null;
    target: string | null;
    notes: string[];
  };
}

export interface NetworkActivityLimitation {
  code: string;
  severity: "info" | "warning";
  message: string;
}

export interface NetworkActivityEvent {
  eventId: string;
  type: ObservationChangeEventType;
  title: string;
  summary: string;
  reviewReason: string;
  confidence: ObservationIdentityConfidence;
  confidenceLabel: string;
  workflowPriority: NetworkActivityWorkflowPriority;
  deviceResponse: ActivityDeviceResponse;
  periodHref: "#comparison-period";
  evidenceId: string;
  evidenceSummary: string;
  technicalEvidence: NetworkActivityTechnicalEvidence;
}

export interface NetworkActivityWorkflowPriority {
  level: "normal" | "user-investigate";
  label: string;
  reason: string;
  responseState: DeviceResponseState | null;
}

export interface NetworkActivityTechnicalEvidence {
  ruleId: string;
  ruleVersion: string;
  baselineObservationId: string;
  currentObservationId: string;
  identityRuleId: string;
  identityEvidenceIds: {
    baseline: string[];
    current: string[];
  };
  identityValues: string[];
  baselineDevice: NetworkActivityTechnicalDevice | null;
  currentDevice: NetworkActivityTechnicalDevice | null;
  port: NetworkActivityTechnicalPort | null;
  changedFields: string[];
  notes: string[];
}

export interface NetworkActivityTechnicalDevice {
  deviceId: string;
  ips: string[];
  macs: string[];
  hostnames: string[];
  vendors: string[];
}

export interface NetworkActivityTechnicalPort {
  direction: "opened" | "closed";
  protocol: string;
  port: number;
  service: string | null;
  product: string | null;
  version: string | null;
  sourceId: string;
}

export interface NetworkActivityScenario {
  title: string;
  steps: string[];
}
