import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";

export const MAX_ZIP_ENTRY_COUNT = 2000;
export const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;

interface ZipExtractionLimits {
  maxEntryCount?: number;
  maxTotalUncompressedBytes?: number;
}

function isPathWithin(baseDir: string, candidatePath: string): boolean {
  const resolvedBase = path.resolve(baseDir);
  const resolvedCandidate = path.resolve(candidatePath);

  return (
    resolvedCandidate === resolvedBase ||
    resolvedCandidate.startsWith(`${resolvedBase}${path.sep}`)
  );
}

function assertSafeZipEntryName(entryName: string, extractionDir: string): void {
  if (!entryName || entryName.includes("\0")) {
    throw new Error("Unsafe ZIP entry rejected: empty or invalid entry name");
  }

  if (entryName.includes("\\")) {
    throw new Error(`Unsafe ZIP entry rejected: ${entryName}`);
  }

  if (
    path.posix.isAbsolute(entryName) ||
    path.win32.isAbsolute(entryName) ||
    /^[A-Za-z]:/.test(entryName)
  ) {
    throw new Error(`Unsafe ZIP entry rejected: ${entryName}`);
  }

  const segments = entryName.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some(segment => segment === "." || segment === "..")) {
    throw new Error(`Unsafe ZIP entry rejected: ${entryName}`);
  }

  const resolvedTarget = path.resolve(extractionDir, ...segments);
  if (!isPathWithin(extractionDir, resolvedTarget)) {
    throw new Error(`Unsafe ZIP entry rejected: ${entryName}`);
  }
}

function getUncompressedSize(entry: AdmZip.IZipEntry): number {
  const size = entry.header.size;

  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error(`Unsafe ZIP entry rejected: invalid size for ${entry.entryName}`);
  }

  return size;
}

export function inspectZipBeforeExtraction(
  zip: AdmZip,
  extractionDir: string,
  limits: ZipExtractionLimits = {}
): void {
  const maxEntryCount = limits.maxEntryCount ?? MAX_ZIP_ENTRY_COUNT;
  const maxTotalUncompressedBytes =
    limits.maxTotalUncompressedBytes ?? MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES;
  const entries = zip.getEntries();

  if (entries.length > maxEntryCount) {
    throw new Error(`ZIP archive has too many entries: ${entries.length} > ${maxEntryCount}`);
  }

  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    assertSafeZipEntryName(entry.entryName, extractionDir);

    totalUncompressedBytes += getUncompressedSize(entry);
    if (totalUncompressedBytes > maxTotalUncompressedBytes) {
      throw new Error(
        `ZIP archive uncompressed size exceeds limit: ${totalUncompressedBytes} > ${maxTotalUncompressedBytes}`
      );
    }
  }
}

export function extractZipSafely(
  zipPath: string,
  extractionDir: string,
  limits: ZipExtractionLimits = {}
): void {
  const zip = new AdmZip(zipPath);
  inspectZipBeforeExtraction(zip, extractionDir, limits);

  fs.mkdirSync(extractionDir, { recursive: true });
  zip.extractAllTo(extractionDir, true);
}
