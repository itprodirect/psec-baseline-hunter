/**
 * Single Comparison API
 * GET /api/comparisons/[comparisonId] - Get a comparison by ID
 * DELETE /api/comparisons/[comparisonId] - Delete a comparison
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getComparisonById,
  deleteComparison,
} from "@/lib/services/comparisons-registry";
import { ComparisonResponse } from "@/lib/types";

interface RouteParams {
  params: Promise<{ comparisonId: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ComparisonResponse>> {
  try {
    const { comparisonId } = await params;
    const comparison = getComparisonById(comparisonId);

    if (!comparison) {
      return NextResponse.json(
        { success: false, error: "Comparison not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      comparison,
    });
  } catch (error) {
    console.error("Failed to get comparison:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to get comparison",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ComparisonResponse>> {
  try {
    const { comparisonId } = await params;
    const deleted = deleteComparison(comparisonId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Comparison not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Failed to delete comparison:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete comparison",
      },
      { status: 500 }
    );
  }
}
