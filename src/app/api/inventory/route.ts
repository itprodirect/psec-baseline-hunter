import { NextRequest, NextResponse } from "next/server";
import {
  getNetworkInventory,
  addDeviceToInventory,
  listInventoryNetworks,
  InventoryDevice,
} from "@/lib/services/inventory";
import { sanitizeNetworkName } from "@/lib/services/path-safety";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import {
  isRequestValidationError,
  readJsonObject,
  validateInventoryAddBody,
} from "@/lib/services/request-validation";

export interface InventoryResponse {
  success: boolean;
  devices?: InventoryDevice[];
  networks?: string[];
  device?: InventoryDevice;
  error?: string;
}

/**
 * GET /api/inventory?network=xxx
 * List inventory for a network, or list all networks if no network specified
 */
export async function GET(request: NextRequest): Promise<NextResponse<InventoryResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const network = searchParams.get("network");

    if (network) {
      const safeNetwork = sanitizeNetworkName(network);
      if (!safeNetwork) {
        return NextResponse.json(
          { success: false, error: "Invalid network name" },
          { status: 400 }
        );
      }

      const devices = getNetworkInventory(safeNetwork);
      return NextResponse.json({ success: true, devices });
    } else {
      const networks = listInventoryNetworks();
      return NextResponse.json({ success: true, networks });
    }
  } catch (error) {
    console.error("Inventory load error:", error);
    return NextResponse.json(
      { success: false, error: getSafeErrorMessage(error, "Failed to load inventory") },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inventory
 * Add a device to inventory (promote unknown → known)
 */
export async function POST(request: NextRequest): Promise<NextResponse<InventoryResponse>> {
  try {
    const { network, device } = validateInventoryAddBody(await readJsonObject(request));

    const newDevice = addDeviceToInventory(network, device);
    return NextResponse.json({ success: true, device: newDevice });
  } catch (error) {
    if (isRequestValidationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Inventory add error:", error);
    return NextResponse.json(
      { success: false, error: getSafeErrorMessage(error, "Failed to add device") },
      { status: 500 }
    );
  }
}
