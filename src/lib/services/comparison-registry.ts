/**
 * Comparison Registry Service
 * Manages saved comparisons with shareable IDs
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import {
  SavedComparison,
  ComparisonRegistry,
  SaveComparisonRequest,
} from "@/lib/types";
import { getDataDir, ensureDir } from "./ingest";
import { computeDiff, computeRiskScore, getRiskScoreLabel } from "./diff-engine";

const REGISTRY_VERSION = 1;

/**
 * Get path to comparisons registry directory
 */
export function getComparisonsDir(): string {
  return ensureDir(path.join(getDataDir(), "comparisons"));
}

/**
 * Get path to registry index file
 */
function getRegistryIndexPath(): string {
  return path.join(getComparisonsDir(), "index.json");
}

/**
 * Load the comparisons registry
 */
export function loadComparisonRegistry(): ComparisonRegistry {
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
    console.error("Failed to load comparison registry:", error);
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
function saveComparisonRegistry(registry: ComparisonRegistry): void {
  const indexPath = getRegistryIndexPath();
  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(registry, null, 2));
}

/**
 * Generate a short unique comparison ID
 */
export function generateComparisonId(): string {
  return crypto.randomBytes(4).toString("hex"); // 8 character hex string
}

/**
 * Save a new comparison
 */
export function saveComparison(request: SaveComparisonRequest): SavedComparison | null {
  // Compute the diff
  const diffData = computeDiff(request.baselineRunUid, request.currentRunUid);
  if (!diffData) {
    return null;
  }

  // Compute risk score
  const riskScore = computeRiskScore(diffData);
  const { label: riskLabel } = getRiskScoreLabel(riskScore);

  const registry = loadComparisonRegistry();

  const comparison: SavedComparison = {
    comparisonId: generateComparisonId(),
    baselineRunUid: request.baselineRunUid,
    currentRunUid: request.currentRunUid,
    network: diffData.network,
    createdAt: new Date().toISOString(),
    diffData,
    riskScore,
    riskLabel,
    title: request.title || `${diffData.network} comparison`,
    notes: request.notes,
  };

  registry.comparisons[comparison.comparisonId] = comparison;
  saveComparisonRegistry(registry);

  // Also save individual comparison file for faster access
  const comparisonPath = path.join(
    getComparisonsDir(),
    `${comparison.comparisonId}.json`
  );
  fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));

  return comparison;
}

/**
 * Get a comparison by ID
 */
export function getComparisonById(comparisonId: string): SavedComparison | null {
  // Try to load from individual file first (faster for large registries)
  const comparisonPath = path.join(getComparisonsDir(), `${comparisonId}.json`);
  if (fs.existsSync(comparisonPath)) {
    try {
      const content = fs.readFileSync(comparisonPath, "utf-8");
      return JSON.parse(content) as SavedComparison;
    } catch (error) {
      console.error("Failed to load comparison file:", error);
    }
  }

  // Fall back to registry
  const registry = loadComparisonRegistry();
  return registry.comparisons[comparisonId] || null;
}

/**
 * List all comparisons, optionally filtered by network
 */
export function listComparisons(network?: string): SavedComparison[] {
  const registry = loadComparisonRegistry();
  let comparisons = Object.values(registry.comparisons);

  if (network) {
    comparisons = comparisons.filter(
      (c) => c.network.toLowerCase() === network.toLowerCase()
    );
  }

  // Sort by creation date (newest first)
  comparisons.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return comparisons;
}

/**
 * Delete a comparison
 */
export function deleteComparison(comparisonId: string): boolean {
  const registry = loadComparisonRegistry();

  if (!(comparisonId in registry.comparisons)) {
    return false;
  }

  delete registry.comparisons[comparisonId];
  saveComparisonRegistry(registry);

  // Also delete individual file
  const comparisonPath = path.join(getComparisonsDir(), `${comparisonId}.json`);
  if (fs.existsSync(comparisonPath)) {
    fs.unlinkSync(comparisonPath);
  }

  return true;
}

/**
 * Get comparison statistics
 */
export function getComparisonStats(): {
  totalComparisons: number;
  networks: string[];
  oldest: string | null;
  newest: string | null;
} {
  const comparisons = listComparisons();

  if (comparisons.length === 0) {
    return {
      totalComparisons: 0,
      networks: [],
      oldest: null,
      newest: null,
    };
  }

  const networks = [...new Set(comparisons.map((c) => c.network))].sort();
  const dates = comparisons.map((c) => c.createdAt).sort();

  return {
    totalComparisons: comparisons.length,
    networks,
    oldest: dates[0],
    newest: dates[dates.length - 1],
  };
}
