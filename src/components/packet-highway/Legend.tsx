"use client";

/**
 * "Who's Driving" legend — explains each vehicle/color in plain English.
 * Only shows categories actually present in the capture.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NormalizedCapture } from "@/lib/types/packet-highway";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_ORDER,
} from "@/lib/constants/traffic-services";
import { formatTrafficBytes } from "@/lib/utils/traffic-format";

export function Legend({ capture }: { capture: NormalizedCapture }) {
  const present = SERVICE_CATEGORY_ORDER.filter(
    (category) => (capture.summary.stats.categoryBytes[category] ?? 0) > 0
  );

  if (present.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">🚦 Who&apos;s Driving</CardTitle>
        <p className="text-xs text-muted-foreground">
          Each vehicle is a burst of traffic. Color tells you what kind.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {present.map((category) => {
            const info = SERVICE_CATEGORIES[category];
            const bytes = capture.summary.stats.categoryBytes[category] ?? 0;
            return (
              <li key={category} className="flex items-start gap-2.5">
                <span
                  className="mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-background shadow"
                  style={{ backgroundColor: info.color }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">
                    {info.emoji} {info.vehicle}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {info.label} · {formatTrafficBytes(bytes)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {info.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
