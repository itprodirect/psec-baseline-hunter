import { NextRequest, NextResponse } from "next/server";
import {
  clearDeviceResponse,
  isDeviceResponseValidationError,
  normalizeDeviceResponseTarget,
  statementFromDeviceResponse,
  upsertDeviceResponse,
} from "@/lib/services/device-responses";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import { buildNetworkActivity } from "@/lib/services/network-activity";
import { readJsonObject } from "@/lib/services/request-validation";
import type { DeviceResponseApiResponse } from "@/lib/types/device-response";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest
): Promise<NextResponse<DeviceResponseApiResponse>> {
  try {
    const body = await readJsonObject(request);
    const target = normalizeDeviceResponseTarget(body.target);
    const eventId = normalizeEventId(body.eventId);
    const activity = buildNetworkActivity();
    const authoritativeEvent =
      activity.status === "ready" && activity.evidence?.status === "supported"
        ? activity.events.find((event) => event.eventId === eventId)
        : undefined;
    const authoritativeTarget = authoritativeEvent?.deviceResponse.target ?? null;
    if (!authoritativeTarget || !sameTarget(authoritativeTarget, target)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "The device response target is not attached to a currently supported comparison event.",
        },
        { status: 422 }
      );
    }
    const record = upsertDeviceResponse(
      authoritativeTarget,
      body.state,
      body.friendlyName
    );

    return NextResponse.json({
      success: true,
      responseId: record.responseId,
      response: statementFromDeviceResponse(record),
    });
  } catch (error) {
    if (error instanceof DeviceResponseEventValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 422 }
      );
    }
    if (isDeviceResponseValidationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Failed to save device response:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to save device response"),
      },
      { status: 500 }
    );
  }
}

function normalizeEventId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^chg-[A-Za-z0-9_-]{1,160}$/.test(value.trim())
  ) {
    throw new DeviceResponseEventValidationError(
      "eventId must identify a current comparison event"
    );
  }
  return value.trim();
}

function sameTarget(
  authoritative: ReturnType<typeof normalizeDeviceResponseTarget>,
  submitted: ReturnType<typeof normalizeDeviceResponseTarget>
): boolean {
  return (
    authoritative.responseId === submitted.responseId &&
    authoritative.siteId === submitted.siteId &&
    authoritative.observationId === submitted.observationId &&
    authoritative.deviceIdHash === submitted.deviceIdHash &&
    authoritative.identity.kind === submitted.identity.kind &&
    authoritative.identity.hash === submitted.identity.hash &&
    authoritative.confidence === submitted.confidence
  );
}

class DeviceResponseEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceResponseEventValidationError";
  }
}

export async function DELETE(
  request: NextRequest
): Promise<NextResponse<DeviceResponseApiResponse>> {
  try {
    const body = await readJsonObject(request);
    const target = normalizeDeviceResponseTarget(body.target);
    const cleared = clearDeviceResponse(target);

    return NextResponse.json({
      success: true,
      responseId: target.responseId,
      response: null,
      cleared,
    });
  } catch (error) {
    if (isDeviceResponseValidationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Failed to clear device response:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to clear device response"),
      },
      { status: 500 }
    );
  }
}
