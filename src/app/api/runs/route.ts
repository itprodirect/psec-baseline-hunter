/**
 * Runs List API Route
 * Returns metadata for all registered runs with deduplication
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listRegisteredRuns,
  listRunsByNetwork,
  getRegistryStats,
} from "@/lib/services/run-registry";
import {
  getSafeErrorMessage,
  sanitizeRunManifestForClient,
} from "@/lib/services/api-response-safety";
import { RunsListResponseV2 } from "@/lib/types";

export async function GET(request: NextRequest): Promise<NextResponse<RunsListResponseV2>> {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const network = searchParams.get("network");
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");

    // Get runs (filtered by network if specified)
    let runs = network
      ? listRunsByNetwork(network)
      : listRegisteredRuns();

    // Apply pagination
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    const limitNum = limit ? parseInt(limit, 10) : undefined;

    if (offsetNum > 0) {
      runs = runs.slice(offsetNum);
    }
    if (limitNum) {
      runs = runs.slice(0, limitNum);
    }

    // Get stats
    const stats = getRegistryStats();

    return NextResponse.json({
      success: true,
      runs: runs.map(sanitizeRunManifestForClient),
      stats: {
        totalRuns: stats.totalRuns,
        networks: stats.networks,
      },
    });
  } catch (error) {
    console.error("List runs error:", error);
    return NextResponse.json(
      { success: false, error: getSafeErrorMessage(error, "Failed to list runs") },
      { status: 500 }
    );
  }
}
