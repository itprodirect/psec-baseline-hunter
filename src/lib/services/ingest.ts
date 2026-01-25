/**
 * Ingest service - run detection and ZIP extraction
 * Ported from core/ingest.py
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import AdmZip from "adm-zip";
import { RunMeta } from "@/lib/types";
import { KEY_FILE_PATTERNS, RUN_FOLDER_REGEX } from "@/lib/constants/file-patterns";

/**
 * Get the data directory path
 */
export function getDataDir(): string {
  return path.join(process.cwd(), "data");
}

/**
 * Ensure a directory exists
 */
export function ensureDir(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Parse run folder name to extract timestamp and run type
 * Example: 2025-12-31_2044_baselinekit_v0 -> { timestamp: Date, runType: "baselinekit_v0" }
 */
export function parseRunFolderName(
  name: string
): { timestamp: Date | null; runType: string } {
  const match = RUN_FOLDER_REGEX.exec(name);
  if (!match) {
    return { timestamp: null, runType: "" };
  }

  // Groups: [1]=date, [2]=hm, [3]=rest
  const date = match[1];
  const hm = match[2];
  const rest = match[3];

  // Parse date: YYYY-MM-DD and time: HHMM
  const dateStr = `${date}T${hm.slice(0, 2)}:${hm.slice(2, 4)}:00`;
  let timestamp: Date | null = null;

  try {
    timestamp = new Date(dateStr);
    if (isNaN(timestamp.getTime())) {
      timestamp = null;
    }
  } catch {
    timestamp = null;
  }

  return { timestamp, runType: rest || "" };
}

/**
 * Find run folders under an extracted directory
 * Primarily looks under rawscans/ directories
 */
export function detectRunFolders(extractedRoot: string): string[] {
  const runCandidates: string[] = [];

  // Helper to recursively find rawscans directories
  function findRawscansDirs(dir: string): string[] {
    const results: string[] = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);
          if (entry.name === "rawscans") {
            results.push(fullPath);
          }
          // Recurse into subdirectories
          results.push(...findRawscansDirs(fullPath));
        }
      }
    } catch {
      // Ignore permission errors
    }

    return results;
  }

  // Find rawscans directories
  const rawscansDirs = findRawscansDirs(extractedRoot);

  // Look for run folders in rawscans directories
  for (const rawscansDir of rawscansDirs) {
    try {
      const entries = fs.readdirSync(rawscansDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const { timestamp, runType } = parseRunFolderName(entry.name);
          if (timestamp || runType) {
            runCandidates.push(path.join(rawscansDir, entry.name));
          }
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Fallback: search all directories if no rawscans found
  if (runCandidates.length === 0) {
    function searchAll(dir: string): void {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(dir, entry.name);
            const { timestamp, runType } = parseRunFolderName(entry.name);

            if (timestamp || runType) {
              // Check if it has scan files
              const hasXml = fs.readdirSync(fullPath).some(f => f.endsWith(".xml"));
              const hasNmap = fs.readdirSync(fullPath).some(f => f.endsWith(".nmap"));
              const hasGnmap = fs.readdirSync(fullPath).some(f => f.endsWith(".gnmap"));

              if (hasXml || hasNmap || hasGnmap) {
                runCandidates.push(fullPath);
              }
            }

            // Recurse
            searchAll(fullPath);
          }
        }
      } catch {
        // Ignore errors
      }
    }
    searchAll(extractedRoot);
  }

  // Deduplicate by resolved path
  const unique = [...new Set(runCandidates.map(p => path.resolve(p)))];

  // Sort by timestamp (newest first)
  unique.sort((a, b) => {
    const aName = path.basename(a);
    const bName = path.basename(b);
    const aTs = parseRunFolderName(aName).timestamp;
    const bTs = parseRunFolderName(bName).timestamp;

    // Sort by: has timestamp (true first), then by timestamp descending
    if (aTs && bTs) {
      return bTs.getTime() - aTs.getTime();
    }
    if (aTs && !bTs) return -1;
    if (!aTs && bTs) return 1;
    return 0;
  });

  return unique;
}

/**
 * Find key files in a run folder
 * Returns a map of label -> list of file paths
 */
export function findKeyFiles(runFolder: string): Record<string, string[]> {
  const found: Record<string, string[]> = {};

  for (const [label, patterns] of Object.entries(KEY_FILE_PATTERNS)) {
    const hits: string[] = [];

    for (const pattern of patterns) {
      if (pattern.includes("*")) {
        // Glob pattern - do simple prefix matching
        const prefix = pattern.replace("*", "");
        try {
          const files = fs.readdirSync(runFolder);
          for (const file of files) {
            if (file.startsWith(prefix)) {
              const fullPath = path.join(runFolder, file);
              if (fs.statSync(fullPath).isFile()) {
                hits.push(fullPath);
              }
            }
          }
        } catch {
          // Ignore errors
        }
      } else {
        // Exact filename
        const fullPath = path.join(runFolder, pattern);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          hits.push(fullPath);
        }
      }
    }

    // Deduplicate
    const deduped = [...new Set(hits.map(p => path.resolve(p)))];
    if (deduped.length > 0) {
      found[label] = deduped;
    }
  }

  return found;
}

/**
 * Build metadata for a run folder
 */
export function buildRunMeta(runFolder: string): RunMeta {
  const name = path.basename(runFolder);
  const { timestamp, runType } = parseRunFolderName(name);
  const keyFiles = findKeyFiles(runFolder);

  return {
    runFolder: path.resolve(runFolder),
    timestamp,
    runType: runType || "",
    keyFiles,
  };
}

/**
 * Guess network name from folder structure
 */
export function guessNetworkName(extractedRoot: string): string | null {
  // Look for common patterns like: network_name/rawscans/...
  try {
    const entries = fs.readdirSync(extractedRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(extractedRoot, entry.name);
        // Check if this directory contains rawscans
        if (fs.existsSync(path.join(subPath, "rawscans"))) {
          return entry.name;
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Save uploaded file to disk
 */
export async function saveUpload(
  buffer: Buffer,
  originalName: string
): Promise<string> {
  const uploadsDir = ensureDir(path.join(getDataDir(), "uploads"));

  const stem = path.basename(originalName, path.extname(originalName));
  const uploadId = crypto.randomUUID().slice(0, 10);
  const outPath = path.join(uploadsDir, `${stem}_${uploadId}.zip`);

  fs.writeFileSync(outPath, buffer);
  return outPath;
}

/**
 * Extract ZIP file to data/extracted/
 */
export function extractZip(zipPath: string): string {
  const stem = path.basename(zipPath, ".zip");
  const extractId = crypto.randomUUID().slice(0, 8);
  const outDir = ensureDir(path.join(getDataDir(), "extracted", `${stem}_${extractId}`));

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(outDir, true);

  return outDir;
}

/**
 * Full ingest pipeline: extract ZIP and detect runs
 */
export function ingestZip(zipPath: string): { extractedPath: string; runs: RunMeta[] } {
  const extractedPath = extractZip(zipPath);
  const runFolders = detectRunFolders(extractedPath);
  const runs = runFolders.map(buildRunMeta);

  return { extractedPath, runs };
}

/**
 * List all existing runs from extracted directories
 */
export function listAllRuns(): RunMeta[] {
  const extractedDir = path.join(getDataDir(), "extracted");

  if (!fs.existsSync(extractedDir)) {
    return [];
  }

  const allRuns: RunMeta[] = [];

  try {
    const entries = fs.readdirSync(extractedDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const extractedRoot = path.join(extractedDir, entry.name);
        const runFolders = detectRunFolders(extractedRoot);
        const runs = runFolders.map(buildRunMeta);
        allRuns.push(...runs);
      }
    }
  } catch {
    // Ignore errors
  }

  // Sort by timestamp (newest first)
  allRuns.sort((a, b) => {
    if (a.timestamp && b.timestamp) {
      return b.timestamp.getTime() - a.timestamp.getTime();
    }
    if (a.timestamp && !b.timestamp) return -1;
    if (!a.timestamp && b.timestamp) return 1;
    return 0;
  });

  return allRuns;
}
