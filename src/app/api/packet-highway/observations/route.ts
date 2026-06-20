import { NextRequest, NextResponse } from "next/server";
import { MAX_FIXTURE_BYTES } from "@/lib/services/capture-upload-safety";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import { adaptPacketHighwayCaptureToObservationBundleV1 } from "@/lib/services/packet-highway-observation";
import { isObservationBundleValidationError } from "@/lib/services/observation-bundle";
import { registerObservationBundle } from "@/lib/services/observation-registry";
import type { PacketHighwayCollectionVantage } from "@/lib/services/packet-highway-observation";
import type { NormalizedCapture } from "@/lib/types/packet-highway";
import type {
  ObservationRegistryEntry,
  ObservationRegistryRecord,
} from "@/lib/types/observation-registry";

interface PacketHighwayObservationSaveRequest {
  capture?: NormalizedCapture;
  site?: {
    siteId?: string | null;
    networkName?: string | null;
    networkScope?: string | null;
  };
  collectionVantage?: PacketHighwayCollectionVantage;
}

interface PacketHighwayObservationSaveResponse {
  success: boolean;
  observation?: ObservationRegistryEntry;
  isNew?: boolean;
  duplicateOf?: string;
  packetHighwayHref?: string;
  error?: string;
}

const VANTAGE_VALUES = new Set<PacketHighwayCollectionVantage>([
  "this-computer",
  "gateway-router",
  "mirror-tap",
  "unknown",
]);

export async function POST(
  request: NextRequest
): Promise<NextResponse<PacketHighwayObservationSaveResponse>> {
  try {
    const body = await readJsonRequest(request);
    const site = isRecord(body.site) ? body.site : {};
    const networkName = typeof site.networkName === "string" ? site.networkName.trim() : "";

    if (!body.capture) {
      return NextResponse.json(
        { success: false, error: "A normalized Packet Highway analysis is required." },
        { status: 400 }
      );
    }
    if (!networkName) {
      return NextResponse.json(
        { success: false, error: "Choose a site or network name before saving." },
        { status: 400 }
      );
    }
    if (!body.collectionVantage || !VANTAGE_VALUES.has(body.collectionVantage)) {
      return NextResponse.json(
        { success: false, error: "Confirm the collection vantage before saving." },
        { status: 400 }
      );
    }

    const bundle = adaptPacketHighwayCaptureToObservationBundleV1({
      capture: body.capture,
      site: {
        siteId: typeof site.siteId === "string" ? site.siteId : undefined,
        networkName,
        networkScope: typeof site.networkScope === "string" ? site.networkScope : undefined,
      },
      collectionVantage: body.collectionVantage,
    });
    const result = registerObservationBundle(bundle);

    return NextResponse.json({
      success: true,
      observation: observationEntryFromRecord(result.record),
      isNew: result.isNew,
      duplicateOf: result.duplicateOf,
      packetHighwayHref: `/packet-highway?observation=${encodeURIComponent(result.record.registryId)}`,
    });
  } catch (error) {
    if (error instanceof PacketHighwayObservationRequestError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }

    if (isObservationBundleValidationError(error)) {
      const status = /too large/i.test(error.message) ? 413 : 400;
      return NextResponse.json(
        { success: false, error: error.message },
        { status }
      );
    }

    console.error("Failed to save Packet Highway observation:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to save Packet Highway observation"),
      },
      { status: 500 }
    );
  }
}

async function readJsonRequest(
  request: NextRequest
): Promise<PacketHighwayObservationSaveRequest> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const byteLength = Number.parseInt(contentLength, 10);
    if (Number.isFinite(byteLength) && byteLength > MAX_FIXTURE_BYTES) {
      throw new PacketHighwayObservationRequestError("Packet Highway analysis JSON is too large.", 413);
    }
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf-8") > MAX_FIXTURE_BYTES) {
    throw new PacketHighwayObservationRequestError("Packet Highway analysis JSON is too large.", 413);
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid shape");
    }
    return parsed as PacketHighwayObservationSaveRequest;
  } catch {
    throw new PacketHighwayObservationRequestError("Request body must be valid JSON.");
  }
}

function observationEntryFromRecord(
  record: ObservationRegistryRecord
): ObservationRegistryEntry {
  return {
    registryId: record.registryId,
    observationId: record.observationId,
    contentHash: record.contentHash,
    importedAt: record.importedAt,
    site: record.site,
    networkName: record.networkName,
    batch: record.batch,
    sources: record.sources,
    vantage: record.vantage,
    coverage: record.coverage,
    timeRange: record.timeRange,
    freshness: record.freshness,
    deviceCount: record.deviceCount,
    notes: record.notes,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class PacketHighwayObservationRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PacketHighwayObservationRequestError";
    this.status = status;
  }
}