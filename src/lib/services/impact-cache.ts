/**
 * Port Impact Cache Service
 * Caches LLM-generated port impact data in localStorage with 30-day TTL
 */

import { PortImpactData, PortImpactCacheEntry } from "@/lib/types";

const CACHE_KEY_PREFIX = "psec_impact_";
const CACHE_TTL_DAYS = 30;

/**
 * Generate cache key for a port
 */
function getCacheKey(port: number, protocol: string, service: string): string {
  // Normalize service name to handle variations
  const normalizedService = service.toLowerCase().trim();
  return `${CACHE_KEY_PREFIX}${port}_${protocol}_${normalizedService}`;
}

/**
 * Get cached impact data if still valid
 */
export function getCachedImpact(
  port: number,
  protocol: string,
  service: string
): PortImpactData | null {
  if (typeof window === "undefined") {
    return null; // No localStorage on server
  }

  try {
    const key = getCacheKey(port, protocol, service);
    const cached = localStorage.getItem(key);

    if (!cached) {
      return null;
    }

    const entry: PortImpactCacheEntry = JSON.parse(cached);

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(entry.expiresAt);

    if (now > expiresAt) {
      // Expired - remove from cache
      localStorage.removeItem(key);
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error("Error reading impact cache:", error);
    return null;
  }
}

/**
 * Cache impact data with 30-day TTL
 */
export function cacheImpact(
  port: number,
  protocol: string,
  service: string,
  data: PortImpactData
): void {
  if (typeof window === "undefined") {
    return; // No localStorage on server
  }

  try {
    const key = getCacheKey(port, protocol, service);
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);

    const entry: PortImpactCacheEntry = {
      data,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    localStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.error("Error writing impact cache:", error);
    // Don't throw - caching is optional, failure shouldn't break the app
  }
}

/**
 * Clear all impact cache entries (debug utility)
 */
export function clearImpactCache(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keys = Object.keys(localStorage);
    const impactKeys = keys.filter(k => k.startsWith(CACHE_KEY_PREFIX));

    for (const key of impactKeys) {
      localStorage.removeItem(key);
    }

    console.log(`Cleared ${impactKeys.length} impact cache entries`);
  } catch (error) {
    console.error("Error clearing impact cache:", error);
  }
}

/**
 * Get cache statistics (debug utility)
 */
export function getImpactCacheStats(): {
  totalEntries: number;
  validEntries: number;
  expiredEntries: number;
} {
  if (typeof window === "undefined") {
    return { totalEntries: 0, validEntries: 0, expiredEntries: 0 };
  }

  try {
    const keys = Object.keys(localStorage);
    const impactKeys = keys.filter(k => k.startsWith(CACHE_KEY_PREFIX));
    const now = new Date();

    let validCount = 0;
    let expiredCount = 0;

    for (const key of impactKeys) {
      try {
        const cached = localStorage.getItem(key);
        if (!cached) continue;

        const entry: PortImpactCacheEntry = JSON.parse(cached);
        const expiresAt = new Date(entry.expiresAt);

        if (now > expiresAt) {
          expiredCount++;
        } else {
          validCount++;
        }
      } catch {
        // Malformed entry
        expiredCount++;
      }
    }

    return {
      totalEntries: impactKeys.length,
      validEntries: validCount,
      expiredEntries: expiredCount
    };
  } catch (error) {
    console.error("Error getting cache stats:", error);
    return { totalEntries: 0, validEntries: 0, expiredEntries: 0 };
  }
}
