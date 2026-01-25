/**
 * Parse API Route
 * Parses Nmap XML files and returns port findings
 */

import { NextRequest, NextResponse } from "next/server";
import { parsePorts, topPorts } from "@/lib/services/nmap-parser";
import { ParseResponse } from "@/lib/types";
import * as fs from "fs";

interface ParseRequestBody {
  xmlPath: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ParseResponse>> {
  try {
    const body: ParseRequestBody = await request.json();
    const { xmlPath } = body;

    if (!xmlPath) {
      return NextResponse.json(
        { success: false, error: "xmlPath is required" },
        { status: 400 }
      );
    }

    // Verify the file exists
    if (!fs.existsSync(xmlPath)) {
      return NextResponse.json(
        { success: false, error: "XML file not found" },
        { status: 404 }
      );
    }

    // Verify it's an XML file
    if (!xmlPath.toLowerCase().endsWith(".xml")) {
      return NextResponse.json(
        { success: false, error: "File must be an XML file" },
        { status: 400 }
      );
    }

    // Parse the XML
    const ports = parsePorts(xmlPath);
    const topPortsList = topPorts(ports);

    return NextResponse.json({
      success: true,
      ports,
      topPorts: topPortsList,
    });
  } catch (error) {
    console.error("Parse error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Parse failed" },
      { status: 500 }
    );
  }
}
