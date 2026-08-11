import { NextRequest, NextResponse } from "next/server";
import {
  generateRuleBasedExecutiveSummary,
} from "@/lib/llm/prompt-executive";
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
  error: "Complete observation evidence is required before an executive summary can be generated.",
} as const;

/** Generate a leadership summary only from a server-rebuilt, supported Scorecard. */
export async function POST(request: NextRequest) {
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

    // Leadership prose is rendered from fixed evidence-aware templates. A
    // free-form provider cannot be allowed to invent breach, reachability, or
    // financial conclusions that this scan vantage does not support.
    return NextResponse.json({
      success: true,
      summary: generateRuleBasedExecutiveSummary(scorecardData, userProfile),
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

    console.error("Executive summary API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to generate executive summary"),
      },
      { status: 500 }
    );
  }
}
