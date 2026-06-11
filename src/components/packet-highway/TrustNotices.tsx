"use client";

/**
 * Compact trust/provenance notices shown next to Packet Highway results.
 */

import { AlertTriangle } from "lucide-react";

export const EXPORT_METADATA_NOTICE =
  "Saved JSON includes traffic metadata such as device identifiers, IPs, names, and DNS lookups. Treat it like sensitive network data.";

export const PARTIAL_ANALYSIS_NOTICE_TITLE = "Partial analysis";

export const PARTIAL_ANALYSIS_NOTICE_BODY =
  "This large capture hit analysis limits, so metrics and saved JSON reflect only the processed portion. The visual map may group or cap endpoint rendering.";

export function ExportMetadataNotice() {
  return (
    <p className="max-w-xl text-xs leading-snug text-muted-foreground">
      {EXPORT_METADATA_NOTICE}
    </p>
  );
}

export function PartialAnalysisNotice() {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        <p className="font-medium">{PARTIAL_ANALYSIS_NOTICE_TITLE}</p>
        <p className="text-xs leading-snug">{PARTIAL_ANALYSIS_NOTICE_BODY}</p>
      </div>
    </div>
  );
}
