/**
 * Traffic Visualizer analyze API
 *
 * Accepts multipart form data:
 *  - capture: .pcap / .pcapng file, or a .json normalized analysis export
 *  - inventory: optional device list .csv
 *
 * PRIVACY: this route intentionally parses captures in memory and does not
 * write raw capture files to disk. The response contains metadata only (no
 * payload bytes), and error messages never expose internal filesystem paths.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertCaptureRequestContentLength,
  assertCaptureUploadSize,
  getCaptureUploadKind,
  isTrafficUploadError,
  parseNormalizedCaptureFixture,
  sanitizeUploadFileName,
  TrafficUploadError,
} from "@/lib/services/capture-upload-safety";
import { isCaptureParseError, parseCapture } from "@/lib/services/pcap-parser";
import { buildNormalizedCapture } from "@/lib/services/traffic-normalizer";
import { parseInventoryCSV, InventoryDevice } from "@/lib/services/inventory";
import {
  assertInventoryCSVFileSize,
  isInventoryCSVLimitError,
} from "@/lib/services/inventory-csv-safety";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import type { NormalizedCapture, TrafficAnalyzeResponse } from "@/lib/types/packet-highway";

function isClientSafeError(error: unknown): boolean {
  return (
    isTrafficUploadError(error) || isCaptureParseError(error) || isInventoryCSVLimitError(error)
  );
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<TrafficAnalyzeResponse>> {
  try {
    assertCaptureRequestContentLength(request.headers.get("content-length"));

    const formData = await request.formData();
    const captureFile = formData.get("capture");
    if (!captureFile || !(captureFile instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No capture file provided." },
        { status: 400 }
      );
    }

    const kind = getCaptureUploadKind(captureFile.name);
    assertCaptureUploadSize(captureFile.size, kind);
    const fileName = sanitizeUploadFileName(captureFile.name);

    let data: NormalizedCapture;

    if (kind === "fixture") {
      data = parseNormalizedCaptureFixture(await captureFile.text());
    } else {
      const inventoryDevices = await readInventoryFile(formData.get("inventory"));
      const bytes = new Uint8Array(await captureFile.arrayBuffer());
      const extract = parseCapture(bytes);
      data = buildNormalizedCapture(extract, { fileName, inventoryDevices });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const isClientError = isClientSafeError(error);
    if (!isClientError) {
      console.error("Traffic analyze error:", error);
    }
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Could not analyze this capture.", {
          allowClientMessage: isClientSafeError,
        }),
      },
      { status: isClientError ? 400 : 500 }
    );
  }
}

async function readInventoryFile(value: FormDataEntryValue | null): Promise<InventoryDevice[] | null> {
  if (!value) return null;
  if (!(value instanceof File)) {
    throw new TrafficUploadError("Device list must be uploaded as a file.");
  }
  if (!value.name.toLowerCase().endsWith(".csv")) {
    throw new TrafficUploadError("Device list must be a .csv file.");
  }
  assertInventoryCSVFileSize(value.size);
  const content = await value.text();
  // Parsed in memory only — reuses the existing fault-tolerant inventory
  // CSV parser (Device, MAC Address, Vendor, IP Address, Hostnames, ...).
  return parseInventoryCSV(content, "packet-highway");
}
