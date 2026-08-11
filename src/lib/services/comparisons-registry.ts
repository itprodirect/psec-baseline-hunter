/** Saved Diff comparisons with fail-closed evidence validation. */

import * as fs from "fs";
import * as path from "path";
import type {
  ComparisonRegistry,
  DiffData,
  SaveComparisonRequest,
  SavedComparison,
} from "@/lib/types";
import { ensureDir, getDataDir } from "./ingest";

const REGISTRY_VERSION = 2;

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

export function getComparisonsDir(): string {
  return ensureDir(path.join(getDataDir(), "comparisons"));
}

function getRegistryIndexPath(): string {
  return path.join(getComparisonsDir(), "index.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasPersistableEvidence(diffData: unknown): diffData is DiffData {
  if (!isRecord(diffData) || !isRecord(diffData.evidence)) return false;
  const evidence = diffData.evidence;
  return (
    evidence.version === "psec.evidence.v1" &&
    evidence.status === "supported" &&
    isRecord(evidence.supports) &&
    evidence.supports.comparisonPersistence === true
  );
}

function isPersistableComparison(value: unknown): value is SavedComparison {
  if (!isRecord(value)) return false;
  return (
    typeof value.comparisonId === "string" &&
    typeof value.baselineRunUid === "string" &&
    typeof value.currentRunUid === "string" &&
    typeof value.network === "string" &&
    typeof value.createdAt === "string" &&
    hasPersistableEvidence(value.diffData)
  );
}

/**
 * Load only records carrying the current supported evidence contract. Legacy
 * and unsupported records are intentionally omitted rather than upgraded into
 * conclusions that their stored evidence cannot support.
 */
export function loadComparisonsRegistry(): ComparisonRegistry {
  const emptyRegistry = (): ComparisonRegistry => ({
    version: REGISTRY_VERSION,
    comparisons: {},
    lastUpdated: new Date().toISOString(),
  });
  const indexPath = getRegistryIndexPath();
  if (!fs.existsSync(indexPath)) return emptyRegistry();

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    if (!isRecord(parsed) || !isRecord(parsed.comparisons)) return emptyRegistry();

    const comparisons = Object.fromEntries(
      Object.entries(parsed.comparisons).filter(([, comparison]) =>
        isPersistableComparison(comparison)
      )
    ) as Record<string, SavedComparison>;

    return {
      version: REGISTRY_VERSION,
      comparisons,
      lastUpdated:
        typeof parsed.lastUpdated === "string"
          ? parsed.lastUpdated
          : new Date().toISOString(),
    };
  } catch (error) {
    console.error("Failed to load comparisons registry:", error);
    return emptyRegistry();
  }
}

function saveComparisonsRegistry(registry: ComparisonRegistry): void {
  const indexPath = getRegistryIndexPath();
  registry.version = REGISTRY_VERSION;
  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(registry, null, 2));
}

export function generateComparisonId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return (timestamp + random).substring(0, 8).toUpperCase();
}

export function saveComparison(
  request: SaveComparisonRequest,
  diffData: DiffData
): SavedComparison {
  // This assertion is deliberately inside the persistence boundary so a
  // caller cannot bypass route-level validation.
  if (!hasPersistableEvidence(diffData)) {
    throw new UnsupportedComparisonPersistenceError();
  }

  const registry = loadComparisonsRegistry();
  const comparisonId = generateComparisonId();
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

  registry.comparisons[comparisonId] = comparison;
  saveComparisonsRegistry(registry);
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
  const registry = loadComparisonsRegistry();
  if (!(comparisonId in registry.comparisons)) return false;
  delete registry.comparisons[comparisonId];
  saveComparisonsRegistry(registry);
  return true;
}

export function updateComparison(
  comparisonId: string,
  updates: { title?: string; notes?: string }
): SavedComparison | null {
  const registry = loadComparisonsRegistry();
  if (!(comparisonId in registry.comparisons)) return null;

  const comparison = registry.comparisons[comparisonId];
  if (updates.title !== undefined) comparison.title = updates.title;
  if (updates.notes !== undefined) comparison.notes = updates.notes;
  registry.comparisons[comparisonId] = comparison;
  saveComparisonsRegistry(registry);
  return comparison;
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
