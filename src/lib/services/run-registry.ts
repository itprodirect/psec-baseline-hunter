/**
 * Run Registry Service
 * Manages run manifests with deduplication support
 */

import * as fs from "fs";
import * as path from "path";
import { RunMeta } from "@/lib/types";
import { getDataDir, ensureDir, buildRunMeta, parseRunFolderName } from "./ingest";
import { generateRunUid, hashFiles } from "@/lib/utils/hash";

/**
 * Run manifest stored in the registry
 */
export interface RunManifest {
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
 * Registry index file structure
 */
interface RegistryIndex {
  version: number;
  runs: Record<string, RunManifest>;
  lastUpdated: string;
}

const REGISTRY_VERSION = 1;

/**
 * Get path to registry directory
 */
export function getRegistryDir(): string {
  return ensureDir(path.join(getDataDir(), "runs"));
}

/**
 * Get path to registry index file
 */
function getRegistryIndexPath(): string {
  return path.join(getRegistryDir(), "index.json");
}

/**
 * Load the registry index
 */
export function loadRegistry(): RegistryIndex {
  const indexPath = getRegistryIndexPath();

  if (!fs.existsSync(indexPath)) {
    return {
      version: REGISTRY_VERSION,
      runs: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  try {
    const content = fs.readFileSync(indexPath, "utf-8");
    return JSON.parse(content) as RegistryIndex;
  } catch (error) {
    console.error("Failed to load registry index:", error);
    return {
      version: REGISTRY_VERSION,
      runs: {},
      lastUpdated: new Date().toISOString(),
    };
  }
}

/**
 * Save the registry index
 */
function saveRegistry(registry: RegistryIndex): void {
  const indexPath = getRegistryIndexPath();
  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(indexPath, JSON.stringify(registry, null, 2));
}

/**
 * Guess network name from extracted folder or run folder
 */
export function guessNetworkName(extractedRoot: string, runFolder: string): string {
  // Try to extract network from the extracted root folder name
  const extractedName = path.basename(extractedRoot);
  const parts = extractedName.split("_");

  // Look for pattern: network_date_time_...
  if (parts.length >= 3) {
    const firstPart = parts[0];
    // Check if first part looks like a date (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstPart)) {
      return firstPart.toLowerCase();
    }
  }

  // Try to find network from directory structure
  // Look for parent directories that might be network names
  const runFolderParts = runFolder.split(/[/\\]/);
  for (let i = runFolderParts.length - 2; i >= 0; i--) {
    const part = runFolderParts[i];
    if (part === "rawscans" || part === "extracted" || part === "data") {
      continue;
    }
    // Skip if it looks like a run folder name
    const { timestamp } = parseRunFolderName(part);
    if (timestamp) {
      continue;
    }
    // Skip if it looks like an extraction ID (8 hex chars at end)
    if (/_[a-f0-9]{8}$/i.test(part)) {
      // Take the part before the extraction ID
      const networkPart = part.replace(/_[a-f0-9]{8}$/i, "").split("_")[0];
      if (networkPart) {
        return networkPart.toLowerCase();
      }
    }
    return part.toLowerCase();
  }

  return "unknown";
}

/**
 * Create a run manifest from a run folder
 */
export function createManifest(
  runFolder: string,
  extractionId: string,
  network?: string
): RunManifest {
  const meta = buildRunMeta(runFolder);
  const folderName = path.basename(runFolder);

  // Get all key file paths for hashing
  const allKeyFilePaths = Object.values(meta.keyFiles).flat();

  // Generate content hash
  const contentHash = hashFiles(allKeyFilePaths);

  // Determine network
  const extractedRoot = path.dirname(path.dirname(runFolder));
  const networkName = network || guessNetworkName(extractedRoot, runFolder);

  // Generate run UID
  const runUid = generateRunUid(
    networkName,
    meta.timestamp,
    meta.runType,
    allKeyFilePaths
  );

  return {
    runUid,
    network: networkName,
    runFolder: meta.runFolder,
    folderName,
    timestamp: meta.timestamp ? meta.timestamp.toISOString() : null,
    runType: meta.runType,
    keyFiles: meta.keyFiles,
    contentHash,
    stats: {
      keyFileCount: allKeyFilePaths.length,
      hasPortsScan: "ports" in meta.keyFiles,
      hasHostsUp: "hosts_up" in meta.keyFiles,
      hasDiscovery: "discovery" in meta.keyFiles,
    },
    createdAt: new Date().toISOString(),
    extractionId,
  };
}

/**
 * Check if a run already exists in the registry (by content hash)
 */
export function findDuplicateRun(contentHash: string): RunManifest | null {
  if (!contentHash) {
    return null;
  }

  const registry = loadRegistry();

  for (const manifest of Object.values(registry.runs)) {
    if (manifest.contentHash === contentHash) {
      return manifest;
    }
  }

  return null;
}

/**
 * Register a new run in the registry
 * Returns the manifest if new, or existing manifest if duplicate
 */
export function registerRun(
  runFolder: string,
  extractionId: string,
  network?: string
): { manifest: RunManifest; isNew: boolean } {
  const manifest = createManifest(runFolder, extractionId, network);

  // Check for duplicate
  const existing = findDuplicateRun(manifest.contentHash);
  if (existing) {
    return { manifest: existing, isNew: false };
  }

  // Save to registry
  const registry = loadRegistry();
  registry.runs[manifest.runUid] = manifest;
  saveRegistry(registry);

  // Also save individual manifest file
  const manifestPath = path.join(getRegistryDir(), `${manifest.runUid}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { manifest, isNew: true };
}

/**
 * Get a run by UID
 */
export function getRunByUid(runUid: string): RunManifest | null {
  const registry = loadRegistry();
  return registry.runs[runUid] || null;
}

/**
 * List all registered runs
 */
export function listRegisteredRuns(): RunManifest[] {
  const registry = loadRegistry();
  const runs = Object.values(registry.runs);

  // Sort by timestamp (newest first)
  runs.sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    }
    if (a.timestamp && !b.timestamp) return -1;
    if (!a.timestamp && b.timestamp) return 1;
    return 0;
  });

  return runs;
}

/**
 * List runs filtered by network
 */
export function listRunsByNetwork(network: string): RunManifest[] {
  return listRegisteredRuns().filter(
    (run) => run.network.toLowerCase() === network.toLowerCase()
  );
}

/**
 * Get all unique network names
 */
export function listNetworks(): string[] {
  const runs = listRegisteredRuns();
  const networks = new Set(runs.map((r) => r.network));
  return Array.from(networks).sort();
}

/**
 * Delete a run from the registry
 */
export function deleteRun(runUid: string): boolean {
  const registry = loadRegistry();

  if (!(runUid in registry.runs)) {
    return false;
  }

  delete registry.runs[runUid];
  saveRegistry(registry);

  // Also delete individual manifest file
  const manifestPath = path.join(getRegistryDir(), `${runUid}.json`);
  if (fs.existsSync(manifestPath)) {
    fs.unlinkSync(manifestPath);
  }

  return true;
}

/**
 * Convert RunManifest to RunMeta for API compatibility
 */
export function manifestToRunMeta(manifest: RunManifest): RunMeta {
  return {
    runFolder: manifest.runFolder,
    timestamp: manifest.timestamp ? new Date(manifest.timestamp) : null,
    runType: manifest.runType,
    keyFiles: manifest.keyFiles,
  };
}

/**
 * Get registry statistics
 */
export function getRegistryStats(): {
  totalRuns: number;
  networks: number;
  oldestRun: string | null;
  newestRun: string | null;
} {
  const runs = listRegisteredRuns();

  if (runs.length === 0) {
    return {
      totalRuns: 0,
      networks: 0,
      oldestRun: null,
      newestRun: null,
    };
  }

  const networks = new Set(runs.map((r) => r.network));
  const timestamps = runs
    .filter((r) => r.timestamp)
    .map((r) => r.timestamp as string)
    .sort();

  return {
    totalRuns: runs.length,
    networks: networks.size,
    oldestRun: timestamps[0] || null,
    newestRun: timestamps[timestamps.length - 1] || null,
  };
}
