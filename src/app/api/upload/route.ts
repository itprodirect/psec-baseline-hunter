/**
 * Upload API Route
 * Accepts multipart form data with a ZIP file
 */

import { NextRequest, NextResponse } from "next/server";
import { saveUpload, ensureDir, getDataDir } from "@/lib/services/ingest";
import { MAX_UPLOAD_SIZE, ZIP_MAGIC_BYTES } from "@/lib/constants/file-patterns";
import { UploadResponse } from "@/lib/types";
import * as path from "path";

export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
  try {
    // Ensure data directories exist
    ensureDir(path.join(getDataDir(), "uploads"));

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file extension
    if (!file.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json(
        { success: false, error: "Only .zip files are supported" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { success: false, error: `File exceeds maximum size of ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate ZIP magic bytes
    const isZip = ZIP_MAGIC_BYTES.every((byte, i) => buffer[i] === byte);
    if (!isZip) {
      return NextResponse.json(
        { success: false, error: "File does not appear to be a valid ZIP file" },
        { status: 400 }
      );
    }

    // Save file
    const uploadPath = await saveUpload(buffer, file.name);

    return NextResponse.json({
      success: true,
      uploadPath,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
