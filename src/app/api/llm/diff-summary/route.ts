import { NextRequest, NextResponse } from "next/server";
import {
  generateRuleBasedDiffSummary,
  type DiffSummaryResponse,
} from "@/lib/llm/prompt-diff";
import { DEFAULT_USER_PROFILE, type UserProfile } from "@/lib/types/userProfile";
import {
  computeDiff,
  isDiffComparisonError,
} from "@/lib/services/diff-engine";
import {
  isRequestValidationError,
  readJsonObject,
  validateDiffBody,
} from "@/lib/services/request-validation";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import {
  consumeLLMRateLimit,
  LLM_RATE_LIMIT_ERROR_RESPONSE,
} from "@/lib/services/llm-rate-limit";

const INSUFFICIENT_COMPARISON_RESPONSE = {
  success: false,
  code: "comparison_insufficient_evidence",
  error: "Complete, compatible evidence is required before a comparison summary can be generated.",
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

/** Generate a summary only from a server-recomputed, supported comparison. */
export async function POST(
  request: NextRequest
): Promise<NextResponse<DiffSummaryResponse>> {
  const rateLimit = consumeLLMRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(LLM_RATE_LIMIT_ERROR_RESPONSE, { status: 429 });
  }

  try {
    const body = await readJsonObject(request);
    const { baselineRunUid, currentRunUid } = validateDiffBody(body);
    const userProfile = (body.userProfile as UserProfile | undefined) || DEFAULT_USER_PROFILE;
    const diffData = computeDiff(baselineRunUid, currentRunUid);

    if (!diffData) {
      return NextResponse.json(
        { success: false, error: "Comparison data was not found." },
        { status: 404 }
      );
    }

    if (
      diffData.evidence?.version !== "psec.evidence.v1" ||
      diffData.evidence.status !== "supported" ||
      diffData.evidence.supports.llmSummary !== true
    ) {
      return NextResponse.json(INSUFFICIENT_COMPARISON_RESPONSE, { status: 422 });
    }

    // Supported comparisons are summarized by a closed renderer. Free-form
    // provider text could reintroduce conclusions that the evidence envelope
    // explicitly marks unsupported.
    return NextResponse.json({
      success: true,
      summary: generateRuleBasedDiffSummary(diffData, userProfile),
      provider: "rule-based",
      isRuleBased: true,
    });
  } catch (error) {
    if (isRequestValidationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }
    if (isDiffComparisonError(error)) {
      const response = comparisonErrorResponse(error);
      return NextResponse.json({ success: false, ...response }, { status: 422 });
    }

    console.error("Diff summary error:", error);
    return NextResponse.json(
      { success: false, error: getSafeErrorMessage(error, "Failed to generate summary") },
      { status: 500 }
    );
  }
}
