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

/**
 * Convert DiffData to CSV format
 * Creates a multi-section CSV with summary, new hosts, removed hosts, opened ports, closed ports
 */
export function diffToCSV(diffData: {
  network: string;
  baselineTimestamp: string;
  currentTimestamp: string;
  newHosts: Array<{ ip: string; hostname?: string }>;
  removedHosts: Array<{ ip: string; hostname?: string }>;
  portsOpened: Array<{
    ip: string;
    port: number;
    protocol: string;
    service: string;
    changeType: string;
    risk?: string;
  }>;
  portsClosed: Array<{
    ip: string;
    port: number;
    protocol: string;
    service: string;
    changeType: string;
    risk?: string;
  }>;
  riskyExposures?: Array<{
    ip: string;
    port: number;
    protocol: string;
    service: string;
    risk?: string;
  }>;
}): string {
  // Summary
  const summaryCSV = arrayToCSV(
    [
      { metric: "Network", value: diffData.network },
      { metric: "Baseline Scan", value: new Date(diffData.baselineTimestamp).toLocaleString() },
      { metric: "Current Scan", value: new Date(diffData.currentTimestamp).toLocaleString() },
      { metric: "New Hosts", value: diffData.newHosts.length },
      { metric: "Removed Hosts", value: diffData.removedHosts.length },
      { metric: "Ports Opened", value: diffData.portsOpened.length },
      { metric: "Ports Closed", value: diffData.portsClosed.length },
      { metric: "Risky Exposures", value: diffData.riskyExposures?.length || 0 },
    ],
    { metric: "Metric", value: "Value" }
  );

  // New hosts
  const newHostsCSV = diffData.newHosts.length > 0
    ? arrayToCSV(
        diffData.newHosts.map((h) => ({
          ip: h.ip,
          hostname: h.hostname || "N/A",
        })),
        { ip: "IP Address", hostname: "Hostname" }
      )
    : "No new hosts detected";

  // Removed hosts
  const removedHostsCSV = diffData.removedHosts.length > 0
    ? arrayToCSV(
        diffData.removedHosts.map((h) => ({
          ip: h.ip,
          hostname: h.hostname || "N/A",
        })),
        { ip: "IP Address", hostname: "Hostname" }
      )
    : "No hosts removed";

  // Ports opened
  const portsOpenedCSV = diffData.portsOpened.length > 0
    ? arrayToCSV(
        diffData.portsOpened.map((p) => ({
          ip: p.ip,
          port: p.port,
          protocol: p.protocol,
          service: p.service || "unknown",
          risk: p.risk || "N/A",
        })),
        {
          ip: "IP Address",
          port: "Port",
          protocol: "Protocol",
          service: "Service",
          risk: "Risk Level",
        }
      )
    : "No new ports opened";

  // Ports closed
  const portsClosedCSV = diffData.portsClosed.length > 0
    ? arrayToCSV(
        diffData.portsClosed.map((p) => ({
          ip: p.ip,
          port: p.port,
          protocol: p.protocol,
          service: p.service || "unknown",
        })),
        {
          ip: "IP Address",
          port: "Port",
          protocol: "Protocol",
          service: "Service",
        }
      )
    : "No ports closed";

  // Risky exposures
  const riskyExposuresCSV = diffData.riskyExposures && diffData.riskyExposures.length > 0
    ? arrayToCSV(
        diffData.riskyExposures.map((p) => ({
          ip: p.ip,
          port: p.port,
          protocol: p.protocol,
          service: p.service || "unknown",
          risk: p.risk || "N/A",
        })),
        {
          ip: "IP Address",
          port: "Port",
          protocol: "Protocol",
          service: "Service",
          risk: "Risk Level",
        }
      )
    : "";

  const sections = [
    { title: "# SUMMARY", data: summaryCSV },
    { title: "# NEW HOSTS", data: newHostsCSV },
    { title: "# REMOVED HOSTS", data: removedHostsCSV },
    { title: "# PORTS OPENED", data: portsOpenedCSV },
    { title: "# PORTS CLOSED", data: portsClosedCSV },
  ];

  if (riskyExposuresCSV) {
    sections.push({ title: "# RISKY EXPOSURES (P0/P1)", data: riskyExposuresCSV });
  }

  return buildMultiSectionCSV(sections);
}

/**
 * Convert risky exposures to watchlist CSV format
 */
export function watchlistToCSV(riskyExposures: Array<{
  ip: string;
  port: number;
  protocol: string;
  service: string;
  risk?: string;
}>): string {
  if (riskyExposures.length === 0) {
    return "No risky exposures detected";
  }

  return arrayToCSV(
    riskyExposures.map((p) => ({
      ip: p.ip,
      port: p.port,
      protocol: p.protocol,
      service: p.service || "unknown",
      risk: p.risk || "N/A",
      action: "Review and remediate",
    })),
    {
      ip: "IP Address",
      port: "Port",
      protocol: "Protocol",
      service: "Service",
      risk: "Risk Level",
      action: "Recommended Action",
    }
  );
}
