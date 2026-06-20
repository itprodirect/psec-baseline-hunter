import type { DeviceResponseState } from "./device-response";

export type NetworkStatementSchemaVersion = "psec.network-statement.v1";

export type NetworkStatementStatus = "ready" | "insufficient-evidence";

export type NetworkStatementSectionId =
  | "selected-period"
  | "site-network"
  | "coverage-vantage"
  | "freshness"
  | "stable"
  | "changed"
  | "needs-review"
  | "unresolved-responses"
  | "packet-highway"
  | "cannot-conclude"
  | "next-actions"
  | "technical-provenance";

export type NetworkStatementItemSeverity = "info" | "warning" | "review";

export interface NetworkStatementEvidenceRef {
  label: string;
  href: string;
  kind: "activity" | "packet-highway" | "observation" | "provenance";
}

export interface NetworkStatementItem {
  id: string;
  severity: NetworkStatementItemSeverity;
  text: string;
  evidenceRefs: NetworkStatementEvidenceRef[];
}

export interface NetworkStatementSection {
  id: NetworkStatementSectionId;
  title: string;
  summary: string | null;
  secondary: boolean;
  items: NetworkStatementItem[];
}

export interface NetworkStatementSelectedPeriod {
  from: string;
  to: string;
  label: string;
  requestedWeeklyRange: boolean;
  weeklyTitleSupported: boolean;
  titleReason: string;
}

export interface NetworkStatementSite {
  siteId: string;
  networkName: string;
  networkScopeRecorded: boolean;
}

export interface NetworkStatementCoverageSummary {
  primaryObservationCount: number;
  comparisonCount: number;
  supplementalPacketHighwayCount: number;
  hasPartialCoverage: boolean;
  hasStaleEvidence: boolean;
  hasInsufficientWeekCoverage: boolean;
  hasInsufficientComparisonEvidence: boolean;
}

export interface NetworkStatementPrivacySummary {
  technicalIdentifiersMinimized: true;
  rawPayloadsExcluded: true;
  absolutePathsExcluded: true;
  secretsExcluded: true;
}

export interface NetworkStatementModel {
  schemaVersion: NetworkStatementSchemaVersion;
  status: NetworkStatementStatus;
  title: "Weekly Network Statement" | "Network Statement";
  generatedAt: string;
  site: NetworkStatementSite;
  selectedPeriod: NetworkStatementSelectedPeriod;
  coverageSummary: NetworkStatementCoverageSummary;
  privacy: NetworkStatementPrivacySummary;
  sections: NetworkStatementSection[];
}

export interface NetworkStatementResponse {
  success: boolean;
  statement?: NetworkStatementModel;
  markdown?: string;
  error?: string;
}

export interface NetworkStatementUnresolvedResponse {
  state: Extract<DeviceResponseState, "not_sure" | "investigate">;
  stateLabel: string;
  friendlyName: string | null;
  eventTitle: string;
  evidenceHref: string;
}
