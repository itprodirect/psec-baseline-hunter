/**
 * Service classification for the Traffic Visualizer.
 *
 * Pure constants + functions only — this module is imported by client
 * components (legend, demo mode), so it must never pull in fs-backed
 * modules like rules-registry.
 */

import type { ServiceCategory, TrafficProtocol } from "@/lib/types/packet-highway";

export interface ServiceCategoryInfo {
  label: string;
  /** Vehicle metaphor shown in the "Who's Driving" legend */
  vehicle: string;
  emoji: string;
  /** Hex color used for vehicles and chips (readable on light + dark) */
  color: string;
  description: string;
}

export const SERVICE_CATEGORIES: Record<ServiceCategory, ServiceCategoryInfo> = {
  https: {
    label: "Secure web (HTTPS)",
    vehicle: "Sedan",
    emoji: "🚗",
    color: "#10b981",
    description: "Everyday encrypted browsing and apps. The windows are tinted — outsiders can't read what's inside.",
  },
  quic: {
    label: "Modern web (QUIC)",
    vehicle: "Electric car",
    emoji: "🏎️",
    color: "#14b8a6",
    description: "A newer kind of encrypted web traffic, often video streaming (YouTube, Netflix).",
  },
  http: {
    label: "Unencrypted web (HTTP)",
    vehicle: "Convertible, top down",
    emoji: "🚙",
    color: "#f97316",
    description: "Old-style web traffic with no encryption. Anyone along the road can see what's inside.",
  },
  dns: {
    label: "Address lookups (DNS)",
    vehicle: "Courier bike",
    emoji: "🚲",
    color: "#3b82f6",
    description: "Quick trips to ask 'what's the address for this website?' Normal and very common.",
  },
  mdns: {
    label: "Local discovery (mDNS)",
    vehicle: "Neighborhood flyer van",
    emoji: "📢",
    color: "#8b5cf6",
    description: "Devices announcing themselves to the local network ('I'm a printer!'). Stays inside the house.",
  },
  llmnr: {
    label: "Name calls (LLMNR)",
    vehicle: "Megaphone cart",
    emoji: "🛺",
    color: "#a855f7",
    description: "An older Windows way of shouting names on the local network. Usually safe to turn off.",
  },
  ssdp: {
    label: "Smart-home discovery (SSDP)",
    vehicle: "Delivery van",
    emoji: "🚐",
    color: "#d946ef",
    description: "Smart TVs and gadgets looking for each other (UPnP). Chatty but local.",
  },
  ssh: {
    label: "Remote admin (SSH)",
    vehicle: "Armored car",
    emoji: "🚓",
    color: "#06b6d4",
    description: "Encrypted remote control of a computer. Fine when expected — worth noting when it isn't.",
  },
  smb: {
    label: "File sharing (SMB)",
    vehicle: "Moving truck",
    emoji: "🚚",
    color: "#eab308",
    description: "Windows file sharing. Normal between your own computers; risky if reachable from outside.",
  },
  rdp: {
    label: "Remote desktop (RDP)",
    vehicle: "Chauffeured limo",
    emoji: "🚘",
    color: "#ef4444",
    description: "Someone driving a computer remotely. Expected for IT support — worth reviewing otherwise.",
  },
  arp: {
    label: "Street directory (ARP)",
    vehicle: "Road crew",
    emoji: "🚧",
    color: "#94a3b8",
    description: "Devices figuring out who lives at which address on the local street. Routine plumbing.",
  },
  icmp: {
    label: "Network checks (ICMP)",
    vehicle: "Tow truck",
    emoji: "🛻",
    color: "#64748b",
    description: "Pings and connectivity checks — the network asking 'are you there?'",
  },
  other: {
    label: "Other traffic",
    vehicle: "Gray van",
    emoji: "🚐",
    color: "#9ca3af",
    description: "Traffic we couldn't classify into a named service.",
  },
};

export const SERVICE_CATEGORY_ORDER: ServiceCategory[] = [
  "https",
  "quic",
  "http",
  "dns",
  "mdns",
  "llmnr",
  "ssdp",
  "ssh",
  "smb",
  "rdp",
  "arp",
  "icmp",
  "other",
];

/** TCP service ports -> category */
const TCP_PORT_CATEGORIES: Record<number, ServiceCategory> = {
  53: "dns",
  80: "http",
  443: "https",
  22: "ssh",
  445: "smb",
  3389: "rdp",
};

/** UDP service ports -> category */
const UDP_PORT_CATEGORIES: Record<number, ServiceCategory> = {
  53: "dns",
  5353: "mdns",
  5355: "llmnr",
  1900: "ssdp",
  443: "quic",
};

export interface ServiceClassification {
  category: ServiceCategory;
  /** The well-known port that matched, or null */
  servicePort: number | null;
}

/**
 * Classify a flow by protocol and port pair.
 * Checks the destination port first (clients talk TO service ports).
 */
export function classifyService(
  protocol: TrafficProtocol,
  srcPort: number | null,
  dstPort: number | null
): ServiceClassification {
  if (protocol === "arp") return { category: "arp", servicePort: null };
  if (protocol === "icmp") return { category: "icmp", servicePort: null };

  const table =
    protocol === "tcp" ? TCP_PORT_CATEGORIES : protocol === "udp" ? UDP_PORT_CATEGORIES : null;

  if (table) {
    for (const port of [dstPort, srcPort]) {
      if (port !== null && table[port] !== undefined) {
        return { category: table[port], servicePort: port };
      }
    }
  }

  return { category: "other", servicePort: null };
}

/**
 * Ports that indicate remote admin / management channels.
 * Mirrors the spirit of P1_PORTS in risk-ports.ts, kept separate so this
 * module stays free of fs-backed imports and usable in the browser.
 */
export const ADMIN_REMOTE_PORTS: number[] = [22, 8080, 8443, 8888, 9000, 9090, 5985, 5986];

/**
 * Critical risky ports (subset of P0_PORTS in risk-ports.ts relevant to
 * observed traffic): legacy remote access, file sharing, databases.
 */
export const CRITICAL_TRAFFIC_PORTS: number[] = [
  23, 445, 3389, 5900, 135, 139, 1080, 1433, 3306, 5432, 6379, 27017, 9200,
];
