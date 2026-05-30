export const MAX_INVENTORY_CSV_BYTES = 1 * 1024 * 1024;
export const MAX_INVENTORY_CSV_ROWS = 5000;
const MULTIPART_CONTENT_LENGTH_OVERHEAD_BYTES = 64 * 1024;

export interface InventoryCSVLimitOptions {
  maxBytes?: number;
  maxMultipartBytes?: number;
  maxRows?: number;
}

export class InventoryCSVLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryCSVLimitError";
  }
}

export function isInventoryCSVLimitError(error: unknown): error is InventoryCSVLimitError {
  return (
    error instanceof InventoryCSVLimitError ||
    (error instanceof Error && error.name === "InventoryCSVLimitError")
  );
}

function formatBytes(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) {
    return `${bytes / (1024 * 1024)} MiB`;
  }

  if (bytes % 1024 === 0) {
    return `${bytes / 1024} KiB`;
  }

  return `${bytes} bytes`;
}

export function assertInventoryCSVFileSize(
  size: number,
  options: InventoryCSVLimitOptions = {}
): void {
  const maxBytes = options.maxBytes ?? MAX_INVENTORY_CSV_BYTES;

  if (!Number.isFinite(size) || size < 0) {
    throw new InventoryCSVLimitError("CSV file size is invalid");
  }

  if (size > maxBytes) {
    throw new InventoryCSVLimitError(
      `CSV file is too large. Maximum size is ${formatBytes(maxBytes)}.`
    );
  }
}

export function assertInventoryCSVRequestContentLength(
  contentLength: string | null,
  options: InventoryCSVLimitOptions = {}
): void {
  if (contentLength === null) {
    return;
  }

  const trimmedContentLength = contentLength.trim();
  if (!/^\d+$/.test(trimmedContentLength)) {
    throw new InventoryCSVLimitError("CSV upload request size is invalid.");
  }

  const requestBytes = Number(trimmedContentLength);
  if (!Number.isSafeInteger(requestBytes)) {
    throw new InventoryCSVLimitError("CSV upload request size is invalid.");
  }

  const maxFileBytes = options.maxBytes ?? MAX_INVENTORY_CSV_BYTES;
  const maxMultipartBytes =
    options.maxMultipartBytes ?? maxFileBytes + MULTIPART_CONTENT_LENGTH_OVERHEAD_BYTES;

  if (requestBytes > maxMultipartBytes) {
    throw new InventoryCSVLimitError(
      `CSV upload request is too large. Maximum request size is ${formatBytes(maxMultipartBytes)}.`
    );
  }
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
export function parseInventoryCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

export function hasInventoryCSVValues(line: string): boolean {
  if (!line.trim()) {
    return false;
  }

  return parseInventoryCSVLine(line).some((value) => value.trim());
}

export function assertInventoryCSVRowLimit(
  content: string,
  options: InventoryCSVLimitOptions = {}
): void {
  const maxRows = options.maxRows ?? MAX_INVENTORY_CSV_ROWS;
  const lines = content.split(/\r?\n/);

  let headerIndex = 0;
  while (headerIndex < lines.length && !lines[headerIndex].trim()) {
    headerIndex++;
  }

  if (headerIndex >= lines.length) {
    return;
  }

  let rowCount = 0;
  for (let i = headerIndex + 1; i < lines.length; i++) {
    if (!hasInventoryCSVValues(lines[i])) {
      continue;
    }

    rowCount += 1;
    if (rowCount > maxRows) {
      throw new InventoryCSVLimitError(
        `CSV contains too many inventory rows. Maximum rows is ${maxRows}.`
      );
    }
  }
}
