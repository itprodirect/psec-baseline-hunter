/**
 * Pure layout math for the Packet Highway scene.
 * Computes node positions (cloud, gateway toll plaza, device buildings,
 * broadcast billboard) and vehicle paths. No React — unit-testable.
 */

import {
  BROADCAST_NODE_ID,
  NormalizedCapture,
  TrafficDevice,
} from "@/lib/types/packet-highway";

export const SCENE_W = 1000;
export const SCENE_H = 640;
export const MAX_BUILDINGS = 9;

export interface ScenePoint {
  x: number;
  y: number;
}

export type SceneNodeKind = "cloud" | "gateway" | "building" | "broadcast" | "overflow";

export interface SceneNode {
  id: string;
  kind: SceneNodeKind;
  /** Top-left of the node's bounding box */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where roads/vehicles attach */
  anchor: ScenePoint;
  device?: TrafficDevice;
  /** For the overflow building: number of devices it represents */
  extraCount?: number;
}

export interface SceneLayout {
  cloud: SceneNode;
  gateway: SceneNode;
  broadcast: SceneNode | null;
  buildings: SceneNode[];
  /** Resolve any node id (device, ext-*, broadcast) to a scene anchor */
  resolveAnchor: (nodeId: string) => ScenePoint;
  /** Resolve a node id to the scene node it is drawn as (cloud for ext-*) */
  resolveNode: (nodeId: string) => SceneNode;
}

export function computeSceneLayout(capture: NormalizedCapture): SceneLayout {
  const cloud: SceneNode = {
    id: "cloud",
    kind: "cloud",
    x: 320,
    y: 28,
    w: 360,
    h: 96,
    anchor: { x: SCENE_W / 2, y: 128 },
  };

  const gatewayDevice = capture.devices.find((d) => d.role === "gateway");
  const gateway: SceneNode = {
    id: gatewayDevice?.id ?? "gateway",
    kind: "gateway",
    x: SCENE_W / 2 - 90,
    y: 286,
    w: 180,
    h: 72,
    anchor: { x: SCENE_W / 2, y: 322 },
    device: gatewayDevice,
  };

  const hasBroadcast = capture.devices.some((d) => d.role === "broadcast");
  const broadcast: SceneNode | null = hasBroadcast
    ? {
        id: BROADCAST_NODE_ID,
        kind: "broadcast",
        x: 30,
        y: 268,
        w: 120,
        h: 64,
        anchor: { x: 90, y: 332 },
      }
    : null;

  // Busiest devices get buildings; the rest fold into an overflow building.
  const ranked = capture.devices
    .filter((d) => d.role === "device")
    .sort((a, b) => b.bytesSent + b.bytesReceived - (a.bytesSent + a.bytesReceived));
  const shown = ranked.slice(0, MAX_BUILDINGS);
  const overflowDevices = ranked.slice(MAX_BUILDINGS);

  const slotCount = shown.length + (overflowDevices.length > 0 ? 1 : 0);
  const buildings: SceneNode[] = [];
  const baseline = 600;
  const left = 80;
  const right = SCENE_W - 80;

  for (let i = 0; i < slotCount; i++) {
    const cx = slotCount === 1 ? SCENE_W / 2 : left + ((right - left) * i) / (slotCount - 1);
    const isOverflow = i >= shown.length;
    const device = isOverflow ? undefined : shown[i];
    // Taller building = busier device
    const h = isOverflow ? 76 : 120 - Math.min(50, i * 7);
    const w = 84;
    buildings.push({
      id: isOverflow ? "overflow" : device!.id,
      kind: isOverflow ? "overflow" : "building",
      x: cx - w / 2,
      y: baseline - h,
      w,
      h,
      anchor: { x: cx, y: baseline - h },
      device,
      extraCount: isOverflow ? overflowDevices.length : undefined,
    });
  }

  const nodeById = new Map<string, SceneNode>();
  for (const b of buildings) nodeById.set(b.id, b);
  nodeById.set(gateway.id, gateway);
  nodeById.set("gateway", gateway);
  if (broadcast) nodeById.set(BROADCAST_NODE_ID, broadcast);

  const overflowNode = buildings.find((b) => b.kind === "overflow") ?? null;
  const deviceIds = new Set(capture.devices.map((d) => d.id));

  const resolveNode = (nodeId: string): SceneNode => {
    const direct = nodeById.get(nodeId);
    if (direct) return direct;
    if (nodeId.startsWith("ext")) return cloud;
    if (deviceIds.has(nodeId) && overflowNode) return overflowNode;
    return gateway;
  };

  return {
    cloud,
    gateway,
    broadcast,
    buildings,
    resolveNode,
    resolveAnchor: (nodeId: string) => resolveNode(nodeId).anchor,
  };
}

/**
 * Vehicle route between two nodes. Traffic between buildings and the cloud
 * passes through the gateway toll plaza; broadcast and gateway-adjacent
 * trips travel direct.
 */
export function computeVehiclePath(
  layout: SceneLayout,
  fromId: string,
  toId: string
): ScenePoint[] {
  const from = layout.resolveNode(fromId);
  const to = layout.resolveNode(toId);
  if (from === to) {
    return [from.anchor, { x: from.anchor.x, y: from.anchor.y - 24 }, from.anchor];
  }
  const viaGateway =
    from.kind !== "gateway" &&
    to.kind !== "gateway" &&
    from.kind !== "broadcast" &&
    to.kind !== "broadcast";
  return viaGateway
    ? [from.anchor, layout.gateway.anchor, to.anchor]
    : [from.anchor, to.anchor];
}

export interface MeasuredPath {
  points: ScenePoint[];
  /** Cumulative length at the END of each segment */
  cumulative: number[];
  total: number;
}

export function measurePath(points: ScenePoint[]): MeasuredPath {
  const cumulative: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    cumulative.push(total);
  }
  return { points, cumulative, total: Math.max(total, 1) };
}

export function pointAlongPath(path: MeasuredPath, progress: number): ScenePoint {
  const target = Math.min(1, Math.max(0, progress)) * path.total;
  let segStart = 0;
  for (let i = 0; i < path.cumulative.length; i++) {
    const segEnd = path.cumulative[i];
    if (target <= segEnd || i === path.cumulative.length - 1) {
      const a = path.points[i];
      const b = path.points[i + 1];
      const segLen = Math.max(segEnd - segStart, 0.0001);
      const f = Math.min(1, Math.max(0, (target - segStart) / segLen));
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    segStart = segEnd;
  }
  return path.points[path.points.length - 1];
}
