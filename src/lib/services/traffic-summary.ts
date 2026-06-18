/**
 * Plain-English summary builder for the Traffic Visualizer.
 * Rule-based text only (no LLM in V0). Calm, non-technical wording.
 * Pure module: safe for client-side use.
 */

import type {
  CaptureMeta,
  ServiceCategory,
  TrafficAlert,
  TrafficDevice,
  TrafficFlow,
  TrafficSummary,
} from "@/lib/types/packet-highway";
import { SERVICE_CATEGORIES } from "@/lib/constants/traffic-services";
import {
  formatTrafficBytes,
  formatTrafficDuration,
  getDeviceDisplayName,
} from "@/lib/utils/traffic-format";

export interface SummaryInput {
  meta: CaptureMeta;
  devices: TrafficDevice[];
  flows: TrafficFlow[];
  externalEndpointCount: number;
  dnsQueryCount: number;
  uniqueDnsNames: number;
  alerts: TrafficAlert[];
  inventoryProvided: boolean;
}

export function buildTrafficSummary(input: SummaryInput): TrafficSummary {
  const realDevices = input.devices.filter((d) => d.role === "device");
  const knownCount = realDevices.filter((d) => d.isKnown).length;
  const unknownCount = Math.max(0, realDevices.length - knownCount);

  const categoryBytes: Partial<Record<ServiceCategory, number>> = {};
  for (const flow of input.flows) {
    categoryBytes[flow.category] = (categoryBytes[flow.category] ?? 0) + flow.bytes;
  }

  const lines: string[] = [];

  // What we watched
  lines.push(
    `This capture covers ${formatTrafficDuration(input.meta.durationMs)} of network activity — ` +
      `${input.meta.packetCount.toLocaleString()} packets (${formatTrafficBytes(input.meta.byteCount)}) ` +
      `from ${countNoun(realDevices.length, "device")} on your network.`
  );

  // Encryption picture
  const encryptedBytes = (categoryBytes.https ?? 0) + (categoryBytes.quic ?? 0) + (categoryBytes.ssh ?? 0);
  const httpBytes = categoryBytes.http ?? 0;
  const totalBytes = Object.values(categoryBytes).reduce((a, b) => a + b, 0);
  if (totalBytes > 0 && encryptedBytes / totalBytes > 0.5) {
    lines.push(
      `Most traffic (${Math.round((encryptedBytes / totalBytes) * 100)}%) was encrypted — that's the healthy norm.` +
        (httpBytes > 0 ? ` A small amount of unencrypted web traffic was also seen (see watch items).` : "")
    );
  } else if (httpBytes > 0) {
    lines.push(`A noticeable share of traffic was unencrypted web (HTTP) — worth a look in the watch items.`);
  }

  // Top categories in friendly terms
  const topCategories = (Object.entries(categoryBytes) as [ServiceCategory, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([, bytes]) => bytes > 0);
  if (topCategories.length > 0) {
    lines.push(
      `Busiest kinds of traffic: ${topCategories
        .map(([cat, bytes]) => `${SERVICE_CATEGORIES[cat].label.toLowerCase()} (${formatTrafficBytes(bytes)})`)
        .join(", ")}.`
    );
  }

  // Busiest device
  const busiest = [...input.devices]
    .filter((d) => d.role === "device")
    .sort((a, b) => b.bytesSent + b.bytesReceived - (a.bytesSent + a.bytesReceived))[0];
  if (busiest && busiest.bytesSent + busiest.bytesReceived > 0) {
    lines.push(
      `Busiest device: ${getDeviceDisplayName(busiest)} ` +
        `(${formatTrafficBytes(busiest.bytesSent + busiest.bytesReceived)} total).`
    );
  }

  // Outside world
  if (input.externalEndpointCount > 0) {
    lines.push(
      `Your devices exchanged traffic with ${countNoun(input.externalEndpointCount, "place")} on the internet` +
        (input.dnsQueryCount > 0
          ? ` and made ${input.dnsQueryCount.toLocaleString()} address lookups (${countNoun(input.uniqueDnsNames, "different name")}).`
          : ".")
    );
  } else {
    lines.push("No traffic with the internet was seen — this capture is local-only activity.");
  }

  // Inventory nudge
  if (!input.inventoryProvided) {
    lines.push(
      "Tip: upload a device list (CSV) and the visualizer will flag devices that aren't on it."
    );
  } else if (unknownCount > 0 && knownCount > 0) {
    lines.push(
      `${countNoun(knownCount, "device")} matched your uploaded device list; ` +
        `${countNoun(unknownCount, "device")} ${wasWere(unknownCount)} not in the list.`
    );
  } else if (unknownCount > 0) {
    lines.push(
      `${countNoun(unknownCount, "device")} ${wasWere(unknownCount)} not in the uploaded device list.`
    );
  } else if (knownCount > 0) {
    lines.push(`${countNoun(knownCount, "device")} matched your uploaded device list.`);
  }

  if (input.meta.truncated) {
    lines.push(
      "Only part of this capture was analyzed because it hit a limit or ended after a malformed tail; the picture above may not include everything."
    );
  }

  // Headline
  const watchCount = input.alerts.filter((a) => a.level === "watch").length;
  const reviewCount = input.alerts.filter((a) => a.level === "review").length;
  let headline: string;
  if (watchCount > 0) {
    headline = `Mostly normal activity, with ${countNoun(watchCount, "item")} worth looking at soon.`;
  } else if (reviewCount > 0) {
    headline = `Nothing alarming — ${countNoun(reviewCount, "thing")} worth reviewing when you have a minute.`;
  } else {
    headline = "This looks like routine network activity. Nothing stood out.";
  }

  return {
    headline,
    lines,
    stats: {
      deviceCount: input.devices.filter((d) => d.role === "device").length,
      knownDeviceCount: knownCount,
      externalEndpointCount: input.externalEndpointCount,
      flowCount: input.flows.length,
      dnsQueryCount: input.dnsQueryCount,
      uniqueDnsNames: input.uniqueDnsNames,
      categoryBytes,
    },
  };
}

function countNoun(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? "" : "s"}`;
}

function wasWere(count: number): "was" | "were" {
  return count === 1 ? "was" : "were";
}
