"use client";

/**
 * Plain-English "what happened" panel plus the watch-item list.
 * All text is rule-based and deliberately calm — see traffic-risk-rules.ts.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Info, Search } from "lucide-react";
import type { NormalizedCapture, WatchLevel } from "@/lib/types/packet-highway";

const LEVEL_META: Record<WatchLevel, { label: string; className: string }> = {
  watch: { label: "Look soon", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40" },
  review: { label: "Worth reviewing", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/40" },
  info: { label: "FYI", className: "bg-muted text-muted-foreground border-border" },
};

export function SummaryPanel({ capture }: { capture: NormalizedCapture }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📝 What happened, in plain English</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">{capture.summary.headline}</p>
          <ul className="space-y-2">
            {capture.summary.lines.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span aria-hidden className="mt-0.5 text-xs">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">👀 Watch items</CardTitle>
          <p className="text-xs text-muted-foreground">
            Deterministic checks — observations, not verdicts.
          </p>
        </CardHeader>
        <CardContent>
          {capture.alerts.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Nothing stood out in this capture.
            </div>
          ) : (
            <ul className="space-y-3">
              {capture.alerts.map((alert) => (
                <li key={alert.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {alert.level === "info" ? (
                      <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{alert.title}</span>
                    <Badge variant="outline" className={LEVEL_META[alert.level].className}>
                      {LEVEL_META[alert.level].label}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
                    {alert.detail}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
