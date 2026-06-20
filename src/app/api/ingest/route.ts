/**
 * Ingest API Route
 * Extracts a ZIP file and detects run folders with deduplication
 */

import { NextRequest, NextResponse } from "next/server";
import { extractZip, detectRunFolders, getDataDir } from "@/lib/services/ingest";
import { registerRun, RunManifest } from "@/lib/services/run-registry";
import { adaptRunManifestToObservationBundleV1 } from "@/lib/services/observation-bundle";
import { registerObservationBundle } from "@/lib/services/observation-registry";
import { IngestResponseV2 } from "@/lib/types";
import { shortId } from "@/lib/utils/hash";
import * as fs from "fs";
import * as path from "path";
import { resolvePathWithin } from "@/lib/services/path-safety";
import {
  getSafeErrorMessage,
  sanitizeRunManifestForClient,
  toClientDataPath,
} from "@/lib/services/api-response-safety";
import {
  isRequestValidationError,
  readJsonObject,
  validateIngestBody,
} from "@/lib/services/request-validation";

interface IngestRequestBody {
  zipPath: string;
  network?: string;
}

interface ObservationImportSummary {
  created: number;
  duplicate: number;
  skipped: number;
  failed: number;
  warnings: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse<IngestResponseV2>> {
  try {
    const body: IngestRequestBody = validateIngestBody(await readJsonObject(request));
    const { zipPath, network } = body;

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
    const observations: ObservationImportSummary = {
      created: 0,
      duplicate: 0,
      skipped: 0,
      failed: 0,
      warnings: [],
    };
    let newRunCount = 0;
    let duplicateCount = 0;

    for (const runFolder of runFolders) {
      const { manifest, isNew } = registerRun(runFolder, extractionId, network);
      registeredRuns.push(manifest);
      registerRunObservation(manifest, observations);

      if (isNew) {
        newRunCount++;
      } else {
        duplicateCount++;
      }
    }

    return NextResponse.json({
      success: true,
      extractedPath: toClientDataPath(extractedPath),
      runs: registeredRuns.map(sanitizeRunManifestForClient),
      newRuns: newRunCount,
      duplicateRuns: duplicateCount,
      observations,
    });
  } catch (error) {
    if (isRequestValidationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Ingest error:", error);
    return NextResponse.json(
      { success: false, error: getSafeErrorMessage(error, "Ingest failed") },
      { status: 500 }
    );
  }
}

function registerRunObservation(
  manifest: RunManifest,
  summary: ObservationImportSummary
): void {
  if (manifest.stats.keyFileCount < 1) {
    summary.skipped++;
    return;
  }

  try {
    const bundle = adaptRunManifestToObservationBundleV1(manifest);
    const result = registerObservationBundle(bundle);

    if (result.isNew) {
      summary.created++;
    } else {
      summary.duplicate++;
    }
  } catch (error) {
    summary.failed++;
    if (summary.warnings.length === 0) {
      summary.warnings.push(
        "One or more scan runs were imported, but an activity observation record could not be created. The scan run is still available for scan review and technical diff."
      );
    }
    console.error("Observation registration after ingest failed:", error);
  }
}
