import { NextRequest, NextResponse } from "next/server";
import {
  MAX_OBSERVATION_BUNDLE_JSON_BYTES,
  isObservationBundleValidationError,
} from "@/lib/services/observation-bundle";
import {
  listObservations,
  registerObservationBundleJson,
} from "@/lib/services/observation-registry";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import type {
  ObservationRegistryEntry,
  ObservationRegistryRecord,
} from "@/lib/types/observation-registry";

const MAX_OBSERVATION_LIST_LIMIT = 200;
const ISO_INSTANT_WITH_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

interface ObservationsResponse {
  success: boolean;
  observation?: ObservationRegistryEntry;
  observations?: ObservationRegistryEntry[];
  isNew?: boolean;
  duplicateOf?: string;
  stats?: {
    totalObservations: number;
    returnedObservations: number;
    networks: number;
  };
  error?: string;
}

export async function GET(
  request: NextRequest
): Promise<NextResponse<ObservationsResponse>> {
  try {
    const { searchParams } = new URL(request.url);
    const network = optionalQuery(searchParams.get("network"));
    const siteId = optionalQuery(searchParams.get("siteId"));
    const order = parseOrder(searchParams.get("order"));
    const evaluatedAt = parseOptionalIso(searchParams.get("asOf"), "asOf");
    const offset = parseNonNegativeInteger(searchParams.get("offset"), "offset") ?? 0;
    const limit = parseListLimit(searchParams.get("limit"));
    const freshnessOptions = evaluatedAt ? { evaluatedAt } : {};

    const allObservations = listObservations({}, freshnessOptions);
    let observations = listObservations(
      {
        network,
        siteId,
        order,
      },
      freshnessOptions
    );

    if (offset > 0) {
      observations = observations.slice(offset);
    }
    if (limit !== undefined) {
      observations = observations.slice(0, limit);
    }

    return NextResponse.json({
      success: true,
      observations,
      stats: {
        totalObservations: allObservations.length,
        returnedObservations: observations.length,
        networks: new Set(allObservations.map((entry) => entry.networkName)).size,
      },
    });
  } catch (error) {
    if (error instanceof ObservationApiRequestError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Failed to list observations:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to list observations"),
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ObservationsResponse>> {
  try {
    const jsonText = await readObservationRequestText(request);
    const result = registerObservationBundleJson(jsonText);

    return NextResponse.json({
      success: true,
      observation: observationEntryFromRecord(result.record),
      isNew: result.isNew,
      duplicateOf: result.duplicateOf,
    });
  } catch (error) {
    if (error instanceof ObservationApiRequestError) {
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

    console.error("Failed to import observation:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to import observation"),
      },
      { status: 500 }
    );
  }
}

async function readObservationRequestText(request: NextRequest): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const byteLength = Number.parseInt(contentLength, 10);
    if (
      Number.isFinite(byteLength) &&
      byteLength > MAX_OBSERVATION_BUNDLE_JSON_BYTES
    ) {
      throw new ObservationApiRequestError("Observation bundle JSON is too large.", 413);
    }
  }

  if (!request.body) {
    return "";
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_OBSERVATION_BUNDLE_JSON_BYTES) {
      throw new ObservationApiRequestError("Observation bundle JSON is too large.", 413);
    }

    chunks.push(decoder.decode(value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join("");
}

function optionalQuery(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function parseOrder(value: string | null): "asc" | "desc" | undefined {
  if (value === null || value === "") return undefined;
  if (value === "asc" || value === "desc") return value;
  throw new ObservationApiRequestError("order must be asc or desc");
}

function parseListLimit(value: string | null): number | undefined {
  const limit = parseNonNegativeInteger(value, "limit");
  if (limit === null) return undefined;
  if (limit < 1 || limit > MAX_OBSERVATION_LIST_LIMIT) {
    throw new ObservationApiRequestError(
      `limit must be between 1 and ${MAX_OBSERVATION_LIST_LIMIT}`
    );
  }
  return limit;
}

function parseNonNegativeInteger(value: string | null, field: string): number | null {
  if (value === null || value === "") return null;
  if (!/^\d+$/.test(value)) {
    throw new ObservationApiRequestError(`${field} must be a non-negative integer`);
  }
  return Number.parseInt(value, 10);
}

function parseOptionalIso(value: string | null, field: string): string | undefined {
  const trimmed = optionalQuery(value);
  if (!trimmed) return undefined;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed) || !ISO_INSTANT_WITH_ZONE_PATTERN.test(trimmed)) {
    throw new ObservationApiRequestError(
      `${field} must be an ISO timestamp with Z or an explicit offset`
    );
  }
  return new Date(parsed).toISOString();
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

class ObservationApiRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ObservationApiRequestError";
    this.status = status;
  }
}
