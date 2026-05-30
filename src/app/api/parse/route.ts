/**
 * Parse API Route
 * Parses Nmap XML files and returns port findings
 */

import { NextRequest, NextResponse } from "next/server";
import { parsePorts, topPorts } from "@/lib/services/nmap-parser";
import { getDataDir } from "@/lib/services/ingest";
import { resolvePathWithin } from "@/lib/services/path-safety";
import { ParseResponse } from "@/lib/types";
import * as fs from "fs";
import * as path from "path";
import { getSafeErrorMessage } from "@/lib/services/api-response-safety";
import {
  isRequestValidationError,
  readJsonObject,
  validateParseBody,
} from "@/lib/services/request-validation";

interface ParseRequestBody {
  xmlPath: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ParseResponse>> {
  try {
    const body: ParseRequestBody = validateParseBody(await readJsonObject(request));
    const { xmlPath } = body;

    // Verify it's an XML file
    if (!xmlPath.toLowerCase().endsWith(".xml")) {
      return NextResponse.json(
        { success: false, error: "File must be an XML file" },
        { status: 400 }
      );
    }

    const extractedDir = path.join(getDataDir(), "extracted");
    const safeXmlPath = resolvePathWithin(extractedDir, xmlPath);
    if (!safeXmlPath) {
      return NextResponse.json(
        { success: false, error: "xmlPath must reference a file in data/extracted" },
        { status: 400 }
      );
    }

    // Verify the file exists
    if (!fs.existsSync(safeXmlPath)) {
      return NextResponse.json(
        { success: false, error: "XML file not found" },
        { status: 404 }
      );
    }

    // Parse the XML
    const ports = parsePorts(safeXmlPath);
    const topPortsList = topPorts(ports);

    return NextResponse.json({
      success: true,
      ports,
      topPorts: topPortsList,
    });
  } catch (error) {
    if (isRequestValidationError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    console.error("Parse error:", error);
    return NextResponse.json(
      { success: false, error: getSafeErrorMessage(error, "Parse failed") },
      { status: 500 }
    );
  }
}
