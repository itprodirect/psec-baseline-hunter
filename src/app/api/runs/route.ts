/**
 * Runs List API Route
 * Returns metadata for all detected runs
 */

import { NextResponse } from "next/server";
import { listAllRuns } from "@/lib/services/ingest";
import { RunsListResponse } from "@/lib/types";

export async function GET(): Promise<NextResponse<RunsListResponse>> {
  try {
    const runs = listAllRuns();

    // Convert Date objects to ISO strings for JSON serialization
    const serializedRuns = runs.map(run => ({
      ...run,
      timestamp: run.timestamp ? run.timestamp.toISOString() : null,
    }));

    return NextResponse.json({
      success: true,
      runs: serializedRuns as RunsListResponse["runs"],
    });
  } catch (error) {
    console.error("List runs error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to list runs" },
      { status: 500 }
    );
  }
}
