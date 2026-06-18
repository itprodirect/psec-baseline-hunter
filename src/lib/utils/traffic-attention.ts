import type {
  NormalizedCapture,
  ServiceCategory,
  TrafficDevice,
  TrafficFlow,
  WatchLevel,
} from "@/lib/types/packet-highway";
import {
  ADMIN_REMOTE_PORTS,
  CRITICAL_TRAFFIC_PORTS,
} from "@/lib/constants/traffic-services";

export type TrafficAttentionState = "routine" | "review" | "watch" | "unclassified";

export interface TrafficAttention {
  state: TrafficAttentionState;
  label: string;
  description: string;
  marker: "solid" | "dash" | "emphasis" | "dot";
  reasons: string[];
}

export interface TrafficAttentionLegendItem extends Omit<TrafficAttention, "reasons"> {
  sample: "solid" | "dash" | "emphasis" | "dot";
}

const STATE_RANK: Record<TrafficAttentionState, number> = {
  routine: 0,
  unclassified: 1,
  review: 2,
  watch: 3,
};

export const TRAFFIC_ATTENTION_META: Record<
  TrafficAttentionState,
  Omit<TrafficAttention, "state" | "reasons">
> = {
  routine: {
    label: "Routine",
    description: "No linked review rule in this capture.",
    marker: "solid",
  },
  review: {
    label: "Review",
    description: "Worth reviewing when convenient.",
    marker: "dash",
  },
  watch: {
    label: "Watch",
    description: "Look at soon.",
    marker: "emphasis",
  },
  unclassified: {
    label: "Unclassified",
    description: "Type was not named from protocol and port metadata.",
    marker: "dot",
  },
};

export const TRAFFIC_ATTENTION_LEGEND: TrafficAttentionLegendItem[] = [
  { state: "routine", ...TRAFFIC_ATTENTION_META.routine, sample: "solid" },
  { state: "review", ...TRAFFIC_ATTENTION_META.review, sample: "dash" },
  { state: "watch", ...TRAFFIC_ATTENTION_META.watch, sample: "emphasis" },
  { state: "unclassified", ...TRAFFIC_ATTENTION_META.unclassified, sample: "dot" },
];

export interface TrafficAttentionIndex {
  getFlow: (flow: TrafficFlow) => TrafficAttention;
  getDevice: (device: TrafficDevice) => TrafficAttention;
  getCategory: (category: ServiceCategory) => TrafficAttention;
}

export function buildTrafficAttentionIndex(capture: NormalizedCapture): TrafficAttentionIndex {
  const flowStates = new Map<string, TrafficAttentionState>();
  const flowReasons = new Map<string, string[]>();
  const deviceStates = new Map<string, TrafficAttentionState>();
  const deviceReasons = new Map<string, string[]>();

  for (const alert of capture.alerts) {
    const state = stateFromWatchLevel(alert.level);
    if (!state) continue;
    for (const flowId of alert.flowIds) {
      mergeState(flowStates, flowReasons, flowId, state, alert.title);
    }
    for (const deviceId of alert.deviceIds) {
      mergeState(deviceStates, deviceReasons, deviceId, state, alert.title);
    }
  }

  return {
    getFlow: (flow) => {
      const derived = deriveFlowAttention(flow);
      const linkedState = flowStates.get(flow.id);
      const linkedReasons = flowReasons.get(flow.id) ?? [];
      const state = maxState(derived.state, linkedState ?? "routine");
      return attention(state, [...derived.reasons, ...linkedReasons]);
    },
    getDevice: (device) => {
      return attention(deviceStates.get(device.id) ?? "routine", deviceReasons.get(device.id) ?? []);
    },
    getCategory: (category) => {
      return attention(category === "other" ? "unclassified" : "routine", []);
    },
  };
}

export function getTrafficAttentionStrokeDasharray(state: TrafficAttentionState): string | undefined {
  if (state === "review") return "10 7";
  if (state === "watch") return "14 5 3 5";
  if (state === "unclassified") return "2 6";
  return undefined;
}

export function getTrafficAttentionStrokeWidthBoost(state: TrafficAttentionState): number {
  if (state === "watch") return 2;
  if (state === "review") return 1;
  return 0;
}

function deriveFlowAttention(flow: TrafficFlow): Pick<TrafficAttention, "state" | "reasons"> {
  if (flow.category === "other") {
    return { state: "unclassified", reasons: ["service category is unclassified"] };
  }
  if (flow.category === "http") {
    return { state: "review", reasons: ["unencrypted web metadata"] };
  }
  if (
    flow.category === "ssh" ||
    flow.category === "rdp" ||
    (flow.port !== null && ADMIN_REMOTE_PORTS.includes(flow.port))
  ) {
    return {
      state: flow.scope === "external" ? "watch" : "review",
      reasons: ["remote-control style service metadata"],
    };
  }
  if (flow.port !== null && CRITICAL_TRAFFIC_PORTS.includes(flow.port)) {
    return {
      state: flow.scope === "external" ? "watch" : "review",
      reasons: ["sensitive service port metadata"],
    };
  }
  return { state: "routine", reasons: [] };
}

function stateFromWatchLevel(level: WatchLevel): TrafficAttentionState | null {
  if (level === "watch") return "watch";
  if (level === "review") return "review";
  return null;
}

function mergeState(
  stateMap: Map<string, TrafficAttentionState>,
  reasonMap: Map<string, string[]>,
  id: string,
  state: TrafficAttentionState,
  reason: string
): void {
  stateMap.set(id, maxState(stateMap.get(id) ?? "routine", state));
  const reasons = reasonMap.get(id) ?? [];
  reasons.push(reason);
  reasonMap.set(id, reasons);
}

function maxState(a: TrafficAttentionState, b: TrafficAttentionState): TrafficAttentionState {
  return STATE_RANK[a] >= STATE_RANK[b] ? a : b;
}

function attention(state: TrafficAttentionState, reasons: string[]): TrafficAttention {
  return {
    state,
    reasons,
    ...TRAFFIC_ATTENTION_META[state],
  };
}
