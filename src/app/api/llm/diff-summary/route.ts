import { NextRequest, NextResponse } from "next/server";
import { callLLM, isLLMAvailable, getActiveProvider } from "@/lib/llm/provider";
import {
  buildDiffSystemPrompt,
  buildDiffUserPrompt,
  generateRuleBasedDiffSummary,
  DiffSummaryRequest,
  DiffSummaryResponse,
} from "@/lib/llm/prompt-diff";
import { DEFAULT_USER_PROFILE } from "@/lib/types/userProfile";

/**
 * POST /api/llm/diff-summary
 * Generate a personalized plain-English summary of diff data
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<DiffSummaryResponse>> {
  try {
    const body: DiffSummaryRequest = await request.json();

    // Validate request
    if (!body.diffData) {
      return NextResponse.json(
        { success: false, error: "diffData is required" },
        { status: 400 }
      );
    }

    const userProfile = body.userProfile || DEFAULT_USER_PROFILE;
    const diffData = body.diffData;

    // Check if LLM is available
    if (!isLLMAvailable()) {
      // Return rule-based summary
      const summary = generateRuleBasedDiffSummary(diffData, userProfile);
      return NextResponse.json({
        success: true,
        summary,
        provider: "rule-based",
        isRuleBased: true,
      });
    }

    // Build prompts
    const systemPrompt = buildDiffSystemPrompt(userProfile);
    const userPrompt = buildDiffUserPrompt(diffData, userProfile);

    // Call LLM
    const llmResponse = await callLLM(systemPrompt, userPrompt);

    if (!llmResponse.success) {
      // Fall back to rule-based on LLM error
      console.warn("LLM call failed, using rule-based fallback:", llmResponse.error);
      const summary = generateRuleBasedDiffSummary(diffData, userProfile);
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
    console.error("Diff summary error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate summary",
      },
      { status: 500 }
    );
  }
}
