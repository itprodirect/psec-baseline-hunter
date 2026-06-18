"use client";

/**
 * Top conversations table. External IPs and DNS names are summarized or
 * masked by default; the page-level toggle reveals technical detail.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NormalizedCapture } from "@/lib/types/packet-highway";
import { SERVICE_CATEGORIES } from "@/lib/constants/traffic-services";
import {
  buildTrafficAttentionIndex,
  type TrafficAttention,
} from "@/lib/utils/traffic-attention";
import {
  buildNodeLabeler,
  formatTrafficBytes,
  summarizeDnsName,
} from "@/lib/utils/traffic-format";

const INITIAL_ROWS = 12;

export function FlowTable({
  capture,
  revealSensitive,
}: {
  capture: NormalizedCapture;
  revealSensitive: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const labelOf = buildNodeLabeler(capture, revealSensitive);
  const attentionIndex = useMemo(() => buildTrafficAttentionIndex(capture), [capture]);
  const rows = expanded ? capture.flows.slice(0, 100) : capture.flows.slice(0, INITIAL_ROWS);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">🛣️ Busiest conversations</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Busiest traffic conversations">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">From</th>
                <th scope="col" className="py-2 pr-3 font-medium">To</th>
                <th scope="col" className="py-2 pr-3 font-medium">Type</th>
                <th scope="col" className="py-2 pr-3 font-medium">Attention</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Packets</th>
                <th scope="col" className="py-2 text-right font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((flow) => {
                const attention = attentionIndex.getFlow(flow);
                return (
                  <tr key={flow.id} className="border-b last:border-0">
                    <td className="max-w-[180px] truncate py-2 pr-3">{labelOf(flow.fromId)}</td>
                    <td className="max-w-[180px] truncate py-2 pr-3">{labelOf(flow.toId)}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className="gap-1 whitespace-nowrap font-normal">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: SERVICE_CATEGORIES[flow.category].color }}
                          aria-hidden
                        />
                        {SERVICE_CATEGORIES[flow.category].label}
                        {flow.port !== null && revealSensitive ? ` :${flow.port}` : ""}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <AttentionBadge attention={attention} />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{flow.packets.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{formatTrafficBytes(flow.bytes)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {capture.flows.length > INITIAL_ROWS && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-xs"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Show fewer" : `Show more (${capture.flows.length} total)`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function AttentionBadge({ attention }: { attention: TrafficAttention }) {
  const markerClass =
    attention.state === "watch"
      ? "rounded-sm border-amber-600 bg-amber-500/20"
      : attention.state === "review"
        ? "rounded-full border-dashed border-amber-600 bg-muted"
        : attention.state === "unclassified"
          ? "rounded-full border-dotted border-muted-foreground bg-card"
          : "rounded-full border-border bg-muted";

  return (
    <Badge variant="outline" className="gap-1.5 whitespace-nowrap font-normal">
      <span className={`inline-block h-2.5 w-4 border ${markerClass}`} aria-hidden />
      {attention.label}
    </Badge>
  );
}

export function DnsPanel({
  capture,
  revealSensitive,
}: {
  capture: NormalizedCapture;
  revealSensitive: boolean;
}) {
  if (capture.dnsQueries.length === 0) return null;

  // Default view groups names to their domain so the list stays calm/private
  const grouped = new Map<string, number>();
  for (const query of capture.dnsQueries) {
    const key = revealSensitive ? query.name : summarizeDnsName(query.name);
    grouped.set(key, (grouped.get(key) ?? 0) + query.count);
  }
  const rows = [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">📖 Most looked-up names</CardTitle>
        <p className="text-xs text-muted-foreground">
          {revealSensitive
            ? "Full query names from DNS/mDNS traffic."
            : "Grouped by site — turn on technical details to see full names."}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {rows.map(([name, count]) => (
            <li key={name} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-mono text-xs sm:text-sm">{name}</span>
              <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                {count.toLocaleString()}×
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
