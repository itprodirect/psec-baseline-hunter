/**
 * TypeScript types for PSEC Baseline Hunter
 * Ported from Python dataclasses in core/ingest.py and core/nmap_parse.py
 */

/**
 * Metadata about a scan run folder
 * Port of Python RunMeta dataclass
 */
export interface RunMeta {
  runFolder: string;
  timestamp: Date | null;
  runType: string;
  keyFiles: Record<string, string[]>;
}

/**
 * A single port finding from Nmap XML
 * Corresponds to a row in parse_ports() output
 */
export interface PortFinding {
  ip: string;
  hostname: string;
  protocol: string;
  port: number;
  state: string;
  service: string;
  product: string;
  version: string;
  sourceXml: string;
}

/**
 * Aggregated port summary
 * Corresponds to a row in top_ports() output
 */
export interface TopPort {
  protocol: string;
  port: number;
  service: string;
  hostsAffected: number;
}

/**
 * Response from upload API
 */
export interface UploadResponse {
  success: boolean;
  uploadPath?: string;
  error?: string;
}

/**
 * Response from ingest API
 */
export interface IngestResponse {
  success: boolean;
  extractedPath?: string;
  runs?: RunMeta[];
  error?: string;
}

/**
 * Response from parse API
 */
export interface ParseResponse {
  success: boolean;
  ports?: PortFinding[];
  topPorts?: TopPort[];
  error?: string;
}

/**
 * Response from runs list API
 */
export interface RunsListResponse {
  success: boolean;
  runs?: RunMeta[];
  error?: string;
}

/**
 * Run manifest stored in registry (extended metadata)
 */
export interface RunManifestInfo {
  runUid: string;
  network: string;
  runFolder: string;
  folderName: string;
  timestamp: string | null;
  runType: string;
  keyFiles: Record<string, string[]>;
  contentHash: string;
  stats: {
    keyFileCount: number;
    hasPortsScan: boolean;
    hasHostsUp: boolean;
    hasDiscovery: boolean;
  };
  createdAt: string;
  extractionId: string;
}

/**
 * Response from ingest API (with registry support)
 */
export interface IngestResponseV2 {
  success: boolean;
  extractedPath?: string;
  runs?: RunManifestInfo[];
  newRuns?: number;
  duplicateRuns?: number;
  error?: string;
}

/**
 * Response from runs list API (with registry support)
 */
export interface RunsListResponseV2 {
  success: boolean;
  runs?: RunManifestInfo[];
  stats?: {
    totalRuns: number;
    networks: number;
  };
  error?: string;
}

/**
 * Query parameters for runs list
 */
export interface RunsListQuery {
  network?: string;
  runType?: string;
  limit?: number;
  offset?: number;
}

/**
 * Risk classification for ports
 */
export type RiskLevel = "P0" | "P1" | "P2";

/**
 * A port with risk classification
 */
export interface RiskPort {
  port: number;
  protocol: string;
  service: string;
  risk: RiskLevel;
  hostsAffected: number;
  hosts: string[];
}

/**
 * Scorecard data for a single run
 */
export interface ScorecardData {
  runUid: string;
  network: string;
  timestamp: string;
  totalHosts: number;
  openPorts: number;
  uniqueServices: number;
  riskPorts: number;
  topPorts: TopPort[];
  riskPortsDetail: RiskPort[];
  summary: string;
}

/**
 * Host change in diff
 */
export interface HostChange {
  ip: string;
  hostname?: string;
  changeType: "added" | "removed";
}

/**
 * Port change in diff
 */
export interface PortChange {
  ip: string;
  hostname?: string;
  port: number;
  protocol: string;
  service: string;
  changeType: "opened" | "closed";
  risk?: RiskLevel;
}

/**
 * Diff data comparing two runs
 */
export interface DiffData {
  baselineRunUid: string;
  currentRunUid: string;
  baselineTimestamp: string;
  currentTimestamp: string;
  network: string;
  newHosts: HostChange[];
  removedHosts: HostChange[];
  portsOpened: PortChange[];
  portsClosed: PortChange[];
  riskyExposures: PortChange[];
  summary: string;
}

/**
 * Complete demo data package
 */
export interface DemoData {
  baseline: RunManifestInfo;
  current: RunManifestInfo;
  baselineScorecard: ScorecardData;
  currentScorecard: ScorecardData;
  diff: DiffData;
}

/**
 * Response from demo API
 */
export interface DemoResponse {
  success: boolean;
  data?: DemoData;
  error?: string;
}
