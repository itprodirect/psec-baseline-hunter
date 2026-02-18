import * as path from "path";

/**
 * Resolve a candidate path only if it is inside the provided base directory.
 * Returns null when the candidate escapes the base directory.
 */
export function resolvePathWithin(baseDir: string, candidatePath: string): string | null {
  const resolvedBase = path.resolve(baseDir);
  const resolvedCandidate = path.resolve(candidatePath);

  if (
    resolvedCandidate === resolvedBase ||
    resolvedCandidate.startsWith(`${resolvedBase}${path.sep}`)
  ) {
    return resolvedCandidate;
  }

  return null;
}

/**
 * Validate a user-provided network name used as a directory segment.
 * Allows spaces and punctuation except path separators and traversal patterns.
 */
export function sanitizeNetworkName(network: string): string | null {
  const normalized = network.trim();

  if (!normalized || normalized.length > 120) {
    return null;
  }

  if (normalized.includes("\0")) {
    return null;
  }

  if (normalized === "." || normalized === ".." || normalized.includes("..")) {
    return null;
  }

  if (/[\\/]/.test(normalized)) {
    return null;
  }

  return normalized;
}
