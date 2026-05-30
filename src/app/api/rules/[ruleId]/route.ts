/**
 * Single Rule API
 * GET /api/rules/[ruleId] - Get a rule by ID
 * PUT /api/rules/[ruleId] - Update a rule
 * DELETE /api/rules/[ruleId] - Delete a rule
 */

import { NextRequest, NextResponse } from "next/server";
import { getRuleById, updateRule, deleteRule } from "@/lib/services/rules-registry";
import { RulesResponse } from "@/lib/types";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import {
  isRequestValidationError,
  readJsonObject,
  validateResourceId,
  validateRuleUpdateBody,
} from "@/lib/services/request-validation";

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
        error: getSafeErrorMessage(error, "Failed to get rule"),
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
    const safeRuleId = validateResourceId(ruleId, "ruleId");
    const updates = validateRuleUpdateBody(await readJsonObject(request));

    const rule = updateRule(safeRuleId, updates);

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
    if (isRequestValidationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Failed to update rule:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to update rule"),
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
        error: getSafeErrorMessage(error, "Failed to delete rule"),
      },
      { status: 500 }
    );
  }
}
