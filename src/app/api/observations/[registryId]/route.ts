import { NextRequest, NextResponse } from "next/server";
import {
  getObservationById,
  isObservationRegistryId,
} from "@/lib/services/observation-registry";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import type { ObservationRegistryRecord } from "@/lib/types/observation-registry";

const ISO_INSTANT_WITH_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

interface RouteParams {
  params: Promise<{ registryId: string }>;
}

interface ObservationResponse {
  success: boolean;
  observation?: ObservationRegistryRecord;
  error?: string;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<ObservationResponse>> {
  try {
    const { registryId } = await params;
    const { searchParams } = new URL(request.url);
    const evaluatedAt = parseOptionalIso(searchParams.get("asOf"), "asOf");

    if (!isObservationRegistryId(registryId)) {
      return NextResponse.json(
        { success: false, error: "Invalid observation id" },
        { status: 400 }
      );
    }

    const observation = getObservationById(
      registryId,
      evaluatedAt ? { evaluatedAt } : {}
    );

    if (!observation) {
      return NextResponse.json(
        { success: false, error: "Observation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      observation,
    });
  } catch (error) {
    if (error instanceof ObservationRouteRequestError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Failed to get observation:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to get observation"),
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
    throw new ObservationRouteRequestError(
      `${field} must be an ISO timestamp with Z or an explicit offset`
    );
  }
  return new Date(parsed).toISOString();
}

class ObservationRouteRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObservationRouteRequestError";
  }
}
