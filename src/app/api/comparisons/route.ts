/**
 * Comparisons API
 * GET /api/comparisons - List all saved comparisons
 * POST /api/comparisons - Save a new comparison
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listComparisons,
  saveComparison,
} from "@/lib/services/comparisons-registry";
import { computeDiff } from "@/lib/services/diff-engine";
import { ComparisonResponse } from "@/lib/types";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import {
  isRequestValidationError,
  readJsonObject,
  validateSaveComparisonBody,
} from "@/lib/services/request-validation";

export async function GET(
  request: NextRequest
): Promise<NextResponse<ComparisonResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const network = searchParams.get("network") || undefined;

    const comparisons = listComparisons(network);

    return NextResponse.json({
      success: true,
      comparisons,
    });
  } catch (error) {
    console.error("Failed to list comparisons:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to list comparisons"),
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ComparisonResponse>> {
  try {
    const body = validateSaveComparisonBody(await readJsonObject(request));

    // Compute the diff
    const diffData = computeDiff(body.baselineRunUid, body.currentRunUid);

    if (!diffData) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not compute diff. Check that both runs exist and have port scan data.",
        },
        { status: 400 }
      );
    }

    // Save the comparison
    const comparison = saveComparison(
      {
        baselineRunUid: body.baselineRunUid,
        currentRunUid: body.currentRunUid,
        title: body.title,
        notes: body.notes,
      },
      diffData
    );

    return NextResponse.json({
      success: true,
      comparison,
    });
  } catch (error) {
    if (isRequestValidationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Failed to save comparison:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to save comparison"),
      },
      { status: 500 }
    );
  }
}
