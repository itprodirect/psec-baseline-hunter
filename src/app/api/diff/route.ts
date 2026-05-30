import { NextRequest, NextResponse } from "next/server";
import { computeDiff, computeRiskScore, getRiskScoreLabel } from "@/lib/services/diff-engine";
import { DiffData } from "@/lib/types";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import {
  isRequestValidationError,
  readJsonObject,
  validateDiffBody,
} from "@/lib/services/request-validation";

export interface DiffRequest {
  baselineRunUid: string;
  currentRunUid: string;
}

export interface DiffResponse {
  success: boolean;
  data?: DiffData & {
    riskScore: number;
    riskLabel: string;
    riskColor: string;
  };
  error?: string;
}

/**
 * POST /api/diff
 * Computes diff between two runs
 */
export async function POST(request: NextRequest): Promise<NextResponse<DiffResponse>> {
  try {
    const body: DiffRequest = validateDiffBody(await readJsonObject(request));
    const { baselineRunUid, currentRunUid } = body;

    const diffData = computeDiff(baselineRunUid, currentRunUid);

    if (!diffData) {
      return NextResponse.json(
        { success: false, error: "Could not compute diff. Check that both runs exist and have port scan data." },
        { status: 404 }
      );
    }

    const riskScore = computeRiskScore(diffData);
    const { label: riskLabel, color: riskColor } = getRiskScoreLabel(riskScore);

    return NextResponse.json({
      success: true,
      data: {
        ...diffData,
        riskScore,
        riskLabel,
        riskColor,
      },
    });
  } catch (error) {
    if (isRequestValidationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Diff error:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to compute diff"),
      },
      { status: 500 }
    );
  }
}
