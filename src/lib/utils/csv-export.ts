/**
 * CSV Export Utilities
 * Client-side CSV generation for diff data export
 */

import { DiffData, HostChange, PortChange } from "@/lib/types";

/**
 * Escape a value for CSV (handles commas, quotes, newlines)
 */
function escapeCSV(value: string | number | undefined | null): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert array of objects to CSV string
 */
export function toCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; header: string }[]
): string {
  const headers = columns.map((c) => escapeCSV(c.header)).join(",");
  const rows = data.map((row) =>
    columns.map((c) => escapeCSV(row[c.key] as string | number)).join(",")
  );
  return [headers, ...rows].join("\n");
}

/**
 * Generate hosts CSV from diff data
 */
export function hostsToCSV(hosts: HostChange[]): string {
  return toCSV(hosts, [
    { key: "ip", header: "IP Address" },
    { key: "hostname", header: "Hostname" },
    { key: "changeType", header: "Change Type" },
  ]);
}

/**
 * Generate ports CSV from diff data
 */
export function portsToCSV(ports: PortChange[]): string {
  return toCSV(ports, [
    { key: "ip", header: "IP Address" },
    { key: "hostname", header: "Hostname" },
    { key: "port", header: "Port" },
    { key: "protocol", header: "Protocol" },
    { key: "service", header: "Service" },
    { key: "changeType", header: "Change Type" },
    { key: "risk", header: "Risk Level" },
  ]);
}

/**
 * Generate complete diff CSV with all changes
 */
export function diffToCSV(data: DiffData): string {
  const rows: string[] = [];

  // Header
  rows.push("Category,IP Address,Hostname,Port,Protocol,Service,Change Type,Risk Level");

  // New hosts
  for (const host of data.newHosts) {
    rows.push(
      [
        escapeCSV("New Host"),
        escapeCSV(host.ip),
        escapeCSV(host.hostname),
        "",
        "",
        "",
        escapeCSV("added"),
        "",
      ].join(",")
    );
  }

  // Removed hosts
  for (const host of data.removedHosts) {
    rows.push(
      [
        escapeCSV("Removed Host"),
        escapeCSV(host.ip),
        escapeCSV(host.hostname),
        "",
        "",
        "",
        escapeCSV("removed"),
        "",
      ].join(",")
    );
  }

  // Ports opened
  for (const port of data.portsOpened) {
    rows.push(
      [
        escapeCSV("Port Opened"),
        escapeCSV(port.ip),
        escapeCSV(port.hostname),
        escapeCSV(port.port),
        escapeCSV(port.protocol),
        escapeCSV(port.service),
        escapeCSV("opened"),
        escapeCSV(port.risk),
      ].join(",")
    );
  }

  // Ports closed
  for (const port of data.portsClosed) {
    rows.push(
      [
        escapeCSV("Port Closed"),
        escapeCSV(port.ip),
        escapeCSV(port.hostname),
        escapeCSV(port.port),
        escapeCSV(port.protocol),
        escapeCSV(port.service),
        escapeCSV("closed"),
        escapeCSV(port.risk),
      ].join(",")
    );
  }

  return rows.join("\n");
}

/**
 * Generate watchlist CSV (P0 exposures only)
 */
export function watchlistToCSV(riskyExposures: PortChange[]): string {
  return toCSV(riskyExposures, [
    { key: "ip", header: "IP Address" },
    { key: "hostname", header: "Hostname" },
    { key: "port", header: "Port" },
    { key: "protocol", header: "Protocol" },
    { key: "service", header: "Service" },
    { key: "risk", header: "Risk Level" },
  ]);
}

/**
 * Trigger browser download of CSV file
 */
export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
