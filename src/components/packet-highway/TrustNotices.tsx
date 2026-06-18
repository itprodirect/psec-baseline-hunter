"use client";

/**
 * Compact trust/provenance notices shown next to Packet Highway results.
 */

import { AlertTriangle } from "lucide-react";
import type { NormalizedCapture } from "@/lib/types/packet-highway";

export const EXPORT_METADATA_NOTICE =
  "Saved JSON includes traffic metadata such as device identifiers, IPs, names, and DNS lookups. Treat it like sensitive network data.";

export const PARTIAL_ANALYSIS_NOTICE_TITLE = "Partial analysis";

export const PARTIAL_ANALYSIS_NOTICE_BODY =
  "Only part of this capture was analyzed because it hit an analysis limit or ended after a malformed or truncated tail. Metrics and saved JSON reflect the processed portion. The visual map may group or cap endpoint rendering.";

export function ExportMetadataNotice() {
  return (
    <p className="max-w-xl text-xs leading-snug text-muted-foreground">
      {EXPORT_METADATA_NOTICE}
    </p>
  );
}

export function AnalysisSourceNotice({
  capture,
  isDemo,
}: {
  capture: NormalizedCapture;
  isDemo: boolean;
}) {
  if (isDemo) {
    return (
      <SourceNotice
        title="Sample data"
        body="This is a fully synthetic sample using TEST-NET addresses, locally administered MACs, and example.* names. It selects the not-in-list device so the HTTP watch item is easy to review."
      />
    );
  }

  if (capture.meta.format === "fixture") {
    return (
      <SourceNotice
        title="Saved analysis JSON"
        body="Loaded from a saved analysis JSON file, not raw-capture evidence. The file was checked for expected shape, but any CSV inventory is not reapplied here."
      />
    );
  }

  return (
    <SourceNotice
      title="Raw capture analysis"
      body={`Parsed metadata from ${capture.meta.fileName} for this view. This app does not intentionally save the raw capture file; saved JSON exports still contain sensitive traffic metadata.`}
    />
  );
}

function SourceNotice({ title, body }: { title: string; body: string }) {
  return (
    <div
      role="status"
      className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
    >
      <span className="font-medium text-foreground">{title}:</span> {body}
    </div>
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
