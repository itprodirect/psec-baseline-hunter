/**
 * Executive Summary API Route
 * Generates business-focused security reports for leadership
 */

import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm/provider";
import {
  buildExecutiveSystemPrompt,
  buildExecutiveUserPrompt,
  generateRuleBasedExecutiveSummary
} from "@/lib/llm/prompt-executive";
import { ExecutiveSummaryResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scorecardData, userProfile } = body;

    // Validate required fields
    if (!scorecardData || !userProfile) {
      return NextResponse.json({
        success: false,
        error: "Missing required fields: scorecardData and userProfile are required"
      } as ExecutiveSummaryResponse, { status: 400 });
    }

    // Profile is required for executive summary
    if (!userProfile.profession || !userProfile.technicalLevel) {
      return NextResponse.json({
        success: false,
        error: "Complete user profile required. Please configure your profile first."
      } as ExecutiveSummaryResponse, { status: 400 });
    }

    // Build prompts
    const systemPrompt = buildExecutiveSystemPrompt(userProfile);
    const userPrompt = buildExecutiveUserPrompt(scorecardData, userProfile);

    // Call LLM
    const llmResponse = await callLLM(systemPrompt, userPrompt);

    if (!llmResponse.success || !llmResponse.content) {
      // Fall back to rule-based
      console.log("LLM failed for executive summary, using rule-based fallback");
      const ruleBasedSummary = generateRuleBasedExecutiveSummary(scorecardData, userProfile);

      return NextResponse.json({
        success: true,
        summary: ruleBasedSummary,
        provider: "rule-based",
        isRuleBased: true
      } as ExecutiveSummaryResponse);
    }

    // Return LLM-generated summary
    return NextResponse.json({
      success: true,
      summary: llmResponse.content,
      provider: llmResponse.provider,
      isRuleBased: false
    } as ExecutiveSummaryResponse);

  } catch (error) {
    console.error("Executive summary API error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate executive summary"
    } as ExecutiveSummaryResponse, { status: 500 });
  }
}
