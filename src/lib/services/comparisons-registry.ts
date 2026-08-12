/** Saved Diff comparisons with a server-authoritative persistence boundary. */

import * as fs from "fs";
import * as path from "path";
import type {
  ComparisonRegistry,
  DiffData,
  EvidenceCoverageSnapshot,
  PortChange,
  SaveComparisonRequest,
  SavedComparison,
} from "@/lib/types";
import { computeDiff } from "./diff-engine";
import { ensureDir, getDataDir } from "./ingest";

const REGISTRY_VERSION = 2;
const MAX_COMPARISON_ID_ATTEMPTS = 100;
const ALLOWED_SUPPORTED_REASON_CODES = new Set([
  "external-reachability-not-established",
]);
const REQUIRED_COMPLETE_SOURCE_LABELS = new Set([
  "ports",
  "discovery",
  "hosts_up",
  "arp_snapshot",
  "scan_metadata",
]);

interface RawComparisonRegistry extends Record<string, unknown> {
  comparisons: Record<string, unknown>;
}

export class UnsupportedComparisonPersistenceError extends Error {
  constructor() {
    super("Comparison evidence does not support persistence.");
    this.name = "UnsupportedComparisonPersistenceError";
  }
}

export function isUnsupportedComparisonPersistenceError(
  error: unknown
): error is UnsupportedComparisonPersistenceError {
  return (
    error instanceof UnsupportedComparisonPersistenceError ||
    (error instanceof Error && error.name === "UnsupportedComparisonPersistenceError")
  );
}

export class ComparisonDataNotFoundError extends Error {
  constructor() {
    super("Comparison data was not found.");
    this.name = "ComparisonDataNotFoundError";
  }
}

export function isComparisonDataNotFoundError(
  error: unknown
): error is ComparisonDataNotFoundError {
  return (
    error instanceof ComparisonDataNotFoundError ||
    (error instanceof Error && error.name === "ComparisonDataNotFoundError")
  );
}

export class ComparisonRegistryIntegrityError extends Error {
  constructor() {
    super("The saved comparison registry is malformed and was not modified.");
    this.name = "ComparisonRegistryIntegrityError";
  }
}

export function getComparisonsDir(): string {
  return ensureDir(path.join(getDataDir(), "comparisons"));
}

function getRegistryIndexPath(): string {
  return path.join(getComparisonsDir(), "index.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function hasUniqueStrings(value: string[]): boolean {
  return new Set(value).size === value.length;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function hasCompleteCoverage(value: unknown): value is EvidenceCoverageSnapshot {
  if (!isRecord(value)) return false;
  if (
    value.status !== "complete" ||
    value.partial !== false ||
    value.scopeKnown !== true ||
    value.score !== 1 ||
    typeof value.deviceCount !== "number" ||
    !Number.isInteger(value.deviceCount) ||
    value.deviceCount <= 0 ||
    !isStringArray(value.expectedSources) ||
    !isStringArray(value.presentSources) ||
    !isStringArray(value.missingSources) ||
    value.normalizationStatus !== "complete" ||
    !isStringArray(value.normalizationReasonCodes) ||
    value.normalizationReasonCodes.length !== 0 ||
    !isStringArray(value.coverageReasonCodes) ||
    value.coverageReasonCodes.length !== 0 ||
    value.targetProvenanceStatus !== "verified" ||
    !hasUniqueStrings(value.expectedSources) ||
    !hasUniqueStrings(value.presentSources) ||
    value.expectedSources.length !== REQUIRED_COMPLETE_SOURCE_LABELS.size ||
    value.expectedSources.some(
      (source) => !REQUIRED_COMPLETE_SOURCE_LABELS.has(source)
    ) ||
    value.presentSources.length !== value.expectedSources.length ||
    value.missingSources.length !== 0
  ) {
    return false;
  }

  const presentSources = new Set(value.presentSources);
  return value.expectedSources.every((source) => presentSources.has(source));
}

function isHostChangeArray(value: unknown, changeType: "added" | "removed"): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.ip === "string" &&
        entry.ip.length > 0 &&
        (entry.hostname === undefined || typeof entry.hostname === "string") &&
        entry.changeType === changeType
    )
  );
}

function isPortChange(value: unknown, changeType: "opened" | "closed"): value is PortChange {
  return (
    isRecord(value) &&
    typeof value.ip === "string" &&
    value.ip.length > 0 &&
    (value.hostname === undefined || typeof value.hostname === "string") &&
    typeof value.port === "number" &&
    Number.isInteger(value.port) &&
    value.port >= 0 &&
    value.port <= 65535 &&
    typeof value.protocol === "string" &&
    value.protocol.length > 0 &&
    typeof value.service === "string" &&
    value.changeType === changeType &&
    (value.risk === undefined || value.risk === "P0" || value.risk === "P1" || value.risk === "P2")
  );
}

function isPortChangeArray(
  value: unknown,
  changeType: "opened" | "closed"
): value is PortChange[] {
  return Array.isArray(value) && value.every((entry) => isPortChange(entry, changeType));
}

function portChangeKey(value: PortChange): string {
  return `${value.ip}|${value.protocol.trim().toLowerCase()}|${value.port}`;
}

/**
 * Validate all security-sensitive relationships in a persisted comparison.
 * This is intentionally stricter than checking a self-declared status flag.
 */
function isPersistableDiffData(
  value: unknown,
  expectedRunIds?: { baselineRunUid: string; currentRunUid: string }
): value is DiffData {
  if (!isRecord(value) || !isRecord(value.evidence)) return false;
  const evidence = value.evidence;
  const coverage = evidence.coverage;
  const identity = evidence.identity;
  const vantage = evidence.vantage;
  const supports = evidence.supports;

  if (
    typeof value.baselineRunUid !== "string" ||
    typeof value.currentRunUid !== "string" ||
    value.baselineRunUid === value.currentRunUid ||
    (expectedRunIds !== undefined &&
      (value.baselineRunUid !== expectedRunIds.baselineRunUid ||
        value.currentRunUid !== expectedRunIds.currentRunUid)) ||
    !isIsoTimestamp(value.baselineTimestamp) ||
    !isIsoTimestamp(value.currentTimestamp) ||
    Date.parse(value.baselineTimestamp) >= Date.parse(value.currentTimestamp) ||
    typeof value.network !== "string" ||
    value.network.trim().length === 0 ||
    typeof value.summary !== "string" ||
    value.summary.trim().length === 0 ||
    evidence.version !== "psec.evidence.v1" ||
    evidence.status !== "supported" ||
    !isStringArray(evidence.reasonCodes) ||
    evidence.reasonCodes.length !== ALLOWED_SUPPORTED_REASON_CODES.size ||
    !hasUniqueStrings(evidence.reasonCodes) ||
    evidence.reasonCodes.some((code) => !ALLOWED_SUPPORTED_REASON_CODES.has(code)) ||
    !isRecord(coverage) ||
    !hasCompleteCoverage(coverage.baseline) ||
    !hasCompleteCoverage(coverage.current) ||
    !isRecord(identity) ||
    identity.status !== "supported" ||
    identity.uncertainCount !== 0 ||
    !isRecord(vantage) ||
    vantage.kind !== "unverified-scan-vantage" ||
    vantage.externalReachability !== "not-established" ||
    !isRecord(supports) ||
    supports.deviceAbsence !== true ||
    supports.portClosure !== true ||
    supports.stableBaseline !== false ||
    supports.externalReachability !== false ||
    supports.comparisonPersistence !== true ||
    supports.llmSummary !== true ||
    !isStringArray(evidence.limitations) ||
    evidence.limitations.length === 0 ||
    !isHostChangeArray(value.newHosts, "added") ||
    !isHostChangeArray(value.removedHosts, "removed") ||
    !Array.isArray(value.identityUncertain) ||
    value.identityUncertain.length !== 0 ||
    !isPortChangeArray(value.portsOpened, "opened") ||
    !isPortChangeArray(value.portsClosed, "closed") ||
    !isPortChangeArray(value.riskFindings, "opened")
  ) {
    return false;
  }

  const addedAddresses = new Set(
    (value.newHosts as Array<{ ip: string }>).map((host) => host.ip)
  );
  if (
    (value.removedHosts as Array<{ ip: string }>).some((host) =>
      addedAddresses.has(host.ip)
    )
  ) {
    return false;
  }

  const portsOpened = value.portsOpened as PortChange[];
  const portsClosed = value.portsClosed as PortChange[];
  const riskFindings = value.riskFindings as PortChange[];
  const openedKeys = new Set(portsOpened.map(portChangeKey));
  const closedKeys = new Set(portsClosed.map(portChangeKey));
  const findingKeys = new Set(riskFindings.map(portChangeKey));
  if (
    openedKeys.size !== portsOpened.length ||
    closedKeys.size !== portsClosed.length ||
    findingKeys.size !== riskFindings.length ||
    [...openedKeys].some((key) => closedKeys.has(key))
  ) {
    return false;
  }

  const expectedFindings = portsOpened.filter(
    (finding) => finding.risk === "P0" || finding.risk === "P1"
  );
  if (expectedFindings.length !== riskFindings.length) return false;

  return riskFindings.every((finding) => {
    if (finding.risk !== "P0" && finding.risk !== "P1") return false;
    const opened = portsOpened.find(
      (candidate) => portChangeKey(candidate) === portChangeKey(finding)
    );
    return (
      opened !== undefined &&
      opened.risk === finding.risk &&
      opened.service === finding.service &&
      opened.hostname === finding.hostname
    );
  });
}

function isAuthoritativeComparison(
  value: unknown,
  registryKey?: string
): value is SavedComparison {
  if (!isRecord(value)) return false;
  if (
    typeof value.comparisonId !== "string" ||
    (registryKey !== undefined && value.comparisonId !== registryKey) ||
    typeof value.baselineRunUid !== "string" ||
    typeof value.currentRunUid !== "string" ||
    typeof value.network !== "string" ||
    !isIsoTimestamp(value.createdAt) ||
    (value.title !== undefined && typeof value.title !== "string") ||
    (value.notes !== undefined && typeof value.notes !== "string") ||
    !isPersistableDiffData(value.diffData, {
      baselineRunUid: value.baselineRunUid,
      currentRunUid: value.currentRunUid,
    })
  ) {
    return false;
  }

  return value.network === value.diffData.network;
}

function emptyRegistry(): ComparisonRegistry {
  return {
    version: REGISTRY_VERSION,
    comparisons: {},
    lastUpdated: new Date().toISOString(),
  };
}

function newRawRegistry(): RawComparisonRegistry {
  return {
    version: REGISTRY_VERSION,
    comparisons: {},
    lastUpdated: new Date().toISOString(),
  };
}

/** Read the complete registry without filtering records that must be preserved. */
function readRawRegistry(): RawComparisonRegistry {
  const indexPath = getRegistryIndexPath();
  if (!fs.existsSync(indexPath)) return newRawRegistry();

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
  } catch {
    throw new ComparisonRegistryIntegrityError();
  }

  if (!isRecord(parsed) || !isRecord(parsed.comparisons)) {
    throw new ComparisonRegistryIntegrityError();
  }
  return parsed as RawComparisonRegistry;
}

/**
 * Return only records that satisfy the current evidence contract. The raw
 * registry is never replaced with this filtered view.
 */
export function loadComparisonsRegistry(): ComparisonRegistry {
  try {
    const raw = readRawRegistry();
    const comparisons = Object.fromEntries(
      Object.entries(raw.comparisons).filter(([comparisonId, comparison]) =>
        isAuthoritativeComparison(comparison, comparisonId)
      )
    ) as Record<string, SavedComparison>;

    return {
      version:
        typeof raw.version === "number" && Number.isInteger(raw.version)
          ? raw.version
          : REGISTRY_VERSION,
      comparisons,
      lastUpdated:
        typeof raw.lastUpdated === "string"
          ? raw.lastUpdated
          : new Date().toISOString(),
    };
  } catch (error) {
    console.error("Failed to load comparisons registry:", error);
    return emptyRegistry();
  }
}

function writeRawRegistry(registry: RawComparisonRegistry): void {
  const indexPath = getRegistryIndexPath();
  const nextRegistry: RawComparisonRegistry = {
    ...registry,
    version: REGISTRY_VERSION,
    comparisons: registry.comparisons,
    lastUpdated: new Date().toISOString(),
  };
  fs.writeFileSync(indexPath, JSON.stringify(nextRegistry, null, 2));
}

export function generateComparisonId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return (timestamp + random).substring(0, 8).toUpperCase();
}

function generateUniqueComparisonId(existingIds: Set<string>): string {
  for (let attempt = 0; attempt < MAX_COMPARISON_ID_ATTEMPTS; attempt += 1) {
    const comparisonId = generateComparisonId();
    if (!existingIds.has(comparisonId)) return comparisonId;
  }
  throw new Error("Unable to generate a unique comparison ID.");
}

/** Recompute and validate a comparison inside the persistence boundary. */
export function saveComparison(request: SaveComparisonRequest): SavedComparison {
  const diffData = computeDiff(request.baselineRunUid, request.currentRunUid);
  if (!diffData) throw new ComparisonDataNotFoundError();
  if (!isPersistableDiffData(diffData, request)) {
    throw new UnsupportedComparisonPersistenceError();
  }

  const raw = readRawRegistry();
  const comparisonId = generateUniqueComparisonId(
    new Set(Object.keys(raw.comparisons))
  );
  const comparison: SavedComparison = {
    comparisonId,
    baselineRunUid: request.baselineRunUid,
    currentRunUid: request.currentRunUid,
    network: diffData.network,
    createdAt: new Date().toISOString(),
    diffData,
    title: request.title,
    notes: request.notes,
  };

  raw.comparisons = {
    ...raw.comparisons,
    [comparisonId]: comparison,
  };
  writeRawRegistry(raw);
  return comparison;
}

export function getComparisonById(comparisonId: string): SavedComparison | null {
  return loadComparisonsRegistry().comparisons[comparisonId] || null;
}

export function listComparisons(network?: string): SavedComparison[] {
  let comparisons = Object.values(loadComparisonsRegistry().comparisons);
  if (network) {
    comparisons = comparisons.filter(
      (comparison) => comparison.network.toLowerCase() === network.toLowerCase()
    );
  }
  return comparisons.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function deleteComparison(comparisonId: string): boolean {
  const raw = readRawRegistry();
  const comparison = raw.comparisons[comparisonId];
  if (!isAuthoritativeComparison(comparison, comparisonId)) return false;

  const comparisons = { ...raw.comparisons };
  delete comparisons[comparisonId];
  raw.comparisons = comparisons;
  writeRawRegistry(raw);
  return true;
}

export function updateComparison(
  comparisonId: string,
  updates: { title?: string; notes?: string }
): SavedComparison | null {
  const raw = readRawRegistry();
  const comparison = raw.comparisons[comparisonId];
  if (!isAuthoritativeComparison(comparison, comparisonId)) return null;

  const updated: SavedComparison = {
    ...comparison,
    ...(updates.title !== undefined ? { title: updates.title } : {}),
    ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
  };
  raw.comparisons = {
    ...raw.comparisons,
    [comparisonId]: updated,
  };
  writeRawRegistry(raw);
  return updated;
}

export function getComparisonsStats(): {
  totalComparisons: number;
  networks: string[];
  mostRecentComparison: string | null;
} {
  const comparisons = listComparisons();
  return {
    totalComparisons: comparisons.length,
    networks: [...new Set(comparisons.map((comparison) => comparison.network))],
    mostRecentComparison: comparisons.length > 0 ? comparisons[0].createdAt : null,
  };
}
