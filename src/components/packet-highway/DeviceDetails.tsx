"use client";

/**
 * Details panel for the device selected in the scene.
 * Technical identifiers (full MAC/IP) stay masked unless the user opts in.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { NormalizedCapture } from "@/lib/types/packet-highway";
import { SERVICE_CATEGORIES } from "@/lib/constants/traffic-services";
import {
  buildNodeLabeler,
  formatTrafficBytes,
  getDeviceDisplayName,
  maskIp,
  maskMac,
} from "@/lib/utils/traffic-format";

interface DeviceDetailsProps {
  capture: NormalizedCapture;
  deviceId: string;
  revealSensitive: boolean;
  onClose: () => void;
}

export function DeviceDetails({ capture, deviceId, revealSensitive, onClose }: DeviceDetailsProps) {
  const device = capture.devices.find((d) => d.id === deviceId);
  if (!device) return null;

  const labelOf = buildNodeLabeler(capture, revealSensitive);
  const deviceFlows = capture.flows
    .filter((f) => f.fromId === device.id || f.toId === device.id)
    .slice(0, 8);

  const facts: { label: string; value: string }[] = [
    {
      label: "Hardware address",
      value: revealSensitive ? (device.mac ?? "—") : maskMac(device.mac),
    },
    {
      label: device.ips.length === 1 ? "IP address" : "IP addresses",
      value:
        device.ips.length === 0
          ? "—"
          : device.ips.map((ip) => (revealSensitive ? ip : maskIp(ip))).join(", "),
    },
    ...(device.vendor ? [{ label: "Vendor", value: device.vendor }] : []),
    {
      label: "Sent / received",
      value: `${formatTrafficBytes(device.bytesSent)} / ${formatTrafficBytes(device.bytesReceived)}`,
    },
    { label: "Internet endpoints contacted", value: String(device.externalPeerCount) },
    { label: "Address lookups", value: String(device.dnsQueryCount) },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">🏢 {getDeviceDisplayName(device)}</CardTitle>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {device.role === "gateway" && <Badge variant="secondary">Gateway</Badge>}
            {device.isKnown ? (
              <Badge variant="outline" className="border-green-500/40 text-green-600 dark:text-green-400">
                On your device list
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                Not in your device list
              </Badge>
            )}
            {device.categories.map((category) => (
              <Badge key={category} variant="outline" className="gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: SERVICE_CATEGORIES[category].color }}
                  aria-hidden
                />
                {SERVICE_CATEGORIES[category].label}
              </Badge>
            ))}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close device details">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.label} className="flex justify-between gap-3 sm:block">
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd className="font-medium tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>

        {device.notes && (
          <p className="rounded-md bg-muted/60 p-2.5 text-sm text-muted-foreground">
            📒 {device.notes}
          </p>
        )}

        {deviceFlows.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Busiest conversations
            </div>
            <ul className="space-y-1.5">
              {deviceFlows.map((flow) => {
                const peerId = flow.fromId === device.id ? flow.toId : flow.fromId;
                return (
                  <li key={flow.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: SERVICE_CATEGORIES[flow.category].color }}
                        aria-hidden
                      />
                      <span className="truncate">
                        {flow.fromId === device.id ? "→" : "←"} {labelOf(peerId)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {formatTrafficBytes(flow.bytes)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
