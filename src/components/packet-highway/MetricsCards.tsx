"use client";

/**
 * Headline metric cards for an analyzed capture.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Boxes, Eye, Globe, MonitorSmartphone, Package, Waypoints } from "lucide-react";
import type { NormalizedCapture } from "@/lib/types/packet-highway";
import { formatTrafficBytes } from "@/lib/utils/traffic-format";

export function MetricsCards({ capture }: { capture: NormalizedCapture }) {
  const watchItems = capture.alerts.filter((a) => a.level !== "info").length;
  const deviceCount = capture.summary.stats.deviceCount;
  const knownDeviceCount = capture.summary.stats.knownDeviceCount;
  const unknownDeviceCount = Math.max(0, deviceCount - knownDeviceCount);

  const metrics = [
    {
      label: "Packets",
      value: capture.meta.packetCount.toLocaleString(),
      sub: formatTrafficBytes(capture.meta.byteCount),
      icon: Package,
    },
    {
      label: "Devices",
      value: String(deviceCount),
      sub:
        knownDeviceCount > 0
          ? unknownDeviceCount > 0
            ? `${knownDeviceCount} recognized, ${unknownDeviceCount} not in list`
            : `${knownDeviceCount} recognized`
          : "on your network",
      icon: MonitorSmartphone,
    },
    {
      label: "Conversations",
      value: String(capture.summary.stats.flowCount),
      sub: "traffic flows",
      icon: Waypoints,
    },
    {
      label: "Internet endpoints",
      value: String(capture.summary.stats.externalEndpointCount),
      sub: "places online",
      icon: Globe,
    },
    {
      label: "Address lookups",
      value: capture.summary.stats.dnsQueryCount.toLocaleString(),
      sub: `${capture.summary.stats.uniqueDnsNames} different names`,
      icon: Boxes,
    },
    {
      label: "Watch items",
      value: String(watchItems),
      sub: watchItems === 0 ? "nothing flagged" : "worth reviewing",
      icon: Eye,
      highlight: watchItems > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {metrics.map((metric) => (
        <Card key={metric.label} className={metric.highlight ? "border-amber-500/60" : undefined}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <metric.icon className="h-3.5 w-3.5" />
              {metric.label}
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{metric.value}</div>
            <div className="text-xs text-muted-foreground">{metric.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
