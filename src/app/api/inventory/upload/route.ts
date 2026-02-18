import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import * as path from "path";
import { parseInventoryCSV, InventoryDevice, getInventoryDir } from "@/lib/services/inventory";
import { ensureDir } from "@/lib/services/ingest";
import { sanitizeNetworkName } from "@/lib/services/path-safety";

export interface InventoryUploadResponse {
  success: boolean;
  devices?: InventoryDevice[];
  count?: number;
  error?: string;
}

/**
 * POST /api/inventory/upload
 * Upload and parse an inventory CSV file
 */
export async function POST(request: NextRequest): Promise<NextResponse<InventoryUploadResponse>> {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const network = formData.get("network") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    if (!network) {
      return NextResponse.json(
        { success: false, error: "Network name is required" },
        { status: 400 }
      );
    }

    const safeNetwork = sanitizeNetworkName(network);
    if (!safeNetwork) {
      return NextResponse.json(
        { success: false, error: "Invalid network name" },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv")) {
      return NextResponse.json(
        { success: false, error: "File must be a CSV" },
        { status: 400 }
      );
    }

    // Read file content
    const bytes = await file.arrayBuffer();
    const content = new TextDecoder().decode(bytes);

    // Parse CSV
    const devices = parseInventoryCSV(content, safeNetwork);

    // Save to inventory directory
    const networkDir = ensureDir(path.join(getInventoryDir(), safeNetwork));
    const devicesPath = path.join(networkDir, "devices.json");

    // Load existing devices and merge
    let existingDevices: InventoryDevice[] = [];
    try {
      const existing = await fs.readFile(devicesPath, "utf-8");
      existingDevices = JSON.parse(existing);
    } catch {
      // No existing file
    }

    // Simple merge: add new devices by IP/MAC
    const existingIPs = new Set(existingDevices.map((d) => d.ip).filter(Boolean));
    const existingMACs = new Set(existingDevices.map((d) => d.mac.toUpperCase()).filter(Boolean));

    const newDevices = devices.filter((d) => {
      const ipExists = d.ip && existingIPs.has(d.ip);
      const macExists = d.mac && existingMACs.has(d.mac.toUpperCase());
      return !ipExists && !macExists;
    });

    const merged = [...existingDevices, ...newDevices];
    await fs.writeFile(devicesPath, JSON.stringify(merged, null, 2));

    // Also save original CSV
    const csvPath = path.join(networkDir, `inventory_${Date.now()}.csv`);
    await fs.writeFile(csvPath, content);

    return NextResponse.json({
      success: true,
      devices: merged,
      count: newDevices.length,
    });
  } catch (error) {
    console.error("Inventory upload error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to process CSV" },
      { status: 500 }
    );
  }
}
