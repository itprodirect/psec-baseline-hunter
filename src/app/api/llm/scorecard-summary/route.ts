import { NextRequest, NextResponse } from "next/server";
import {
  generateRuleBasedSummary,
  type ScorecardSummaryResponse,
} from "@/lib/llm/prompt-scorecard";
import { DEFAULT_USER_PROFILE, type UserProfile } from "@/lib/types/userProfile";
import { buildScorecardData } from "@/lib/services/risk-classifier";
import {
  isRequestValidationError,
  readJsonObject,
  validateResourceId,
} from "@/lib/services/request-validation";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import {
  consumeLLMRateLimit,
  LLM_RATE_LIMIT_ERROR_RESPONSE,
} from "@/lib/services/llm-rate-limit";

const INSUFFICIENT_SCORECARD_RESPONSE = {
  success: false,
  code: "scorecard_insufficient_evidence",
  error: "Complete observation evidence is required before a Scorecard summary can be generated.",
} as const;

/** Generate a summary only from a server-rebuilt, supported Scorecard. */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ScorecardSummaryResponse>> {
  const rateLimit = consumeLLMRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(LLM_RATE_LIMIT_ERROR_RESPONSE, { status: 429 });
  }

  try {
    const body = await readJsonObject(request);
    const runUid = validateResourceId(body.runUid, "runUid");
    const userProfile = (body.userProfile as UserProfile | undefined) || DEFAULT_USER_PROFILE;
    const scorecardData = buildScorecardData(runUid);

    if (!scorecardData) {
      return NextResponse.json(
        { success: false, error: "Scorecard data was not found." },
        { status: 404 }
      );
    }

    if (
      scorecardData.evidence?.version !== "psec.evidence.v1" ||
      scorecardData.evidence.status !== "supported" ||
      scorecardData.evidence.supports.llmSummary !== true
    ) {
      return NextResponse.json(INSUFFICIENT_SCORECARD_RESPONSE, { status: 422 });
    }

    // Free-form provider prose cannot be proven to preserve every negative
    // evidence capability. Render the supported, server-rebuilt assessment
    // deterministically instead of treating generated language as a security
    // enforcement boundary.
    return NextResponse.json({
      success: true,
      summary: generateRuleBasedSummary(scorecardData, userProfile),
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

    console.error("Scorecard summary error:", error);
    return NextResponse.json(
      { success: false, error: getSafeErrorMessage(error, "Failed to generate summary") },
      { status: 500 }
    );
  }
}

/** Report provider availability without processing evidence. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    available: false,
    provider: "rule-based",
    model: null,
    reason: "Scorecard narratives use deterministic evidence-bounded rendering.",
  });
}
