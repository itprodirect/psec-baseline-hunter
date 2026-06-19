import type {
  CollectionVantage,
  CoverageRecord,
  ObservationBatch,
  ObservationBundleV1,
  ObservationSourceRef,
  SiteRef,
} from "./observation-bundle";

export type ObservationFreshnessStatus = "fresh" | "aging" | "stale" | "partial";
export type ObservationCadenceStatus = "fresh" | "aging" | "stale";

export interface ObservationFreshnessPolicy {
  cadenceDays: number;
  graceDays: number;
}

export interface ObservationFreshnessOptions {
  evaluatedAt?: string | Date;
  cadenceDays?: number;
  graceDays?: number;
}

export interface ObservationRegistryImportOptions extends ObservationFreshnessOptions {
  importedAt?: string | Date;
}

export interface ObservationFreshnessEvaluation extends ObservationFreshnessPolicy {
  status: ObservationFreshnessStatus;
  cadenceStatus: ObservationCadenceStatus;
  evaluatedAt: string;
  observedAt: string | null;
  dueAt: string | null;
  graceEndsAt: string | null;
  ageDays: number | null;
  reason: string;
}

export interface ObservationTimeRange {
  startedAt: string | null;
  endedAt: string | null;
  generatedAt: string;
}

export interface ObservationRegistryEntry {
  registryId: string;
  observationId: string;
  contentHash: string;
  importedAt: string;
  site: SiteRef;
  networkName: string;
  batch: ObservationBatch;
  sources: ObservationSourceRef[];
  vantage: CollectionVantage;
  coverage: CoverageRecord;
  timeRange: ObservationTimeRange;
  freshness: ObservationFreshnessEvaluation;
  deviceCount: number;
  notes: string[];
}

export interface ObservationRegistryRecord extends ObservationRegistryEntry {
  bundle: ObservationBundleV1;
}

export interface ObservationRegistryIndex {
  version: number;
  observations: Record<string, ObservationRegistryEntry>;
  contentHashes: Record<string, string>;
  lastUpdated: string;
}

export interface ObservationRegistryListFilters {
  siteId?: string;
  network?: string;
  order?: "asc" | "desc";
}

export interface RegisterObservationResult {
  record: ObservationRegistryRecord;
  isNew: boolean;
  duplicateOf?: string;
}
