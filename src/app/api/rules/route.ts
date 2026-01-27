/**
 * Custom Risk Rules API
 * GET /api/rules - List all rules
 * POST /api/rules - Create a new rule
 */

import { NextRequest, NextResponse } from "next/server";
import { listRules, createRule } from "@/lib/services/rules-registry";
import { RulesResponse, CreateRuleRequest } from "@/lib/types";

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
        error: error instanceof Error ? error.message : "Failed to list rules",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<RulesResponse>> {
  try {
    const body: CreateRuleRequest = await request.json();

    // Validate required fields
    if (!body.port || typeof body.port !== "number") {
      return NextResponse.json(
        { success: false, error: "port is required and must be a number" },
        { status: 400 }
      );
    }

    if (!body.protocol || !["tcp", "udp"].includes(body.protocol)) {
      return NextResponse.json(
        { success: false, error: "protocol is required and must be 'tcp' or 'udp'" },
        { status: 400 }
      );
    }

    if (!body.network || typeof body.network !== "string") {
      return NextResponse.json(
        { success: false, error: "network is required" },
        { status: 400 }
      );
    }

    if (!body.action || !["override", "whitelist"].includes(body.action)) {
      return NextResponse.json(
        { success: false, error: "action is required and must be 'override' or 'whitelist'" },
        { status: 400 }
      );
    }

    if (body.action === "override" && !body.customRisk) {
      return NextResponse.json(
        { success: false, error: "customRisk is required when action is 'override'" },
        { status: 400 }
      );
    }

    if (!body.reason || typeof body.reason !== "string") {
      return NextResponse.json(
        { success: false, error: "reason is required" },
        { status: 400 }
      );
    }

    const rule = createRule(body);

    return NextResponse.json({
      success: true,
      rule,
    });
  } catch (error) {
    console.error("Failed to create rule:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create rule",
      },
      { status: 400 }
    );
  }
}
