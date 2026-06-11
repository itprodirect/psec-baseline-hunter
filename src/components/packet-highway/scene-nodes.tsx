"use client";

/**
 * Presentational SVG nodes for the Packet Highway scene:
 * internet cloud, gateway toll plaza, device buildings, broadcast billboard.
 */

import { getDeviceDisplayName } from "@/lib/utils/traffic-format";
import type { SceneNode } from "./scene-layout";

const LABEL_STYLE: React.CSSProperties = {
  fill: "var(--muted-foreground)",
  fontSize: 11,
  fontFamily: "var(--font-sans, sans-serif)",
  userSelect: "none",
};

const TITLE_STYLE: React.CSSProperties = {
  ...LABEL_STYLE,
  fill: "var(--foreground)",
  fontSize: 12,
  fontWeight: 600,
};

export function CloudNode({ node, endpointCount }: { node: SceneNode; endpointCount: number }) {
  const cx = node.x + node.w / 2;
  return (
    <g>
      <title>The internet — {endpointCount} endpoints seen in this capture</title>
      {[ -110, -40, 40, 110 ].map((dx, i) => (
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
        ☁️ The Internet
      </text>
      <text x={cx} y={node.y + 70} textAnchor="middle" style={LABEL_STYLE}>
        {endpointCount} endpoint{endpointCount === 1 ? "" : "s"} seen
      </text>
    </g>
  );
}

export function GatewayNode({ node, selected, onSelect }: {
  node: SceneNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const cx = node.x + node.w / 2;
  const name = node.device ? getDeviceDisplayName(node.device) : "Router / Gateway";
  return (
    <g onClick={onSelect} style={{ cursor: node.device ? "pointer" : "default" }}>
      <title>{name} — every trip to the internet passes through this toll plaza</title>
      {/* plaza canopy */}
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={18}
        rx={4}
        style={{ fill: "var(--primary)", opacity: 0.85 }}
      />
      {/* booths */}
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={cx - 54 + i * 42}
          y={node.y + 22}
          width={24}
          height={node.h - 36}
          rx={3}
          style={{
            fill: "var(--card)",
            stroke: selected ? "var(--ring)" : "var(--border)",
            strokeWidth: selected ? 2.5 : 1,
          }}
        />
      ))}
      <text x={cx} y={node.y + node.h + 14} textAnchor="middle" style={TITLE_STYLE}>
        🛂 {truncate(name, 20)}
      </text>
    </g>
  );
}

export function BroadcastNode({ node }: { node: SceneNode }) {
  const cx = node.x + node.w / 2;
  return (
    <g>
      <title>Neighborhood announcements — broadcast traffic everyone on the network can hear</title>
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
      <text x={cx} y={node.y + 18} textAnchor="middle" style={{ ...LABEL_STYLE, fontSize: 13 }}>
        📢
      </text>
      <text x={cx} y={node.y + 33} textAnchor="middle" style={LABEL_STYLE}>
        Announcements
      </text>
    </g>
  );
}

export function BuildingNode({ node, selected, onSelect }: {
  node: SceneNode;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const cx = node.x + node.w / 2;
  const isOverflow = node.kind === "overflow";
  const device = node.device;
  const name = isOverflow
    ? `+${node.extraCount} more`
    : device
      ? getDeviceDisplayName(device)
      : "Device";
  const unknown = !isOverflow && device !== undefined && !device.isKnown;

  const windows: React.ReactNode[] = [];
  const rows = Math.max(1, Math.floor((node.h - 34) / 18));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 2; c++) {
      windows.push(
        <rect
          key={`${r}-${c}`}
          x={node.x + 16 + c * 32}
          y={node.y + 14 + r * 18}
          width={18}
          height={10}
          rx={1.5}
          style={{ fill: "var(--primary)", opacity: 0.3 }}
        />
      );
    }
  }

  return (
    <g
      onClick={() => !isOverflow && device && onSelect(device.id)}
      style={{ cursor: isOverflow ? "default" : "pointer" }}
      role={isOverflow ? undefined : "button"}
      aria-label={isOverflow ? undefined : `Show details for ${name}`}
    >
      <title>
        {isOverflow
          ? `${node.extraCount} quieter devices, grouped`
          : `${name}${unknown ? " — not in your device list" : ""} (click for details)`}
      </title>
      {/* roof */}
      <rect
        x={node.x - 4}
        y={node.y - 8}
        width={node.w + 8}
        height={10}
        rx={2}
        style={{ fill: "var(--border)" }}
      />
      {/* body */}
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={node.h}
        rx={3}
        strokeDasharray={unknown ? "6 4" : undefined}
        style={{
          fill: "var(--card)",
          stroke: selected ? "var(--ring)" : unknown ? "#f97316" : "var(--border)",
          strokeWidth: selected ? 2.5 : unknown ? 2 : 1,
        }}
      />
      {windows}
      {/* door */}
      <rect
        x={cx - 7}
        y={node.y + node.h - 16}
        width={14}
        height={16}
        style={{ fill: "var(--muted-foreground)", opacity: 0.5 }}
      />
      {unknown && (
        <g>
          <circle cx={node.x + node.w - 6} cy={node.y - 2} r={9} fill="#f97316" />
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
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
