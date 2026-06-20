import { NextRequest, NextResponse } from "next/server";
import {
  clearDeviceResponse,
  isDeviceResponseValidationError,
  normalizeDeviceResponseTarget,
  statementFromDeviceResponse,
  upsertDeviceResponse,
} from "@/lib/services/device-responses";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import { readJsonObject } from "@/lib/services/request-validation";
import type { DeviceResponseApiResponse } from "@/lib/types/device-response";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest
): Promise<NextResponse<DeviceResponseApiResponse>> {
  try {
    const body = await readJsonObject(request);
    const target = normalizeDeviceResponseTarget(body.target);
    const record = upsertDeviceResponse(target, body.state, body.friendlyName);

    return NextResponse.json({
      success: true,
      responseId: record.responseId,
      response: statementFromDeviceResponse(record),
    });
  } catch (error) {
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
