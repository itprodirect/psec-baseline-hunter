import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { DemoData, DemoResponse } from "@/lib/types";

/**
 * GET /api/demo
 * Returns preloaded demo data for demonstration purposes
 */
export async function GET(): Promise<NextResponse<DemoResponse>> {
  try {
    const demoPath = path.join(process.cwd(), "data", "demo", "demo-data.json");

    const fileContent = await fs.readFile(demoPath, "utf-8");
    const demoData: DemoData = JSON.parse(fileContent);

    return NextResponse.json({
      success: true,
      data: demoData,
    });
  } catch (error) {
    console.error("Failed to load demo data:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load demo data",
      },
      { status: 500 }
    );
  }
}
