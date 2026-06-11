/**
 * Display/format helpers for the Traffic Visualizer.
 * Pure functions — safe for both server and client use.
 */

import type { TrafficDevice } from "@/lib/types/packet-highway";

export function formatTrafficBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTrafficDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) {
    return "an unknown amount of time";
  }
  const seconds = durationMs / 1000;
  if (seconds < 1) return "under a second";
  if (seconds < 90) return `about ${Math.round(seconds)} seconds`;
  const minutes = seconds / 60;
  if (minutes < 90) return `about ${Math.round(minutes)} minute${Math.round(minutes) === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  return `about ${hours.toFixed(1)} hours`;
}

/**
 * Friendly device label that never leaks a full MAC by default.
 * Named devices use their inventory name; unnamed ones get a short tag.
 */
export function getDeviceDisplayName(device: Pick<TrafficDevice, "name" | "mac" | "role">): string {
  if (device.name) return device.name;
  if (device.role === "gateway") return "Router / Gateway";
  if (device.role === "broadcast") return "Everyone (broadcast)";
  if (device.mac) return `Device …${device.mac.slice(-5)}`;
  return "Unidentified device";
}

/** Mask a MAC for default (non-sensitive) display: keep vendor prefix only */
export function maskMac(mac: string | null): string {
  if (!mac) return "—";
  const parts = mac.split(":");
  if (parts.length !== 6) return "…";
  return `${parts[0]}:${parts[1]}:${parts[2]}:••:••:••`;
}

/** Mask an IP for default display: keep enough to recognize, hide the rest */
export function maskIp(ip: string): string {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.•.•`;
    return ip;
  }
  const idx = ip.indexOf(":");
  return idx > 0 ? `${ip.slice(0, idx)}:…` : ip;
}

/**
 * Summarize a DNS name to its registrable-ish domain (last two labels).
 * Heuristic only (no public-suffix list) — used for grouped display.
 */
export function summarizeDnsName(name: string): string {
  if (name.endsWith(".local")) return name.split(".").slice(-2).join(".");
  const labels = name.split(".").filter(Boolean);
  if (labels.length <= 2) return name;
  return labels.slice(-2).join(".");
}
