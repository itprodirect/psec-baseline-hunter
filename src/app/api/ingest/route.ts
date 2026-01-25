/**
 * Ingest API Route
 * Extracts a ZIP file and detects run folders
 */

import { NextRequest, NextResponse } from "next/server";
import { ingestZip } from "@/lib/services/ingest";
import { IngestResponse } from "@/lib/types";
import * as fs from "fs";

interface IngestRequestBody {
  zipPath: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<IngestResponse>> {
  try {
    const body: IngestRequestBody = await request.json();
    const { zipPath } = body;

    if (!zipPath) {
      return NextResponse.json(
        { success: false, error: "zipPath is required" },
        { status: 400 }
      );
    }

    // Verify the file exists
    if (!fs.existsSync(zipPath)) {
      return NextResponse.json(
        { success: false, error: "ZIP file not found" },
        { status: 404 }
      );
    }

    // Extract and detect runs
    const { extractedPath, runs } = ingestZip(zipPath);

    // Convert Date objects to ISO strings for JSON serialization
    const serializedRuns = runs.map(run => ({
      ...run,
      timestamp: run.timestamp ? run.timestamp.toISOString() : null,
    }));

    return NextResponse.json({
      success: true,
      extractedPath,
      runs: serializedRuns as IngestResponse["runs"],
    });
  } catch (error) {
    console.error("Ingest error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 }
    );
  }
}
