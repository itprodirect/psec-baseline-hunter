/**
 * CSV Export Utilities
 * Convert data structures to CSV format with proper escaping
 */

/**
 * Escape CSV field (handle quotes, commas, newlines)
 */
function escapeCSVField(field: string | number | null | undefined): string {
  if (field === null || field === undefined) return "";
  const str = String(field);

  // If field contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Convert array of objects to CSV string
 */
export function arrayToCSV<T extends Record<string, unknown>>(
  data: T[],
  headers?: Record<keyof T, string>
): string {
  if (data.length === 0) return "";

  // Use provided headers or derive from first object
  const keys = Object.keys(data[0]) as Array<keyof T>;
  const headerLabels = headers
    ? keys.map((key) => headers[key] || String(key))
    : keys.map((key) => String(key));

  // Build header row
  const headerRow = headerLabels.map(escapeCSVField).join(",");

  // Build data rows
  const dataRows = data.map((row) =>
    keys.map((key) => escapeCSVField(row[key] as string | number)).join(",")
  );

  return [headerRow, ...dataRows].join("\n");
}

/**
 * Trigger browser download of CSV file
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Build CSV sections (multiple tables in one file)
 */
export function buildMultiSectionCSV(sections: {
  title: string;
  data: string;
}[]): string {
  return sections
    .map((section) => `${section.title}\n${section.data}`)
    .join("\n\n");
}

/**
 * Format date for filename (YYYY-MM-DD)
 */
export function formatDateForFilename(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
