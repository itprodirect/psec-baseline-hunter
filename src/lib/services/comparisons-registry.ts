/**
 * Comparisons Registry Service
 * Manages saved diff comparisons with shareable IDs
 */

import * as fs from "fs";
import * as path from "path";
import {
  SavedComparison,
  ComparisonRegistry,
  SaveComparisonRequest,
  DiffData,
} from "@/lib/types";
import { getDataDir, ensureDir } from "./ingest";
import { computeRiskScore, getRiskScoreLabel } from "./diff-engine";

const REGISTRY_VERSION = 1;

/**
 * Get path to comparisons registry directory
 */
export function getComparisonsDir(): string {
  return ensureDir(path.join(getDataDir(), "comparisons"));
}

/**
 * Get path to comparisons registry index file
 */
function getRegistryIndexPath(): string {
  return path.join(getComparisonsDir(), "index.json");
}

/**
 * Load the comparisons registry
 */
export function loadComparisonsRegistry(): ComparisonRegistry {
  const indexPath = getRegistryIndexPath();

  if (!fs.existsSync(indexPath)) {
    return {
      version: REGISTRY_VERSION,
      comparisons: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  try {
    const content = fs.readFileSync(indexPath, "utf-8");
    return JSON.parse(content) as ComparisonRegistry;
  } catch (error) {
    console.error("Failed to load comparisons registry:", error);
    return {
      version: REGISTRY_VERSION,
      comparisons: {},
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Save the comparisons registry
 */
function saveComparisonsRegistry(registry: ComparisonRegistry): void {
  const indexPath = getRegistryIndexPath();
  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(registry, null, 2));
}

/**
 * Generate a unique comparison ID (8 characters)
 */
export function generateComparisonId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return (timestamp + random).substring(0, 8).toUpperCase();
}

/**
 * Save a new comparison
 */
export function saveComparison(
  request: SaveComparisonRequest,
  diffData: DiffData
): SavedComparison {
  const registry = loadComparisonsRegistry();

  const comparisonId = generateComparisonId();
  const riskScore = computeRiskScore(diffData);
  const { label: riskLabel } = getRiskScoreLabel(riskScore);

  const comparison: SavedComparison = {
    comparisonId,
    baselineRunUid: request.baselineRunUid,
    currentRunUid: request.currentRunUid,
    network: diffData.network,
    createdAt: new Date().toISOString(),
    diffData,
    riskScore,
    riskLabel,
    title: request.title,
    notes: request.notes,
  };

  registry.comparisons[comparisonId] = comparison;
  saveComparisonsRegistry(registry);

  return comparison;
}

/**
 * Get a comparison by ID
 */
export function getComparisonById(comparisonId: string): SavedComparison | null {
  const registry = loadComparisonsRegistry();
  return registry.comparisons[comparisonId] || null;
}

/**
 * List all comparisons, sorted by creation date (newest first)
 */
export function listComparisons(network?: string): SavedComparison[] {
  const registry = loadComparisonsRegistry();
  let comparisons = Object.values(registry.comparisons);

  if (network) {
    comparisons = comparisons.filter(
      (c) => c.network.toLowerCase() === network.toLowerCase()
    );
  }

  // Sort by creation date, newest first
  comparisons.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return comparisons;
}

/**
 * Delete a comparison
 */
export function deleteComparison(comparisonId: string): boolean {
  const registry = loadComparisonsRegistry();

  if (!(comparisonId in registry.comparisons)) {
    return false;
  }

  delete registry.comparisons[comparisonId];
  saveComparisonsRegistry(registry);

  return true;
}

/**
 * Update a comparison (title, notes only)
 */
export function updateComparison(
  comparisonId: string,
  updates: { title?: string; notes?: string }
): SavedComparison | null {
  const registry = loadComparisonsRegistry();

  if (!(comparisonId in registry.comparisons)) {
    return null;
  }

  const comparison = registry.comparisons[comparisonId];

  if (updates.title !== undefined) comparison.title = updates.title;
  if (updates.notes !== undefined) comparison.notes = updates.notes;

  registry.comparisons[comparisonId] = comparison;
  saveComparisonsRegistry(registry);

  return comparison;
}

/**
 * Get comparison statistics
 */
export function getComparisonsStats(): {
  totalComparisons: number;
  networks: string[];
  mostRecentComparison: string | null;
} {
  const comparisons = listComparisons();

  const networks = [...new Set(comparisons.map((c) => c.network))];
  const mostRecentComparison =
    comparisons.length > 0 ? comparisons[0].createdAt : null;

  return {
    totalComparisons: comparisons.length,
    networks,
    mostRecentComparison,
  };
}
