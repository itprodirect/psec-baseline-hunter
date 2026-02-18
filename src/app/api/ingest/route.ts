/**
 * Ingest API Route
 * Extracts a ZIP file and detects run folders with deduplication
 */

import { NextRequest, NextResponse } from "next/server";
import { extractZip, detectRunFolders, getDataDir } from "@/lib/services/ingest";
import { registerRun, RunManifest } from "@/lib/services/run-registry";
import { IngestResponseV2 } from "@/lib/types";
import { shortId } from "@/lib/utils/hash";
import * as fs from "fs";
import * as path from "path";
import { resolvePathWithin } from "@/lib/services/path-safety";

interface IngestRequestBody {
  zipPath: string;
  network?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<IngestResponseV2>> {
  try {
    const body: IngestRequestBody = await request.json();
    const { zipPath, network } = body;

    if (!zipPath) {
      return NextResponse.json(
        { success: false, error: "zipPath is required" },
        { status: 400 }
      );
    }

    if (!zipPath.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { success: false, error: "zipPath must point to a .zip file" },
        { status: 400 }
      );
    }

    const uploadsDir = path.join(getDataDir(), "uploads");
    const safeZipPath = resolvePathWithin(uploadsDir, zipPath);
    if (!safeZipPath) {
      return NextResponse.json(
        { success: false, error: "zipPath must reference a file in data/uploads" },
        { status: 400 }
      );
    }

    // Verify the file exists
    if (!fs.existsSync(safeZipPath)) {
      return NextResponse.json(
        { success: false, error: "ZIP file not found" },
        { status: 404 }
      );
    }

    // Generate extraction ID
    const extractionId = shortId();

    // Extract ZIP
    const extractedPath = extractZip(safeZipPath);

    // Detect run folders
    const runFolders = detectRunFolders(extractedPath);

    // Register each run with deduplication
    const registeredRuns: RunManifest[] = [];
    let newRunCount = 0;
    let duplicateCount = 0;

    for (const runFolder of runFolders) {
      const { manifest, isNew } = registerRun(runFolder, extractionId, network);
      registeredRuns.push(manifest);

      if (isNew) {
        newRunCount++;
      } else {
        duplicateCount++;
      }
    }

    return NextResponse.json({
      success: true,
      extractedPath,
      runs: registeredRuns,
      newRuns: newRunCount,
      duplicateRuns: duplicateCount,
    });
  } catch (error) {
    console.error("Ingest error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 }
    );
  }
}
