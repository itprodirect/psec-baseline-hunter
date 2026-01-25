/**
 * Content hashing utilities for run deduplication
 */

import * as crypto from "crypto";
import * as fs from "fs";

/**
 * Compute SHA256 hash of a file
 */
export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Compute SHA256 hash of a string
 */
export function hashString(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Compute a combined hash from multiple file paths
 * Used to create a unique run identifier
 */
export function hashFiles(filePaths: string[]): string {
  const hashes: string[] = [];

  for (const filePath of filePaths.sort()) {
    if (fs.existsSync(filePath)) {
      hashes.push(hashFile(filePath));
    }
  }

  if (hashes.length === 0) {
    return "";
  }

  // Combine all hashes into one
  return hashString(hashes.join(":"));
}

/**
 * Generate a unique run UID from run metadata
 * Format: network_timestamp_type_hash
 */
export function generateRunUid(
  network: string,
  timestamp: Date | null,
  runType: string,
  keyFilePaths: string[]
): string {
  const parts: string[] = [];

  // Add network (sanitized)
  parts.push(sanitizeForUid(network || "unknown"));

  // Add timestamp
  if (timestamp) {
    parts.push(timestamp.toISOString().replace(/[:.]/g, "-").slice(0, 19));
  } else {
    parts.push("notime");
  }

  // Add run type (sanitized)
  parts.push(sanitizeForUid(runType || "unknown"));

  // Add content hash (first 12 chars)
  const contentHash = hashFiles(keyFilePaths);
  if (contentHash) {
    parts.push(contentHash.slice(0, 12));
  } else {
    // Use random if no key files
    parts.push(crypto.randomUUID().slice(0, 12));
  }

  return parts.join("_");
}

/**
 * Sanitize a string for use in a UID
 */
function sanitizeForUid(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

/**
 * Generate a short unique ID
 */
export function shortId(): string {
  return crypto.randomUUID().slice(0, 8);
}
