import { NextRequest, NextResponse } from "next/server";
import {
  buildNetworkActivity,
  buildSyntheticNetworkActivityScenario,
} from "@/lib/services/network-activity";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import type { NetworkActivityResponse } from "@/lib/types/network-activity";

export const dynamic = "force-dynamic";

const ISO_INSTANT_WITH_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export async function GET(
  request: NextRequest
): Promise<NextResponse<NetworkActivityResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const scenario = searchParams.get("scenario");
    const evaluatedAt = parseOptionalIso(searchParams.get("asOf"), "asOf");

    if (scenario && scenario !== "guided") {
      return NextResponse.json(
        { success: false, error: "scenario must be guided" },
        { status: 400 }
      );
    }

    const activity =
      scenario === "guided"
        ? buildSyntheticNetworkActivityScenario(evaluatedAt ? { evaluatedAt } : {})
        : buildNetworkActivity(evaluatedAt ? { evaluatedAt } : {});

    return NextResponse.json({
      success: true,
      activity,
    });
  } catch (error) {
    if (error instanceof ActivityApiRequestError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Failed to load network activity:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to load network activity"),
      },
      { status: 500 }
    );
  }
}

function parseOptionalIso(value: string | null, field: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed) || !ISO_INSTANT_WITH_ZONE_PATTERN.test(trimmed)) {
    throw new ActivityApiRequestError(
      `${field} must be an ISO timestamp with Z or an explicit offset`
    );
  }
  return new Date(parsed).toISOString();
}

class ActivityApiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityApiRequestError";
  }
}
