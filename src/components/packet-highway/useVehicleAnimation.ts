"use client";

/**
 * requestAnimationFrame loop that turns AnimationEvents into moving
 * vehicle positions along scene paths. The capture timeline is compressed
 * into a repeating loop; each vehicle finishes its trip within the loop.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { AnimationEvent } from "@/lib/types/packet-highway";
import { SERVICE_CATEGORIES } from "@/lib/constants/traffic-services";
import type { TrafficAttentionState } from "@/lib/utils/traffic-attention";
import {
  computeVehiclePath,
  measurePath,
  MeasuredPath,
  pointAlongPath,
  SceneLayout,
} from "./scene-layout";

const LOOP_MS = 24_000;
const TRAVEL_MS = 3_000;
const FRAME_MS = 33; // ~30fps is plenty for dots

export interface ActiveVehicle {
  key: string;
  x: number;
  y: number;
  r: number;
  color: string;
  flowId: string;
  attentionState: TrafficAttentionState;
}

interface PreparedEvent {
  event: AnimationEvent;
  path: MeasuredPath;
  /** Spawn time as a fraction of the loop, scaled so trips finish in-loop */
  spawnT: number;
  key: string;
}

export function useVehicleAnimation(
  events: AnimationEvent[],
  layout: SceneLayout,
  enabled: boolean,
  attentionByFlowId: ReadonlyMap<string, TrafficAttentionState> = EMPTY_ATTENTION_BY_FLOW_ID
): ActiveVehicle[] {
  const [vehicles, setVehicles] = useState<ActiveVehicle[]>([]);
  const lastFrameRef = useRef(0);

  const prepared = useMemo<PreparedEvent[]>(() => {
    const travelFrac = TRAVEL_MS / LOOP_MS;
    return events.map((event, index) => ({
      event,
      path: measurePath(computeVehiclePath(layout, event.fromId, event.toId)),
      spawnT: event.t * (1 - travelFrac),
      key: `${event.flowId}-${index}`,
    }));
  }, [events, layout]);

  useEffect(() => {
    if (!enabled || prepared.length === 0) {
      return;
    }

    let rafId = 0;
    const start = performance.now();
    const travelFrac = TRAVEL_MS / LOOP_MS;

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      if (now - lastFrameRef.current < FRAME_MS) return;
      lastFrameRef.current = now;

      const loopT = ((now - start) % LOOP_MS) / LOOP_MS;
      const active: ActiveVehicle[] = [];

      for (const item of prepared) {
        const progress = (loopT - item.spawnT) / travelFrac;
        if (progress < 0 || progress > 1) continue;
        const point = pointAlongPath(item.path, easeInOut(progress));
        active.push({
          key: item.key,
          x: point.x,
          y: point.y,
          r: item.event.size === 1 ? 4 : item.event.size === 2 ? 5.5 : 7,
          color: SERVICE_CATEGORIES[item.event.category].color,
          flowId: item.event.flowId,
          attentionState: attentionByFlowId.get(item.event.flowId) ?? "routine",
        });
      }

      setVehicles(active);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [attentionByFlowId, prepared, enabled]);

  // While disabled, render nothing; stale state is replaced on the first
  // animation frame after re-enabling.
  return enabled && prepared.length > 0 ? vehicles : EMPTY_VEHICLES;
}

const EMPTY_VEHICLES: ActiveVehicle[] = [];
const EMPTY_ATTENTION_BY_FLOW_ID = new Map<string, TrafficAttentionState>();

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(callback: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false // SSR: assume motion, corrected on hydration
  );
}
