/**
 * TypeScript types for PSEC Baseline Hunter
 * Ported from Python dataclasses in core/ingest.py and core/nmap_parse.py
 */

// Re-export UserProfile for use in API types
export type { UserProfile } from "./userProfile";

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

// ============================================================================
// Custom Risk Rules (Phase 5)
// ============================================================================

/**
 * Action type for custom risk rules
 */
export type RuleAction = "override" | "whitelist";

/**
 * A custom risk rule for a port
 */
export interface CustomRiskRule {
  ruleId: string;              // Unique ID: {network}_{port}_{protocol}_{hash8}
  port: number;                // Port number
  protocol: "tcp" | "udp";     // Protocol
  network: string;             // Network name or "*" for global
  action: RuleAction;          // What to do: override risk level or whitelist
  customRisk?: RiskLevel;      // New risk level (required if action = "override")
  reason: string;              // Why this rule exists
  createdAt: string;           // ISO timestamp
}

/**
 * Rules registry stored at data/rules/index.json
 */
export interface RulesRegistry {
  version: number;
  rules: Record<string, CustomRiskRule>;
  lastUpdated: string;
}

/**
 * API request to create a rule
 */
export interface CreateRuleRequest {
  port: number;
  protocol: "tcp" | "udp";
  network: string;
  action: RuleAction;
  customRisk?: RiskLevel;
  reason: string;
}

/**
 * API response for rules operations
 */
export interface RulesResponse {
  success: boolean;
  rules?: CustomRiskRule[];
  rule?: CustomRiskRule;
  error?: string;
}

// ============================================================================
// Comparison History (Phase 5)
// ============================================================================

/**
 * A saved comparison with unique ID for sharing
 */
export interface SavedComparison {
  comparisonId: string;        // Short unique ID (8 chars)
  baselineRunUid: string;      // Reference to baseline run
  currentRunUid: string;       // Reference to current run
  network: string;             // Network name
  createdAt: string;           // When comparison was created
  diffData: DiffData;          // The actual diff results
  riskScore: number;           // Computed risk score (0-100)
  riskLabel: string;           // "Excellent", "Good", etc.
  title?: string;              // Optional user-provided title
  notes?: string;              // Optional notes
}

/**
 * Comparison registry stored at data/comparisons/index.json
 */
export interface ComparisonRegistry {
  version: number;
  comparisons: Record<string, SavedComparison>;
  lastUpdated: string;
}

/**
 * API request to save a comparison
 */
export interface SaveComparisonRequest {
  baselineRunUid: string;
  currentRunUid: string;
  title?: string;
  notes?: string;
}

/**
 * API response for comparison operations
 */
export interface ComparisonResponse {
  success: boolean;
  comparison?: SavedComparison;
  comparisons?: SavedComparison[];
  error?: string;
}

// ============================================================================
// Real-World Impact Cards (Phase 5.5)
// ============================================================================

/**
 * A real-world breach example for a port
 */
export interface BreachExample {
  headline: string;          // Brief incident description
  company?: string;          // Company name (if public)
  year: number;              // Year of breach
  cost?: string;             // Financial impact (e.g., "$5M fine")
}

/**
 * Real-world impact data for a port
 */
export interface PortImpactData {
  port: number;
  protocol: string;
  service: string;
  severity: "Critical" | "High";          // Simplified for UI
  attackScenario: string;                 // 2-3 sentences on how attacks happen
  breachExamples: BreachExample[];        // 1-2 real incidents
  financialImpact: {
    avgBreachCost: string;                // e.g., "$4.5M average"
    recoveryTime: string;                 // e.g., "200-280 days"
    potentialFines?: string;              // e.g., "$50K-$1.5M" (if HIPAA/PCI)
  };
  quickFix: string;                       // 1-2 sentence action
}

/**
 * Cached port impact with TTL
 */
export interface PortImpactCacheEntry {
  data: PortImpactData;
  cachedAt: string;         // ISO timestamp
  expiresAt: string;        // ISO timestamp (cachedAt + 30 days)
}

/**
 * API request for port impact
 */
export interface PortImpactRequest {
  port: number;
  protocol: string;
  service: string;
  userProfile?: UserProfile;        // Optional UserProfile for context-aware content
}

/**
 * API response for port impact
 */
export interface PortImpactResponse {
  success: boolean;
  impact?: PortImpactData;
  provider?: string;
  isRuleBased?: boolean;
  isCached?: boolean;
  error?: string;
}

// ============================================================================
// Executive Summary (Phase 5.5)
// ============================================================================

/**
 * API request for executive summary
 */
export interface ExecutiveSummaryRequest {
  scorecardData: ScorecardData;
  userProfile: UserProfile;         // Required UserProfile
}

/**
 * API response for executive summary
 */
export interface ExecutiveSummaryResponse {
  success: boolean;
  summary?: string;         // Markdown content
  provider?: string;
  isRuleBased?: boolean;
  error?: string;
}
