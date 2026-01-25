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
