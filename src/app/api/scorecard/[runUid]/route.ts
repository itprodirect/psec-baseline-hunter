import { NextRequest, NextResponse } from "next/server";
import { buildScorecardData, getScorecardActions } from "@/lib/services/risk-classifier";
import { ScorecardData } from "@/lib/types";

export interface ScorecardResponse {
  success: boolean;
  data?: ScorecardData & { actions: string[] };
  error?: string;
}

/**
 * GET /api/scorecard/[runUid]
 * Returns scorecard data for a specific run
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runUid: string }> }
): Promise<NextResponse<ScorecardResponse>> {
  try {
    const { runUid } = await params;

    if (!runUid) {
      return NextResponse.json(
        { success: false, error: "runUid is required" },
        { status: 400 }
      );
    }

    const scorecardData = buildScorecardData(runUid);

    if (!scorecardData) {
      return NextResponse.json(
        { success: false, error: "Run not found or no ports data available" },
        { status: 404 }
      );
    }

    const actions = getScorecardActions(scorecardData);

    return NextResponse.json({
      success: true,
      data: {
        ...scorecardData,
        actions,
      },
    });
  } catch (error) {
    console.error("Scorecard error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to build scorecard",
      },
      { status: 500 }
    );
  }
}
