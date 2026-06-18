import type { TrafficDevice } from "@/lib/types/packet-highway";

export type PacketHighwayDeviceArchetype =
  | "gateway"
  | "broadcast"
  | "phone"
  | "computer"
  | "display"
  | "speaker"
  | "printer"
  | "generic"
  | "unknown";

export type DeviceArchetypeStrength = "role" | "inventory_text" | "weak" | "unknown";

export interface DeviceArchetypeInference {
  archetype: PacketHighwayDeviceArchetype;
  strength: DeviceArchetypeStrength;
  label: string;
  evidence: string[];
  weakCandidate?: PacketHighwayDeviceArchetype;
}

const ARCHETYPE_LABELS: Record<PacketHighwayDeviceArchetype, string> = {
  gateway: "Gateway",
  broadcast: "Announcements",
  phone: "Smartphone",
  computer: "Laptop / computer",
  display: "TV / display",
  speaker: "Speaker / smart-home",
  printer: "Printer",
  generic: "Generic device",
  unknown: "Unknown device",
};

const TEXT_MATCHERS: Array<{
  archetype: PacketHighwayDeviceArchetype;
  pattern: RegExp;
  evidence: string;
}> = [
  { archetype: "printer", pattern: /\b(printer|print|scanner|ipp)\b/i, evidence: "inventory text mentions printer/scanner" },
  { archetype: "speaker", pattern: /\b(speaker|audio|voice assistant|smart speaker|assistant)\b/i, evidence: "inventory text mentions speaker/audio" },
  { archetype: "display", pattern: /\b(tv|television|display|monitor|streaming stick|streamer)\b/i, evidence: "inventory text mentions TV/display" },
  { archetype: "phone", pattern: /\b(phone|smartphone|mobile|cell)\b/i, evidence: "inventory text mentions phone/mobile" },
  { archetype: "computer", pattern: /\b(laptop|notebook|computer|desktop|workstation|pc)\b/i, evidence: "inventory text mentions computer" },
  { archetype: "gateway", pattern: /\b(router|gateway|firewall|access point|wireless ap)\b/i, evidence: "inventory text mentions network gateway" },
];

export function inferDeviceArchetype(device: TrafficDevice): DeviceArchetypeInference {
  if (device.role === "gateway") {
    return inference("gateway", "role", ["device role is gateway"]);
  }
  if (device.role === "broadcast") {
    return inference("broadcast", "role", ["device role is broadcast"]);
  }

  const text = [device.name, device.notes].filter(Boolean).join(" ");
  for (const matcher of TEXT_MATCHERS) {
    if (matcher.pattern.test(text)) {
      return inference(matcher.archetype, "inventory_text", [matcher.evidence]);
    }
  }

  const weakCandidate = inferWeakCandidate(device);
  if (!device.isKnown) {
    return inference("unknown", weakCandidate ? "weak" : "unknown", ["not matched to an uploaded device list"], weakCandidate);
  }

  return inference("generic", weakCandidate ? "weak" : "unknown", [], weakCandidate);
}

export function getDeviceArchetypeLabel(archetype: PacketHighwayDeviceArchetype): string {
  return ARCHETYPE_LABELS[archetype];
}

function inferWeakCandidate(device: TrafficDevice): PacketHighwayDeviceArchetype | undefined {
  const categories = new Set(device.categories);
  if (categories.has("mdns") || categories.has("ssdp")) return "speaker";
  if (categories.has("quic") && device.externalPeerCount > 0) return "display";
  return undefined;
}

function inference(
  archetype: PacketHighwayDeviceArchetype,
  strength: DeviceArchetypeStrength,
  evidence: string[],
  weakCandidate?: PacketHighwayDeviceArchetype
): DeviceArchetypeInference {
  return {
    archetype,
    strength,
    label: ARCHETYPE_LABELS[archetype],
    evidence,
    weakCandidate,
  };
}
