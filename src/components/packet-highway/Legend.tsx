"use client";

/**
 * Compact legend for Packet Highway V1 visual cues.
 * Device shape, service color, and attention marker are separate channels.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NormalizedCapture } from "@/lib/types/packet-highway";
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_ORDER,
} from "@/lib/constants/traffic-services";
import {
  getDeviceArchetypeLabel,
  inferDeviceArchetype,
  type PacketHighwayDeviceArchetype,
} from "@/lib/utils/packet-highway-device-archetypes";
import { TRAFFIC_ATTENTION_LEGEND, type TrafficAttentionLegendItem } from "@/lib/utils/traffic-attention";
import { formatTrafficBytes } from "@/lib/utils/traffic-format";
import { DeviceGlyphIcon } from "./device-glyphs";

export function Legend({ capture }: { capture: NormalizedCapture }) {
  const presentCategories = SERVICE_CATEGORY_ORDER.filter(
    (category) => (capture.summary.stats.categoryBytes[category] ?? 0) > 0
  );
  const deviceArchetypes = collectDeviceArchetypes(capture);

  if (presentCategories.length === 0 && deviceArchetypes.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Visual cues</CardTitle>
        <p className="text-xs text-muted-foreground">
          Shape shows device type, color shows observed service category, and pattern shows attention.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {deviceArchetypes.length > 0 && (
          <section aria-label="Device shape cues">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Device shapes
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {deviceArchetypes.map((archetype) => (
                <li key={archetype} className="flex items-center gap-2 text-sm">
                  <DeviceGlyphIcon archetype={archetype} className="h-7 w-7 shrink-0 text-foreground" />
                  <span>{getDeviceArchetypeLabel(archetype)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Traffic type cues">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Traffic type
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {presentCategories.map((category) => {
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
                      {info.label}{" "}
                      <span className="font-normal text-muted-foreground">
                        - {formatTrafficBytes(bytes)}
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
        </section>

        <section aria-label="Traffic attention cues">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Attention markers
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TRAFFIC_ATTENTION_LEGEND.map((item) => (
              <li key={item.state} className="flex items-start gap-2.5">
                <AttentionSample item={item} />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">{item.label}</div>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}

function collectDeviceArchetypes(capture: NormalizedCapture): PacketHighwayDeviceArchetype[] {
  const seen = new Set<PacketHighwayDeviceArchetype>();
  for (const device of capture.devices) {
    const archetype = inferDeviceArchetype(device).archetype;
    if (archetype !== "broadcast") seen.add(archetype);
  }
  return [...seen].sort((a, b) => DEVICE_ORDER.indexOf(a) - DEVICE_ORDER.indexOf(b));
}

function AttentionSample({ item }: { item: TrafficAttentionLegendItem }) {
  const common = "mt-1 inline-block h-3.5 w-7 shrink-0 border";
  if (item.sample === "emphasis") {
    return (
      <span
        className={`${common} rounded-sm border-amber-600 bg-amber-500/20`}
        aria-hidden
      />
    );
  }
  if (item.sample === "dash") {
    return (
      <span
        className={`${common} rounded-full border-dashed border-amber-600 bg-muted`}
        aria-hidden
      />
    );
  }
  if (item.sample === "dot") {
    return (
      <span
        className={`${common} rounded-full border-dotted border-muted-foreground bg-card`}
        aria-hidden
      />
    );
  }
  return <span className={`${common} rounded-full border-border bg-muted`} aria-hidden />;
}

const DEVICE_ORDER: PacketHighwayDeviceArchetype[] = [
  "gateway",
  "phone",
  "computer",
  "display",
  "speaker",
  "printer",
  "generic",
  "unknown",
  "broadcast",
];
