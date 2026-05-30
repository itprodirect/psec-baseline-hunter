export const MAX_INVENTORY_CSV_BYTES = 1 * 1024 * 1024;
export const MAX_INVENTORY_CSV_ROWS = 5000;

export interface InventoryCSVLimitOptions {
  maxBytes?: number;
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
    if (!lines[i].trim()) {
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
