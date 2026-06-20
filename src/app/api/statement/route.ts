import { NextRequest, NextResponse } from "next/server";
import {
  NetworkStatementRequestError,
  buildNetworkStatement,
  renderNetworkStatementMarkdown,
} from "@/lib/services/network-statement";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";

export const dynamic = "force-dynamic";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT_WITH_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const SITE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,160}$/;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = parseSiteId(searchParams.get("siteId"));
    const from = parseDateOrIso(searchParams.get("from"), "from", "start");
    const to = parseDateOrIso(searchParams.get("to"), "to", "end");
    const evaluatedAt = parseOptionalIso(searchParams.get("asOf"), "asOf");
    const format = parseFormat(searchParams.get("format"));
    const statement = buildNetworkStatement({
      siteId,
      from,
      to,
      evaluatedAt,
    });
    const markdown = renderNetworkStatementMarkdown(statement);

    if (format === "markdown") {
      return new NextResponse(markdown, {
        status: 200,
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="${statementFileName(statement.title, from, to)}"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      statement,
      markdown,
    });
  } catch (error) {
    if (error instanceof StatementApiRequestError || error instanceof NetworkStatementRequestError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Failed to generate network statement:", error);
    return NextResponse.json(
      {
        success: false,
        error: getSafeErrorMessage(error, "Failed to generate network statement"),
      },
      { status: 500 }
    );
  }
}

function parseSiteId(value: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new StatementApiRequestError("siteId is required");
  }
  if (!SITE_ID_PATTERN.test(trimmed)) {
    throw new StatementApiRequestError(
      "siteId may only contain letters, numbers, underscores, dots, colons, and hyphens"
    );
  }
  return trimmed;
}

function parseDateOrIso(
  value: string | null,
  field: string,
  boundary: "start" | "end"
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new StatementApiRequestError(`${field} is required`);
  }

  if (DATE_ONLY_PATTERN.test(trimmed)) {
    return boundary === "start"
      ? `${trimmed}T00:00:00.000Z`
      : `${trimmed}T23:59:59.999Z`;
  }

  if (!ISO_INSTANT_WITH_ZONE_PATTERN.test(trimmed)) {
    throw new StatementApiRequestError(
      `${field} must be YYYY-MM-DD or an ISO timestamp with Z or an explicit offset`
    );
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new StatementApiRequestError(`${field} must be a valid date`);
  }
  return new Date(parsed).toISOString();
}

function parseOptionalIso(value: string | null, field: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!ISO_INSTANT_WITH_ZONE_PATTERN.test(trimmed)) {
    throw new StatementApiRequestError(
      `${field} must be an ISO timestamp with Z or an explicit offset`
    );
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    throw new StatementApiRequestError(`${field} must be a valid date`);
  }
  return new Date(parsed).toISOString();
}

function parseFormat(value: string | null): "json" | "markdown" {
  if (!value) return "json";
  if (value === "json" || value === "markdown") return value;
  throw new StatementApiRequestError("format must be json or markdown");
}

function statementFileName(title: string, from: string, to: string): string {
  const prefix = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${prefix}-${from.slice(0, 10)}-to-${to.slice(0, 10)}.md`;
}

class StatementApiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StatementApiRequestError";
  }
}
