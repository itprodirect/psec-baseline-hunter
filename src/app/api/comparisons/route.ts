/** List and persist only evidence-supported Diff comparisons. */

import { NextRequest, NextResponse } from "next/server";
import {
  isComparisonDataNotFoundError,
  isUnsupportedComparisonPersistenceError,
  listComparisons,
  saveComparison,
} from "@/lib/services/comparisons-registry";
import {
  AMBIGUOUS_RUN_COMPARISON_ERROR,
  isDiffComparisonError,
} from "@/lib/services/diff-engine";
import type { ComparisonResponse } from "@/lib/types";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import {
  isRequestValidationError,
  readJsonObject,
  validateSaveComparisonBody,
} from "@/lib/services/request-validation";

const INSUFFICIENT_COMPARISON_RESPONSE = {
  success: false,
  code: "comparison_insufficient_evidence",
  error: "Complete, compatible evidence is required before a comparison can be saved.",
} as const;

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

export async function GET(
  request: NextRequest
): Promise<NextResponse<ComparisonResponse>> {
  try {
    const network = new URL(request.url).searchParams.get("network") || undefined;
    return NextResponse.json({ success: true, comparisons: listComparisons(network) });
  } catch (error) {
    console.error("Failed to list comparisons:", error);
    return NextResponse.json(
      { success: false, error: getSafeErrorMessage(error, "Failed to list comparisons") },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = validateSaveComparisonBody(await readJsonObject(request));
    const comparison = saveComparison(body);
    return NextResponse.json({ success: true, comparison });
  } catch (error) {
    if (isRequestValidationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (isComparisonDataNotFoundError(error)) {
      return NextResponse.json(
        { success: false, error: "Comparison data was not found." },
        { status: 404 }
      );
    }
    if (isUnsupportedComparisonPersistenceError(error)) {
      return NextResponse.json(INSUFFICIENT_COMPARISON_RESPONSE, { status: 422 });
    }
    if (isDiffComparisonError(error)) {
      if (error.code === "ambiguous-comparison") {
        return NextResponse.json(
          { success: false, code: "comparison_ambiguous", error: AMBIGUOUS_RUN_COMPARISON_ERROR },
          { status: 400 }
        );
      }
      const response = comparisonErrorResponse(error);
      return NextResponse.json({ success: false, ...response }, { status: 422 });
    }

    console.error("Failed to save comparison:", error);
    return NextResponse.json(
      { success: false, error: getSafeErrorMessage(error, "Failed to save comparison") },
      { status: 500 }
    );
  }
}
