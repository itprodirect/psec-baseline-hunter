/**
 * Single Rule API
 * GET /api/rules/[ruleId] - Get a rule by ID
 * PUT /api/rules/[ruleId] - Update a rule
 * DELETE /api/rules/[ruleId] - Delete a rule
 */

import { NextRequest, NextResponse } from "next/server";
import { getRuleById, updateRule, deleteRule } from "@/lib/services/rules-registry";
import { RulesResponse, RuleAction, RiskLevel } from "@/lib/types";

interface RouteParams {
  params: Promise<{ ruleId: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<RulesResponse>> {
  try {
    const { ruleId } = await params;
    const rule = getRuleById(ruleId);

    if (!rule) {
      return NextResponse.json(
        { success: false, error: "Rule not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      rule,
    });
  } catch (error) {
    console.error("Failed to get rule:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get rule",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<RulesResponse>> {
  try {
    const { ruleId } = await params;
    const body = await request.json();

    // Validate action if provided
    if (body.action && !["override", "whitelist"].includes(body.action)) {
      return NextResponse.json(
        { success: false, error: "action must be 'override' or 'whitelist'" },
        { status: 400 }
      );
    }

    // Validate customRisk if action is override
    if (body.action === "override" && !body.customRisk) {
      return NextResponse.json(
        { success: false, error: "customRisk is required when action is 'override'" },
        { status: 400 }
      );
    }

    const updates: { action?: RuleAction; customRisk?: RiskLevel; reason?: string } = {};
    if (body.action) updates.action = body.action;
    if (body.customRisk) updates.customRisk = body.customRisk;
    if (body.reason) updates.reason = body.reason;

    const rule = updateRule(ruleId, updates);

    if (!rule) {
      return NextResponse.json(
        { success: false, error: "Rule not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      rule,
    });
  } catch (error) {
    console.error("Failed to update rule:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update rule",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<RulesResponse>> {
  try {
    const { ruleId } = await params;
    const deleted = deleteRule(ruleId);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Rule not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Failed to delete rule:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete rule",
      },
      { status: 500 }
    );
  }
}
