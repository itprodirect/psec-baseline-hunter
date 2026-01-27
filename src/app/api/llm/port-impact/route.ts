/**
 * Port Impact API Route
 * Generates real-world breach examples and financial impact for risky ports
 */

import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/lib/llm/provider";
import {
  buildPortImpactSystemPrompt,
  buildPortImpactUserPrompt,
  generateRuleBasedImpact
} from "@/lib/llm/prompt-impact";
import { PortImpactData, PortImpactResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { port, protocol, service, userProfile } = body;

    // Validate required fields
    if (!port || !protocol || !service) {
      return NextResponse.json({
        success: false,
        error: "Missing required fields: port, protocol, service"
      } as PortImpactResponse, { status: 400 });
    }

    // Build prompts
    const systemPrompt = buildPortImpactSystemPrompt();
    const userPrompt = buildPortImpactUserPrompt(port, protocol, service, userProfile);

    // Call LLM
    const llmResponse = await callLLM(systemPrompt, userPrompt);

    if (!llmResponse.success || !llmResponse.content) {
      // Fall back to rule-based
      console.log(`LLM failed for port ${port}, using rule-based fallback`);
      const ruleBasedImpact = generateRuleBasedImpact(port, protocol, service);

      return NextResponse.json({
        success: true,
        impact: ruleBasedImpact,
        provider: "rule-based",
        isRuleBased: true,
        isCached: false
      } as PortImpactResponse);
    }

    // Parse JSON response from LLM
    try {
      // Extract JSON from response (handle cases where LLM adds markdown fences)
      let jsonContent = llmResponse.content.trim();

      // Remove markdown code fences if present
      if (jsonContent.startsWith("```")) {
        jsonContent = jsonContent.replace(/```json?\n?/g, "").replace(/```\n?$/g, "");
      }

      const parsed = JSON.parse(jsonContent);

      // Construct full PortImpactData
      const impact: PortImpactData = {
        port,
        protocol,
        service,
        severity: parsed.severity || "High",
        attackScenario: parsed.attackScenario || "",
        breachExamples: parsed.breachExamples || [],
        financialImpact: parsed.financialImpact || {
          avgBreachCost: "$4.5M average",
          recoveryTime: "200-280 days"
        },
        quickFix: parsed.quickFix || "Restrict access and enable strong authentication"
      };

      return NextResponse.json({
        success: true,
        impact,
        provider: llmResponse.provider,
        isRuleBased: false,
        isCached: false
      } as PortImpactResponse);

    } catch (parseError) {
      // JSON parsing failed - fall back to rule-based
      console.error("Failed to parse LLM JSON response:", parseError);
      console.log("Raw LLM response:", llmResponse.content);

      const ruleBasedImpact = generateRuleBasedImpact(port, protocol, service);

      return NextResponse.json({
        success: true,
        impact: ruleBasedImpact,
        provider: "rule-based",
        isRuleBased: true,
        isCached: false
      } as PortImpactResponse);
    }

  } catch (error) {
    console.error("Port impact API error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate port impact"
    } as PortImpactResponse, { status: 500 });
  }
}
