import { NextRequest, NextResponse } from "next/server";
import {
  getNetworkInventory,
  addDeviceToInventory,
  listInventoryNetworks,
  InventoryDevice,
} from "@/lib/services/inventory";

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
      const devices = getNetworkInventory(network);
      return NextResponse.json({ success: true, devices });
    } else {
      const networks = listInventoryNetworks();
      return NextResponse.json({ success: true, networks });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load inventory" },
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
    const body = await request.json();
    const { network, device } = body;

    if (!network) {
      return NextResponse.json(
        { success: false, error: "Network is required" },
        { status: 400 }
      );
    }

    if (!device || (!device.ip && !device.mac)) {
      return NextResponse.json(
        { success: false, error: "Device must have at least an IP or MAC address" },
        { status: 400 }
      );
    }

    const newDevice = addDeviceToInventory(network, device);
    return NextResponse.json({ success: true, device: newDevice });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to add device" },
      { status: 500 }
    );
  }
}
