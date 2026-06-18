"use client";

/**
 * Presentational SVG nodes for the Packet Highway scene:
 * internet cloud, gateway checkpoint, typed device silhouettes, broadcast board.
 */

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  getDeviceArchetypeLabel,
  inferDeviceArchetype,
  type PacketHighwayDeviceArchetype,
} from "@/lib/utils/packet-highway-device-archetypes";
import { getDeviceDisplayName } from "@/lib/utils/traffic-format";
import type { SceneNode } from "./scene-layout";
import { DeviceGlyph } from "./device-glyphs";

const LABEL_STYLE: CSSProperties = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
  fontFamily: "var(--font-sans, sans-serif)",
  userSelect: "none",
};

const TITLE_STYLE: CSSProperties = {
  ...LABEL_STYLE,
  fill: "var(--foreground)",
  fontSize: 12,
  fontWeight: 600,
};

export function CloudNode({ node, endpointCount }: { node: SceneNode; endpointCount: number }) {
  const cx = node.x + node.w / 2;
  return (
    <g>
      <title>The internet - {endpointCount} endpoints seen in this capture</title>
      {[-110, -40, 40, 110].map((dx, i) => (
        <ellipse
          key={i}
          cx={cx + dx}
          cy={node.y + 52 + (i % 2 === 0 ? 8 : -6)}
          rx={i % 2 === 0 ? 64 : 78}
          ry={i % 2 === 0 ? 30 : 38}
          style={{ fill: "var(--muted)", stroke: "var(--border)", strokeWidth: 1 }}
        />
      ))}
      <text x={cx} y={node.y + 52} textAnchor="middle" style={TITLE_STYLE}>
        The Internet
      </text>
      <text x={cx} y={node.y + 70} textAnchor="middle" style={LABEL_STYLE}>
        {endpointCount} endpoint{endpointCount === 1 ? "" : "s"} seen
      </text>
    </g>
  );
}

export function GatewayNode({
  node,
  selected,
  onSelect,
}: {
  node: SceneNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const cx = node.x + node.w / 2;
  const name = node.device ? getDeviceDisplayName(node.device) : "Router / Gateway";
  const selectable = node.device !== undefined;
  const [focused, setFocused] = useState(false);

  return (
    <g
      onClick={() => selectable && onSelect()}
      onKeyDown={(event) => selectable && activateOnKeyboard(event, onSelect)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      tabIndex={selectable ? 0 : undefined}
      role={selectable ? "button" : undefined}
      aria-label={selectable ? `Show details for ${name}` : undefined}
      style={{ cursor: selectable ? "pointer" : "default" }}
    >
      <title>{name} - internet-bound traffic in this view is shown through the inferred gateway</title>
      {(selected || focused) && (
        <rect
          x={node.x - 8}
          y={node.y - 8}
          width={node.w + 16}
          height={node.h + 16}
          rx={8}
          fill="none"
          stroke="var(--ring)"
          strokeWidth={2.5}
        />
      )}
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={18}
        rx={4}
        style={{ fill: "var(--primary)", opacity: 0.85 }}
      />
      <rect
        x={cx - 58}
        y={node.y + 24}
        width={116}
        height={node.h - 34}
        rx={6}
        style={{ fill: "var(--card)", stroke: "var(--border)", strokeWidth: 1 }}
      />
      <g style={{ color: "var(--primary)" }}>
        <DeviceGlyph archetype="gateway" x={cx - 24} y={node.y + 22} size={48} />
      </g>
      <text x={cx} y={node.y + node.h + 14} textAnchor="middle" style={TITLE_STYLE}>
        {truncate(name, 20)}
      </text>
    </g>
  );
}

export function BroadcastNode({ node }: { node: SceneNode }) {
  const cx = node.x + node.w / 2;
  return (
    <g>
      <title>Neighborhood announcements - broadcast traffic everyone on the network can hear</title>
      <rect
        x={node.x + 10}
        y={node.y}
        width={node.w - 20}
        height={40}
        rx={5}
        style={{ fill: "var(--muted)", stroke: "var(--border)", strokeWidth: 1 }}
      />
      <line
        x1={cx}
        y1={node.y + 40}
        x2={cx}
        y2={node.y + 64}
        style={{ stroke: "var(--border)", strokeWidth: 3 }}
      />
      <g style={{ color: "var(--muted-foreground)" }}>
        <DeviceGlyph archetype="broadcast" x={cx - 17} y={node.y + 4} size={34} />
      </g>
      <text x={cx} y={node.y + 58} textAnchor="middle" style={LABEL_STYLE}>
        Announcements
      </text>
    </g>
  );
}

export function BuildingNode({
  node,
  selected,
  onSelect,
}: {
  node: SceneNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const cx = node.x + node.w / 2;
  const [focused, setFocused] = useState(false);
  const isOverflow = node.kind === "overflow";
  const device = node.device;
  const name = isOverflow
    ? `+${node.extraCount} more`
    : device
      ? getDeviceDisplayName(device)
      : "Device";
  const unknown = !isOverflow && device !== undefined && !device.isKnown;
  const inference = device
    ? inferDeviceArchetype(device)
    : {
        archetype: "generic" as PacketHighwayDeviceArchetype,
        label: getDeviceArchetypeLabel("generic"),
      };
  const glyphSize = Math.min(58, Math.max(44, node.h - 30));
  const glyphX = cx - glyphSize / 2;
  const glyphY = node.y + Math.max(8, (node.h - glyphSize) / 2 - 2);
  const outlineColor = selected || focused ? "var(--ring)" : unknown ? "#d97706" : "var(--border)";

  return (
    <g
      onClick={() => !isOverflow && device && onSelect(device.id)}
      onKeyDown={(event) =>
        !isOverflow && device && activateOnKeyboard(event, () => onSelect(device.id))
      }
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      tabIndex={!isOverflow && device ? 0 : undefined}
      style={{
        cursor: isOverflow ? "default" : "pointer",
        color: unknown ? "#d97706" : "var(--foreground)",
      }}
      role={!isOverflow && device ? "button" : undefined}
      aria-label={!isOverflow && device ? `Show details for ${name}, ${inference.label}` : undefined}
    >
      <title>
        {isOverflow
          ? `${node.extraCount} quieter devices, grouped`
          : `${name} - ${inference.label}${unknown ? " - not in your device list" : ""} (select for details)`}
      </title>
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={node.h}
        rx={5}
        strokeDasharray={unknown ? "6 4" : undefined}
        style={{
          fill: "var(--card)",
          stroke: outlineColor,
          strokeWidth: selected || focused ? 2.5 : unknown ? 2 : 1,
        }}
      />
      <DeviceGlyph archetype={isOverflow ? "generic" : inference.archetype} x={glyphX} y={glyphY} size={glyphSize} />
      {isOverflow && (
        <text x={cx} y={node.y + node.h - 13} textAnchor="middle" style={{ ...TITLE_STYLE, fontSize: 13 }}>
          +{node.extraCount}
        </text>
      )}
      {unknown && (
        <g>
          <circle cx={node.x + node.w - 6} cy={node.y - 2} r={9} fill="#d97706" />
          <text
            x={node.x + node.w - 6}
            y={node.y + 2}
            textAnchor="middle"
            style={{ fill: "#fff", fontSize: 12, fontWeight: 700 }}
          >
            ?
          </text>
        </g>
      )}
      <text x={cx} y={node.y + node.h + 16} textAnchor="middle" style={TITLE_STYLE}>
        {truncate(name, 13)}
      </text>
    </g>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function activateOnKeyboard(
  event: KeyboardEvent<SVGGElement>,
  action: () => void
): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}
