/**
 * Custom Risk Rules API
 * GET /api/rules - List all rules
 * POST /api/rules - Create a new rule
 */

import { NextRequest, NextResponse } from "next/server";
import { listRules, createRule, findRule } from "@/lib/services/rules-registry";
import { RulesResponse } from "@/lib/types";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import {
  isRequestValidationError,
  readJsonObject,
  validateCreateRuleBody,
} from "@/lib/services/request-validation";

export async function GET(request: NextRequest): Promise<NextResponse<RulesResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const network = searchParams.get("network") || undefined;

    const rules = listRules(network);

    return NextResponse.json({
      success: true,
      rules,
    });
  } catch (error) {
    console.error("Failed to list rules:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to list rules"),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<RulesResponse>> {
  try {
    const body = validateCreateRuleBody(await readJsonObject(request));

    if (findRule(body.port, body.protocol, body.network)) {
      return NextResponse.json(
        { success: false, error: "Rule already exists for this port/protocol/network" },
        { status: 400 }
      );
    }

    const rule = createRule(body);

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

    console.error("Failed to create rule:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to create rule"),
      },
      { status: 500 }
    );
  }
}
