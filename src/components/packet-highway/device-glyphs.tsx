import type { ReactNode, SVGProps } from "react";
import type { PacketHighwayDeviceArchetype } from "@/lib/utils/packet-highway-device-archetypes";

interface DeviceGlyphProps {
  archetype: PacketHighwayDeviceArchetype;
  x?: number;
  y?: number;
  size?: number;
}

export function DeviceGlyph({ archetype, x = 0, y = 0, size = 64 }: DeviceGlyphProps) {
  const scale = size / 64;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {renderGlyph(archetype)}
    </g>
  );
}

export function DeviceGlyphIcon({
  archetype,
  size = 22,
  ...props
}: SVGProps<SVGSVGElement> & {
  archetype: PacketHighwayDeviceArchetype;
  size?: number;
}) {
  // Explicit width/height keep the icon at a fixed pixel size: the glyph has
  // only a viewBox, so without intrinsic dimensions it stretches to fill its
  // container instead of rendering as a small legend icon.
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden {...props}>
      {renderGlyph(archetype)}
    </svg>
  );
}

function renderGlyph(archetype: PacketHighwayDeviceArchetype): ReactNode {
  switch (archetype) {
    case "phone":
      return (
        <>
          <rect x={21} y={9} width={22} height={44} rx={6} fill="var(--card)" stroke="currentColor" strokeWidth={3} />
          <line x1={28} y1={45} x2={36} y2={45} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        </>
      );
    case "computer":
      return (
        <>
          <rect x={15} y={14} width={34} height={25} rx={3} fill="var(--card)" stroke="currentColor" strokeWidth={3} />
          <path d="M10 46h44l-5 7H15z" fill="var(--card)" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
          <line x1={22} y1={47} x2={42} y2={47} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        </>
      );
    case "display":
      return (
        <>
          <rect x={10} y={13} width={44} height={28} rx={4} fill="var(--card)" stroke="currentColor" strokeWidth={3} />
          <line x1={32} y1={41} x2={32} y2={50} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <line x1={22} y1={51} x2={42} y2={51} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
        </>
      );
    case "speaker":
      return (
        <>
          <rect x={20} y={9} width={24} height={46} rx={9} fill="var(--card)" stroke="currentColor" strokeWidth={3} />
          <circle cx={32} cy={25} r={6} fill="none" stroke="currentColor" strokeWidth={2.5} />
          <circle cx={32} cy={43} r={8} fill="none" stroke="currentColor" strokeWidth={2.5} />
        </>
      );
    case "printer":
      return (
        <>
          <path d="M20 9h24v16H20z" fill="var(--card)" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
          <rect x={13} y={24} width={38} height={24} rx={5} fill="var(--card)" stroke="currentColor" strokeWidth={3} />
          <path d="M21 39h22v14H21z" fill="var(--card)" stroke="currentColor" strokeWidth={3} strokeLinejoin="round" />
          <circle cx={44} cy={31} r={2} fill="currentColor" />
        </>
      );
    case "gateway":
      return (
        <>
          <rect x={12} y={29} width={40} height={16} rx={5} fill="var(--card)" stroke="currentColor" strokeWidth={3} />
          <path d="M20 29V18m24 11V18M26 18h12" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <circle cx={23} cy={37} r={2} fill="currentColor" />
          <circle cx={32} cy={37} r={2} fill="currentColor" />
          <circle cx={41} cy={37} r={2} fill="currentColor" />
        </>
      );
    case "broadcast":
      return (
        <>
          <rect x={12} y={16} width={40} height={24} rx={4} fill="var(--card)" stroke="currentColor" strokeWidth={3} />
          <path d="M32 40v11m-10 0h20" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <path d="M25 29h4l8-6v18l-8-6h-4z" fill="var(--card)" stroke="currentColor" strokeWidth={2.5} strokeLinejoin="round" />
        </>
      );
    case "unknown":
      return (
        <>
          <rect x={16} y={12} width={32} height={40} rx={7} fill="var(--card)" stroke="currentColor" strokeWidth={3} strokeDasharray="6 5" />
          <text x={32} y={39} textAnchor="middle" fill="currentColor" fontSize={24} fontWeight={700}>
            ?
          </text>
        </>
      );
    case "generic":
    default:
      return (
        <>
          <rect x={15} y={15} width={34} height={34} rx={6} fill="var(--card)" stroke="currentColor" strokeWidth={3} />
          <path d="M24 28h16M24 36h16" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
        </>
      );
  }
}
