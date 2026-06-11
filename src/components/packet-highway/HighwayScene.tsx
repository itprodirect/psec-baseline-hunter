"use client";

/**
 * The animated "network city" scene: internet skyline at the top, the
 * router as a toll plaza in the middle, devices as buildings along the
 * bottom, and traffic as vehicles moving between them.
 */

import { useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NormalizedCapture } from "@/lib/types/packet-highway";
import { SERVICE_CATEGORIES } from "@/lib/constants/traffic-services";
import {
  computeSceneLayout,
  computeVehiclePath,
  SCENE_H,
  SCENE_W,
} from "./scene-layout";
import { BroadcastNode, BuildingNode, CloudNode, GatewayNode } from "./scene-nodes";
import { usePrefersReducedMotion, useVehicleAnimation } from "./useVehicleAnimation";

interface HighwaySceneProps {
  capture: NormalizedCapture;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string | null) => void;
}

export function HighwayScene({ capture, selectedDeviceId, onSelectDevice }: HighwaySceneProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const animating = !prefersReducedMotion && !paused;

  const layout = useMemo(() => computeSceneLayout(capture), [capture]);
  const vehicles = useVehicleAnimation(capture.animationEvents, layout, animating);

  // Faint roads for the busiest flows give context even when paused
  const flowRoads = useMemo(() => {
    return [...capture.flows]
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 30)
      .map((flow) => {
        const points = computeVehiclePath(layout, flow.fromId, flow.toId);
        return {
          id: flow.id,
          d: points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" "),
          color: SERVICE_CATEGORIES[flow.category].color,
          width: 1 + Math.min(5, Math.log10(Math.max(10, flow.bytes)) - 1),
        };
      });
  }, [capture.flows, layout]);

  const externalCount = capture.externalEndpoints.filter((e) => !e.isAggregate).length;

  return (
    <div className="relative rounded-lg border bg-background">
      <svg
        viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
        className="h-auto w-full"
        role="img"
        aria-label="Animated map of your network: devices as buildings, the router as a toll plaza, and traffic as vehicles traveling to the internet"
      >
        {/* sky + ground */}
        <rect x={0} y={0} width={SCENE_W} height={170} style={{ fill: "var(--muted)", opacity: 0.4 }} />
        <rect x={0} y={596} width={SCENE_W} height={44} style={{ fill: "var(--muted)", opacity: 0.6 }} />
        <line x1={0} y1={170} x2={SCENE_W} y2={170} style={{ stroke: "var(--border)" }} />

        {/* main highway: gateway <-> internet */}
        <line
          x1={SCENE_W / 2}
          y1={layout.cloud.anchor.y}
          x2={SCENE_W / 2}
          y2={layout.gateway.anchor.y}
          style={{ stroke: "var(--border)", strokeWidth: 22, strokeLinecap: "round" }}
        />
        <line
          x1={SCENE_W / 2}
          y1={layout.cloud.anchor.y + 8}
          x2={SCENE_W / 2}
          y2={layout.gateway.anchor.y - 8}
          strokeDasharray="10 12"
          style={{ stroke: "var(--background)", strokeWidth: 2.5 }}
        />

        {/* local streets: buildings -> gateway */}
        {layout.buildings.map((b) => (
          <line
            key={`road-${b.id}`}
            x1={b.anchor.x}
            y1={b.anchor.y}
            x2={layout.gateway.anchor.x}
            y2={layout.gateway.anchor.y + 24}
            style={{ stroke: "var(--border)", strokeWidth: 8, strokeLinecap: "round", opacity: 0.7 }}
          />
        ))}

        {/* flow traces (visible picture even with animation off) */}
        <g opacity={animating ? 0.16 : 0.45}>
          {flowRoads.map((road) => (
            <path
              key={road.id}
              d={road.d}
              fill="none"
              stroke={road.color}
              strokeWidth={road.width}
              strokeLinecap="round"
            />
          ))}
        </g>

        <CloudNode node={layout.cloud} endpointCount={externalCount} />
        {layout.broadcast && <BroadcastNode node={layout.broadcast} />}
        <GatewayNode
          node={layout.gateway}
          selected={selectedDeviceId !== null && selectedDeviceId === layout.gateway.device?.id}
          onSelect={() => layout.gateway.device && onSelectDevice(layout.gateway.device.id)}
        />
        {layout.buildings.map((b) => (
          <BuildingNode
            key={b.id}
            node={b}
            selected={selectedDeviceId !== null && b.device?.id === selectedDeviceId}
            onSelect={onSelectDevice}
          />
        ))}

        {/* vehicles */}
        <g>
          {vehicles.map((v) => (
            <circle
              key={v.key}
              cx={v.x}
              cy={v.y}
              r={v.r}
              fill={v.color}
              stroke="var(--background)"
              strokeWidth={1.2}
            />
          ))}
        </g>
      </svg>

      <div className="absolute right-3 top-3 flex items-center gap-2">
        {prefersReducedMotion ? (
          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            Animation off (reduced motion) — line thickness shows traffic volume
          </span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Play traffic animation" : "Pause traffic animation"}
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            <span className="ml-1 text-xs">{paused ? "Play" : "Pause"}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
