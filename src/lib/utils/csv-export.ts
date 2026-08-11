/**
 * CSV Export Utilities
 * Convert data structures to CSV format with proper escaping
 */

import type {
  DiffData,
  EvidenceAssessment,
  EvidenceCoverageSnapshot,
  PortChange,
  ScorecardData,
} from "@/lib/types";

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

type ExportRow = { metric: string; value: string | number | boolean };

function coverageRows(
  label: string,
  coverage: EvidenceCoverageSnapshot
): ExportRow[] {
  return [
    { metric: `${label} status`, value: coverage.status },
    { metric: `${label} score`, value: coverage.score },
    { metric: `${label} partial`, value: coverage.partial },
    { metric: `${label} device count`, value: coverage.deviceCount },
    { metric: `${label} scope known`, value: coverage.scopeKnown },
    { metric: `${label} expected sources`, value: coverage.expectedSources.join("; ") },
    { metric: `${label} present sources`, value: coverage.presentSources.join("; ") },
    { metric: `${label} missing sources`, value: coverage.missingSources.join("; ") },
  ];
}

function evidenceRows(evidence: EvidenceAssessment): ExportRow[] {
  return [
    { metric: "Evidence Version", value: evidence.version },
    { metric: "Evidence Status", value: evidence.status },
    { metric: "Evidence reason codes", value: evidence.reasonCodes.join("; ") },
    ...(evidence.coverage.baseline
      ? coverageRows("Baseline coverage", evidence.coverage.baseline)
      : []),
    ...coverageRows("Current coverage", evidence.coverage.current),
    { metric: "Identity status", value: evidence.identity.status },
    { metric: "Identity uncertain count", value: evidence.identity.uncertainCount },
    { metric: "Vantage", value: evidence.vantage.kind },
    { metric: "External Reachability", value: evidence.vantage.externalReachability },
    { metric: "Supports device absence", value: evidence.supports.deviceAbsence },
    { metric: "Supports port closure", value: evidence.supports.portClosure },
    { metric: "Supports stable baseline", value: evidence.supports.stableBaseline },
    { metric: "Supports external reachability", value: evidence.supports.externalReachability },
    { metric: "Supports comparison persistence", value: evidence.supports.comparisonPersistence },
    { metric: "Supports LLM summary", value: evidence.supports.llmSummary },
    { metric: "Limitations", value: evidence.limitations.join(" | ") },
  ];
}

function portRows(ports: PortChange[]): string {
  return arrayToCSV(
    ports.map((port) => ({
      ip: port.ip,
      hostname: port.hostname || "N/A",
      port: port.port,
      protocol: port.protocol,
      service: port.service || "unknown",
      classification: port.risk || "N/A",
    })),
    {
      ip: "IP Address",
      hostname: "Hostname",
      port: "Port",
      protocol: "Protocol",
      service: "Service",
      classification: "Classification",
    }
  );
}

function unsupportedConclusion(evidence: EvidenceAssessment, conclusion: string): string {
  const detail = evidence.limitations.length > 0
    ? ` ${evidence.limitations.join(" ")}`
    : "";
  return `${conclusion} was not evaluated because the evidence does not support that conclusion.${detail}`;
}

/**
 * Convert a single-run scorecard to a status-preserving multi-section CSV.
 */
export function scorecardToCSV(scorecardData: ScorecardData): string {
  const evidenceCSV = arrayToCSV(
    [
      { metric: "Network", value: scorecardData.network },
      { metric: "Run UID", value: scorecardData.runUid },
      { metric: "Observation timestamp", value: scorecardData.timestamp },
      { metric: "Summary", value: scorecardData.summary },
      ...evidenceRows(scorecardData.evidence),
    ],
    { metric: "Metric", value: "Value" }
  );
  const metricsCSV = arrayToCSV(
    [
      { metric: "Observed hosts", value: scorecardData.totalHosts },
      { metric: "Observed open ports", value: scorecardData.openPorts },
      { metric: "Observed services", value: scorecardData.uniqueServices },
      { metric: "Observed services requiring review", value: scorecardData.riskPorts },
    ],
    { metric: "Metric", value: "Value" }
  );
  const reviewCSV = scorecardData.riskPortsDetail.length > 0
    ? arrayToCSV(
        scorecardData.riskPortsDetail.map((finding) => ({
          port: finding.port,
          protocol: finding.protocol,
          service: finding.service || "unknown",
          classification: finding.risk,
          observed_host_count: finding.hostsAffected,
          observed_hosts: finding.hosts.join("; "),
        })),
        {
          port: "Port",
          protocol: "Protocol",
          service: "Service",
          classification: "Classification",
          observed_host_count: "Observed Host Count",
          observed_hosts: "Observed Hosts",
        }
      )
    : "No review-list entries were produced by this scorecard.";
  const topPortsCSV = scorecardData.topPorts.length > 0
    ? arrayToCSV(
        scorecardData.topPorts.map((port) => ({
          port: port.port,
          protocol: port.protocol,
          service: port.service || "unknown",
          observed_host_count: port.hostsAffected,
        })),
        {
          port: "Port",
          protocol: "Protocol",
          service: "Service",
          observed_host_count: "Observed Host Count",
        }
      )
    : "No top-port entries were produced by this scorecard.";

  return buildMultiSectionCSV([
    { title: "# EVIDENCE AND SUMMARY", data: evidenceCSV },
    { title: "# OBSERVED METRICS", data: metricsCSV },
    { title: "# OBSERVED SERVICES REQUIRING REVIEW", data: reviewCSV },
    { title: "# TOP OBSERVED PORTS", data: topPortsCSV },
  ]);
}

/**
 * Convert a comparison to a status-preserving multi-section CSV.
 */
export function diffToCSV(diffData: DiffData): string {
  const evidenceCSV = arrayToCSV(
    [
      { metric: "Network", value: diffData.network },
      { metric: "Baseline run UID", value: diffData.baselineRunUid },
      { metric: "Current run UID", value: diffData.currentRunUid },
      { metric: "Baseline timestamp", value: diffData.baselineTimestamp },
      { metric: "Current timestamp", value: diffData.currentTimestamp },
      { metric: "Summary", value: diffData.summary },
      ...evidenceRows(diffData.evidence),
    ],
    { metric: "Metric", value: "Value" }
  );
  const addedDevicesCSV = diffData.newHosts.length > 0
    ? arrayToCSV(
        diffData.newHosts.map((host) => ({
          ip: host.ip,
          hostname: host.hostname || "N/A",
        })),
        { ip: "IP Address", hostname: "Hostname" }
      )
    : "No added-device findings were produced by this comparison.";
  const deviceAbsenceCSV = diffData.evidence.supports.deviceAbsence
    ? diffData.removedHosts.length > 0
      ? arrayToCSV(
          diffData.removedHosts.map((host) => ({
            ip: host.ip,
            hostname: host.hostname || "N/A",
          })),
          { ip: "IP Address", hostname: "Hostname" }
        )
      : "No device-absence findings were produced by this comparison."
    : unsupportedConclusion(diffData.evidence, "Device absence");
  const identityCSV = diffData.identityUncertain.length > 0
    ? arrayToCSV(
        diffData.identityUncertain.map((change) => ({
          baseline_ip: change.baselineIp || "N/A",
          current_ip: change.currentIp || "N/A",
          baseline_hostname: change.baselineHostname || "N/A",
          current_hostname: change.currentHostname || "N/A",
          confidence: change.confidence,
          summary: change.summary,
        })),
        {
          baseline_ip: "Baseline IP",
          current_ip: "Current IP",
          baseline_hostname: "Baseline Hostname",
          current_hostname: "Current Hostname",
          confidence: "Confidence",
          summary: "Summary",
        }
      )
    : "No identity-uncertainty entries were produced by this comparison.";
  const additionsCSV = diffData.portsOpened.length > 0
    ? portRows(diffData.portsOpened)
    : "No service-addition findings were produced by this comparison.";
  const closuresCSV = diffData.evidence.supports.portClosure
    ? diffData.portsClosed.length > 0
      ? portRows(diffData.portsClosed)
      : "No service-closure findings were produced by this comparison."
    : unsupportedConclusion(diffData.evidence, "Service closure");
  const reviewCSV = diffData.riskFindings.length > 0
    ? portRows(diffData.riskFindings)
    : "No review-list entries were produced by this comparison.";

  return buildMultiSectionCSV([
    { title: "# EVIDENCE AND SUMMARY", data: evidenceCSV },
    { title: "# ADDED-DEVICE FINDINGS", data: addedDevicesCSV },
    { title: "# DEVICE-ABSENCE FINDINGS", data: deviceAbsenceCSV },
    { title: "# IDENTITY UNCERTAINTY", data: identityCSV },
    { title: "# SERVICE-ADDITION FINDINGS", data: additionsCSV },
    { title: "# SERVICE-CLOSURE FINDINGS", data: closuresCSV },
    { title: "# OBSERVED SERVICES REQUIRING REVIEW", data: reviewCSV },
  ]);
}

/**
 * Convert observed services requiring review to a bounded CSV.
 */
export function reviewListToCSV(
  riskFindings: PortChange[],
  evidence?: EvidenceAssessment
): string {
  const reviewCSV = riskFindings.length > 0
    ? arrayToCSV(
        riskFindings.map((finding) => ({
          ip: finding.ip,
          hostname: finding.hostname || "N/A",
          port: finding.port,
          protocol: finding.protocol,
          service: finding.service || "unknown",
          classification: finding.risk || "N/A",
          action: "Review the observed service and confirm intended access",
        })),
        {
          ip: "IP Address",
          hostname: "Hostname",
          port: "Port",
          protocol: "Protocol",
          service: "Service",
          classification: "Classification",
          action: "Recommended Review",
        }
      )
    : "No review-list entries were produced by this comparison.";

  if (!evidence) return reviewCSV;

  const evidenceCSV = arrayToCSV(evidenceRows(evidence), {
    metric: "Metric",
    value: "Value",
  });
  return buildMultiSectionCSV([
    { title: "# EVIDENCE STATUS", data: evidenceCSV },
    { title: "# OBSERVED SERVICES REQUIRING REVIEW", data: reviewCSV },
  ]);
}

/**
 * Backward-compatible export name. Output semantics remain review-only.
 */
export const watchlistToCSV = reviewListToCSV;

function evidenceMarkdown(evidence: EvidenceAssessment): string {
  const coverage = [
    ...(evidence.coverage.baseline
      ? [`- Baseline coverage: ${evidence.coverage.baseline.status} (${evidence.coverage.baseline.score})`]
      : []),
    `- Current coverage: ${evidence.coverage.current.status} (${evidence.coverage.current.score})`,
  ];
  const limitations = evidence.limitations.length > 0
    ? evidence.limitations.map((limitation) => `- ${limitation}`).join("\n")
    : "- None reported by the evidence assessment.";

  return [
    `- Evidence version: ${evidence.version}`,
    `- Evidence status: ${evidence.status}`,
    ...coverage,
    `- Identity: ${evidence.identity.status} (${evidence.identity.uncertainCount} uncertain)`,
    `- Vantage: ${evidence.vantage.kind}`,
    `- Reachability: ${evidence.vantage.externalReachability}`,
    `- Supports device absence: ${evidence.supports.deviceAbsence}`,
    `- Supports port closure: ${evidence.supports.portClosure}`,
    `- Supports stable baseline: ${evidence.supports.stableBaseline}`,
    `- Supports external reachability: ${evidence.supports.externalReachability}`,
    `- Supports comparison persistence: ${evidence.supports.comparisonPersistence}`,
    `- Supports LLM summary: ${evidence.supports.llmSummary}`,
    "",
    "### Limitations",
    limitations,
  ].join("\n");
}

function markdownPortList(ports: PortChange[]): string {
  return ports.length > 0
    ? ports
        .map((port) => `- ${port.ip}:${port.port}/${port.protocol} (${port.service || "unknown"})${port.risk ? ` [${port.risk}]` : ""}`)
        .join("\n")
    : "No entries were produced by this comparison.";
}

/**
 * Build the downloadable comparison report with the evidence state preserved.
 */
export function diffToMarkdown(diffData: DiffData): string {
  const deviceAbsence = diffData.evidence.supports.deviceAbsence
    ? diffData.removedHosts.length > 0
      ? diffData.removedHosts
          .map((host) => `- ${host.ip} (${host.hostname || "unknown"})`)
          .join("\n")
      : "No device-absence findings were produced by this comparison."
    : unsupportedConclusion(diffData.evidence, "Device absence");
  const serviceClosure = diffData.evidence.supports.portClosure
    ? markdownPortList(diffData.portsClosed)
    : unsupportedConclusion(diffData.evidence, "Service closure");
  const identity = diffData.identityUncertain.length > 0
    ? diffData.identityUncertain.map((change) => `- ${change.summary}`).join("\n")
    : "No identity-uncertainty entries were produced by this comparison.";

  return [
    "# Comparison Report",
    "",
    `Network: ${diffData.network}`,
    `Baseline: ${diffData.baselineTimestamp}`,
    `Current: ${diffData.currentTimestamp}`,
    "",
    "## Evidence",
    evidenceMarkdown(diffData.evidence),
    "",
    "## Summary",
    diffData.summary,
    "",
    `## Added-device findings (${diffData.newHosts.length})`,
    diffData.newHosts.length > 0
      ? diffData.newHosts.map((host) => `- ${host.ip} (${host.hostname || "unknown"})`).join("\n")
      : "No added-device findings were produced by this comparison.",
    "",
    "## Device-absence findings",
    deviceAbsence,
    "",
    "## Identity uncertainty",
    identity,
    "",
    `## Service-addition findings (${diffData.portsOpened.length})`,
    markdownPortList(diffData.portsOpened),
    "",
    "## Service-closure findings",
    serviceClosure,
    "",
    `## Observed services requiring review (${diffData.riskFindings.length})`,
    markdownPortList(diffData.riskFindings),
  ].join("\n");
}

/**
 * Build a review-list Markdown export with the evidence state preserved.
 */
export function reviewListToMarkdown(diffData: DiffData): string {
  return [
    "# Observed Services Requiring Review",
    "",
    "## Evidence",
    evidenceMarkdown(diffData.evidence),
    "",
    `## Review list (${diffData.riskFindings.length})`,
    markdownPortList(diffData.riskFindings),
  ].join("\n");
}
