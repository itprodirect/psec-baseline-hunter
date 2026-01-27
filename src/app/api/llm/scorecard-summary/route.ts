import { NextRequest, NextResponse } from "next/server";
import { callLLM, isLLMAvailable, getActiveProvider } from "@/lib/llm/provider";
import {
  buildSystemPrompt,
  buildUserPrompt,
  generateRuleBasedSummary,
  ScorecardSummaryRequest,
  ScorecardSummaryResponse,
} from "@/lib/llm/prompt-scorecard";
import { DEFAULT_USER_PROFILE } from "@/lib/types/userProfile";

/**
 * POST /api/llm/scorecard-summary
 * Generate a personalized plain-English summary of scorecard data
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ScorecardSummaryResponse>> {
  try {
    const body: ScorecardSummaryRequest = await request.json();

    // Validate request
    if (!body.scorecardData) {
      return NextResponse.json(
        { success: false, error: "scorecardData is required" },
        { status: 400 }
      );
    }

    const userProfile = body.userProfile || DEFAULT_USER_PROFILE;
    const scorecardData = body.scorecardData;

    // Check if LLM is available
    if (!isLLMAvailable()) {
      // Return rule-based summary
      const summary = generateRuleBasedSummary(scorecardData, userProfile);
      return NextResponse.json({
        success: true,
        summary,
        provider: "rule-based",
        isRuleBased: true,
      });
    }

    // Build prompts
    const systemPrompt = buildSystemPrompt(userProfile);
    const userPrompt = buildUserPrompt(scorecardData, userProfile);

    // Call LLM
    const llmResponse = await callLLM(systemPrompt, userPrompt);

    if (!llmResponse.success) {
      // Fall back to rule-based on LLM error
      console.warn("LLM call failed, using rule-based fallback:", llmResponse.error);
      const summary = generateRuleBasedSummary(scorecardData, userProfile);
      return NextResponse.json({
        success: true,
        summary,
        provider: "rule-based",
        isRuleBased: true,
        error: `LLM unavailable: ${llmResponse.error}`,
      });
    }

    const provider = getActiveProvider();

    return NextResponse.json({
      success: true,
      summary: llmResponse.content,
      provider: `${llmResponse.provider} (${provider.model})`,
      isRuleBased: false,
    });
  } catch (error) {
    console.error("Scorecard summary error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate summary",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/llm/scorecard-summary
 * Check LLM availability
 */
export async function GET(): Promise<NextResponse> {
  const available = isLLMAvailable();
  const provider = getActiveProvider();

  return NextResponse.json({
    available,
    provider: provider.provider,
    model: provider.model || null,
  });
}
