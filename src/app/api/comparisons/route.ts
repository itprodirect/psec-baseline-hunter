/**
 * Comparisons API
 * GET /api/comparisons - List all saved comparisons
 * POST /api/comparisons - Save a new comparison
 */

import { NextRequest, NextResponse } from "next/server";
import { listComparisons, saveComparison } from "@/lib/services/comparison-registry";
import { ComparisonResponse, SaveComparisonRequest } from "@/lib/types";

export async function GET(request: NextRequest): Promise<NextResponse<ComparisonResponse>> {
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
        error: error instanceof Error ? error.message : "Failed to list comparisons",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<ComparisonResponse>> {
  try {
    const body: SaveComparisonRequest = await request.json();

    // Validate required fields
    if (!body.baselineRunUid || typeof body.baselineRunUid !== "string") {
      return NextResponse.json(
        { success: false, error: "baselineRunUid is required" },
        { status: 400 }
      );
    }

    if (!body.currentRunUid || typeof body.currentRunUid !== "string") {
      return NextResponse.json(
        { success: false, error: "currentRunUid is required" },
        { status: 400 }
      );
    }

    if (body.baselineRunUid === body.currentRunUid) {
      return NextResponse.json(
        { success: false, error: "baselineRunUid and currentRunUid must be different" },
        { status: 400 }
      );
    }

    const comparison = saveComparison(body);

    if (!comparison) {
      return NextResponse.json(
        { success: false, error: "Failed to compute diff. Check that both runs exist." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      comparison,
    });
  } catch (error) {
    console.error("Failed to save comparison:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save comparison",
      },
      { status: 500 }
    );
  }
}
