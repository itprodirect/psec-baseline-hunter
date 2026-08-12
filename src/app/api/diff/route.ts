import { NextRequest, NextResponse } from "next/server";
import {
  AMBIGUOUS_RUN_COMPARISON_ERROR,
  computeDiff,
  isDiffComparisonError,
} from "@/lib/services/diff-engine";
import type { DiffData } from "@/lib/types";
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
  data?: DiffData;
  code?: string;
  error?: string;
}

function comparisonErrorResponse(error: { code: string }) {
  switch (error.code) {
    case "unknown-site":
    case "different-sites":
    case "different-networks":
    case "conflicting-network-scope":
      return {
        code: "comparison_incompatible_site",
        error: "The selected observations do not contain compatible site evidence.",
      };
    case "incompatible-run-type":
      return {
        code: "comparison_incompatible_scan",
        error: "The selected observations were not produced by compatible scan types.",
      };
    case "incompatible-vantage":
    case "incompatible-collector":
    case "unknown-vantage":
    case "unknown-collector":
      return {
        code: "comparison_incompatible_vantage",
        error: "The selected observations do not contain compatible collection-vantage evidence.",
      };
    case "incompatible-target-provenance":
    case "unknown-target-provenance":
      return {
        code: "comparison_incompatible_scope",
        error: "The selected observations do not contain compatible target-coverage evidence.",
      };
    case "overlapping-collection-intervals":
    case "unknown-collection-interval":
    case "invalid-chronology":
      return {
        code: "comparison_invalid_chronology",
        error: "The selected observations are not in a valid chronological order.",
      };
    default:
      return {
        code: "comparison_ambiguous",
        error: "The selected observations cannot be compared unambiguously.",
      };
  }
}

/** Compute an evidence-bounded Diff without adding synthetic safety scores. */
export async function POST(request: NextRequest): Promise<NextResponse<DiffResponse>> {
  try {
    const { baselineRunUid, currentRunUid }: DiffRequest = validateDiffBody(
      await readJsonObject(request)
    );
    const diffData = computeDiff(baselineRunUid, currentRunUid);

    if (!diffData) {
      return NextResponse.json(
        { success: false, error: "Comparison data was not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: diffData });
  } catch (error) {
    if (isRequestValidationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (isDiffComparisonError(error)) {
      // Preserve the established client contract for same-minute ambiguity;
      // all compatibility and chronology failures use privacy-safe 422 codes.
      if (error.code === "ambiguous-comparison") {
        return NextResponse.json(
          { success: false, code: "comparison_ambiguous", error: AMBIGUOUS_RUN_COMPARISON_ERROR },
          { status: 400 }
        );
      }
      const response = comparisonErrorResponse(error);
      return NextResponse.json({ success: false, ...response }, { status: 422 });
    }

    console.error("Diff error:", error);
    return NextResponse.json(
      { success: false, error: getSafeErrorMessage(error, "Failed to compute diff") },
      { status: 500 }
    );
  }
}
