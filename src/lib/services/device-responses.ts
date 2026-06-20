import * as fs from "fs";
import * as path from "path";
import { getDataDir, ensureDir } from "./ingest";
import { hashString } from "@/lib/utils/hash";
import type {
  DeviceResponseIdentityKind,
  DeviceResponseIndex,
  DeviceResponseRecord,
  DeviceResponseSourceRef,
  DeviceResponseState,
  DeviceResponseStatement,
  DeviceResponseTarget,
} from "@/lib/types/device-response";
import type { ObservationIdentityConfidence } from "@/lib/types/observation-comparison";

const DEVICE_RESPONSE_INDEX_VERSION = 1;
const DEVICE_RESPONSE_ID_PREFIX = "dresp_";
const MAX_FRIENDLY_NAME_LENGTH = 80;
const MAX_SITE_ID_LENGTH = 160;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class DeviceResponseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceResponseValidationError";
  }
}

export function isDeviceResponseValidationError(
  error: unknown
): error is DeviceResponseValidationError {
  return (
    error instanceof DeviceResponseValidationError ||
    (error instanceof Error && error.name === "DeviceResponseValidationError")
  );
}

export interface BuildDeviceResponseTargetInput {
  siteId: string;
  observationId: string;
  deviceId: string;
  macs: string[];
  identityRuleId?: string;
  identityValues?: string[];
}

export interface DeviceResponseMutationOptions {
  now?: string | Date;
}

export function buildDeviceResponseTarget(
  input: BuildDeviceResponseTargetInput
): DeviceResponseTarget | null {
  const siteId = normalizeRequiredString(input.siteId, "siteId", MAX_SITE_ID_LENGTH);
  const observationId = normalizeObservationId(input.observationId);
  const deviceId = normalizeRequiredString(input.deviceId, "deviceId", 160);
  const identity = bestStableIdentity(input);

  if (!identity) return null;

  const identityHash = hashString(`${identity.kind}|${identity.value}`);
  return {
    responseId: buildResponseId(siteId, identity.kind, identityHash),
    siteId,
    observationId,
    deviceIdHash: hashString(`device-id|${normalizeIdentityValue(deviceId)}`),
    identity: {
      kind: identity.kind,
      hash: identityHash,
      label: identity.label,
    },
    confidence: identity.confidence,
    reason: identity.reason,
  };
}

export function getDeviceResponseForTarget(
  target: DeviceResponseTarget
): DeviceResponseRecord | null {
  const normalizedTarget = normalizeDeviceResponseTarget(target);
  const index = loadDeviceResponseIndex();
  return index.responses[normalizedTarget.responseId] ?? null;
}

export function upsertDeviceResponse(
  target: DeviceResponseTarget,
  state: unknown,
  friendlyName: unknown,
  options: DeviceResponseMutationOptions = {}
): DeviceResponseRecord {
  const normalizedTarget = normalizeDeviceResponseTarget(target);
  const responseState = normalizeDeviceResponseState(state);
  const cleanFriendlyName = normalizeFriendlyName(friendlyName);
  const now = optionIsoOrNow(options.now);
  const index = loadDeviceResponseIndex();
  const existing = index.responses[normalizedTarget.responseId];
  const source = sourceFromTarget(normalizedTarget);
  const record: DeviceResponseRecord = existing
    ? {
        ...existing,
        state: responseState,
        friendlyName: cleanFriendlyName,
        updatedAt: now,
        updatedFrom: source,
      }
    : {
        responseId: normalizedTarget.responseId,
        siteId: normalizedTarget.siteId,
        identity: normalizedTarget.identity,
        state: responseState,
        friendlyName: cleanFriendlyName,
        createdAt: now,
        updatedAt: now,
        createdFrom: source,
        updatedFrom: source,
      };

  index.responses[record.responseId] = record;
  saveDeviceResponseIndex(index);
  return record;
}

export function clearDeviceResponse(
  target: DeviceResponseTarget
): boolean {
  const normalizedTarget = normalizeDeviceResponseTarget(target);
  const index = loadDeviceResponseIndex();
  const existed = Boolean(index.responses[normalizedTarget.responseId]);
  delete index.responses[normalizedTarget.responseId];
  if (existed) {
    saveDeviceResponseIndex(index);
  }
  return existed;
}

export function statementFromDeviceResponse(
  record: DeviceResponseRecord
): DeviceResponseStatement {
  return {
    state: record.state,
    stateLabel: deviceResponseStateLabel(record.state),
    friendlyName: record.friendlyName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: "user",
  };
}

export function deviceResponseStateLabel(state: DeviceResponseState): string {
  const labels: Record<DeviceResponseState, string> = {
    mine: "Mine",
    guest: "Guest",
    not_sure: "Not sure",
    investigate: "Investigate",
  };
  return labels[state];
}

export function normalizeDeviceResponseTarget(
  rawTarget: unknown
): DeviceResponseTarget {
  if (!isRecord(rawTarget)) {
    throw new DeviceResponseValidationError("target must be a JSON object");
  }

  const responseId = normalizeResponseId(rawTarget.responseId);
  const siteId = normalizeRequiredString(rawTarget.siteId, "target.siteId", MAX_SITE_ID_LENGTH);
  const observationId = normalizeObservationId(rawTarget.observationId);
  const deviceIdHash =
    rawTarget.deviceIdHash === null || rawTarget.deviceIdHash === undefined
      ? null
      : normalizeSha256(rawTarget.deviceIdHash, "target.deviceIdHash");
  const identity = normalizeIdentityRef(rawTarget.identity);
  const confidence = normalizeTargetConfidence(rawTarget.confidence);
  const reason = normalizeRequiredString(rawTarget.reason, "target.reason", 240);
  const expectedResponseId = buildResponseId(siteId, identity.kind, identity.hash);

  if (responseId !== expectedResponseId) {
    throw new DeviceResponseValidationError("target responseId does not match identity");
  }

  return {
    responseId,
    siteId,
    observationId,
    deviceIdHash,
    identity,
    confidence,
    reason,
  };
}

function loadDeviceResponseIndex(): DeviceResponseIndex {
  const indexPath = getDeviceResponseIndexPath();
  if (!fs.existsSync(indexPath)) return emptyDeviceResponseIndex();

  try {
    const raw = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    return normalizeDeviceResponseIndex(raw);
  } catch (error) {
    console.error("Failed to load device response index:", error);
    return emptyDeviceResponseIndex();
  }
}

function saveDeviceResponseIndex(index: DeviceResponseIndex): void {
  index.lastUpdated = new Date().toISOString();
  fs.writeFileSync(getDeviceResponseIndexPath(), JSON.stringify(index, null, 2));
}

function getDeviceResponseDir(): string {
  return ensureDir(path.join(getDataDir(), "device-responses"));
}

function getDeviceResponseIndexPath(): string {
  return path.join(getDeviceResponseDir(), "index.json");
}

function emptyDeviceResponseIndex(): DeviceResponseIndex {
  return {
    version: DEVICE_RESPONSE_INDEX_VERSION,
    responses: {},
    lastUpdated: new Date().toISOString(),
  };
}

function normalizeDeviceResponseIndex(raw: unknown): DeviceResponseIndex {
  if (!isRecord(raw) || !isRecord(raw.responses)) {
    return emptyDeviceResponseIndex();
  }

  const responses: Record<string, DeviceResponseRecord> = {};
  for (const [responseId, response] of Object.entries(raw.responses)) {
    const normalizedResponseId = tryNormalizeResponseId(responseId);
    const normalizedRecord = normalizeDeviceResponseRecord(response);
    if (!normalizedResponseId || !normalizedRecord) continue;
    if (normalizedResponseId !== normalizedRecord.responseId) continue;
    responses[normalizedResponseId] = normalizedRecord;
  }

  return {
    version: DEVICE_RESPONSE_INDEX_VERSION,
    responses,
    lastUpdated: isoOrNull(raw.lastUpdated) ?? new Date().toISOString(),
  };
}

function normalizeDeviceResponseRecord(raw: unknown): DeviceResponseRecord | null {
  if (!isRecord(raw)) return null;

  try {
    const responseId = normalizeResponseId(raw.responseId);
    const siteId = normalizeRequiredString(raw.siteId, "siteId", MAX_SITE_ID_LENGTH);
    const identity = normalizeIdentityRef(raw.identity);
    if (responseId !== buildResponseId(siteId, identity.kind, identity.hash)) return null;

    return {
      responseId,
      siteId,
      identity,
      state: normalizeDeviceResponseState(raw.state),
      friendlyName: normalizeFriendlyName(raw.friendlyName),
      createdAt: normalizeIso(raw.createdAt, "createdAt"),
      updatedAt: normalizeIso(raw.updatedAt, "updatedAt"),
      createdFrom: normalizeSourceRef(raw.createdFrom),
      updatedFrom: normalizeSourceRef(raw.updatedFrom),
    };
  } catch {
    return null;
  }
}

function normalizeSourceRef(raw: unknown): DeviceResponseSourceRef {
  if (!isRecord(raw)) {
    throw new DeviceResponseValidationError("source reference must be a JSON object");
  }

  return {
    observationId: normalizeObservationId(raw.observationId),
    deviceIdHash:
      raw.deviceIdHash === null || raw.deviceIdHash === undefined
        ? null
        : normalizeSha256(raw.deviceIdHash, "source.deviceIdHash"),
    reason: normalizeRequiredString(raw.reason, "source.reason", 240),
  };
}

function sourceFromTarget(target: DeviceResponseTarget): DeviceResponseSourceRef {
  return {
    observationId: target.observationId,
    deviceIdHash: target.deviceIdHash,
    reason: target.reason,
  };
}

function bestStableIdentity(input: BuildDeviceResponseTargetInput): {
  kind: DeviceResponseIdentityKind;
  value: string;
  label: string;
  confidence: Extract<ObservationIdentityConfidence, "strongest" | "strong">;
  reason: string;
} | null {
  const explicitDeviceId = explicitDeviceIdentityValue(input.deviceId);
  if (explicitDeviceId) {
    return {
      kind: "persisted-device-id",
      value: explicitDeviceId,
      label: "persisted device ID",
      confidence: "strongest",
      reason: "Response target uses an explicit persisted device identifier.",
    };
  }

  const mac = uniqueSorted(input.macs.map(normalizeMacKey).filter((value): value is string => Boolean(value)))[0];
  if (mac) {
    return {
      kind: "mac-address",
      value: mac,
      label: "MAC address",
      confidence: "strong",
      reason: "Response target uses exact MAC address identity evidence.",
    };
  }

  const hashedMac = uniqueSorted(
    (input.identityValues ?? [])
      .map(normalizeHashedMacKey)
      .filter((value): value is string => Boolean(value))
  )[0];
  if (hashedMac) {
    return {
      kind: "hashed-mac",
      value: hashedMac,
      label: "hashed MAC evidence",
      confidence: "strong",
      reason: "Response target uses stable hashed-MAC identity evidence.",
    };
  }

  return null;
}

function explicitDeviceIdentityValue(value: string): string | null {
  const id = normalizeIdentityValue(value);
  if (!id || /^dev-(?:[a-f0-9]{12}|unknown)$/i.test(id) || looksLikeIpDerivedDeviceId(id)) {
    return null;
  }
  return id;
}

function looksLikeIpDerivedDeviceId(value: string): boolean {
  return containsIpv4DerivedToken(value) || containsIpv6LikeToken(value);
}

function containsIpv4DerivedToken(value: string): boolean {
  const matches = value.matchAll(
    /(?:^|[^0-9])(\d{1,3})[._-](\d{1,3})[._-](\d{1,3})[._-](\d{1,3})(?=$|[^0-9])/g
  );

  for (const match of matches) {
    const octets = match.slice(1, 5).map((part) => Number.parseInt(part, 10));
    if (octets.every((octet) => octet >= 0 && octet <= 255)) {
      return true;
    }
  }

  return false;
}

function containsIpv6LikeToken(value: string): boolean {
  return value.split(/[^0-9a-f:]+/i).some(isIpv6LikeToken);
}

function isIpv6LikeToken(value: string): boolean {
  if (!value.includes(":") || !/^[0-9a-f:]+$/i.test(value)) return false;
  const parts = value.split(":");
  if (value.includes("::")) {
    return parts.some(Boolean);
  }
  return parts.length >= 3 && parts.every((part) => part.length > 0 && part.length <= 4);
}

function buildResponseId(
  siteId: string,
  kind: DeviceResponseIdentityKind,
  identityHash: string
): string {
  return `${DEVICE_RESPONSE_ID_PREFIX}${hashString(
    `${normalizeIdentityValue(siteId)}|${kind}|${identityHash}`
  ).slice(0, 32)}`;
}

function normalizeIdentityRef(raw: unknown): DeviceResponseTarget["identity"] {
  if (!isRecord(raw)) {
    throw new DeviceResponseValidationError("target.identity must be a JSON object");
  }

  const kind = normalizeIdentityKind(raw.kind);
  return {
    kind,
    hash: normalizeSha256(raw.hash, "target.identity.hash"),
    label: normalizeIdentityLabel(raw.label, kind),
  };
}

function normalizeIdentityKind(value: unknown): DeviceResponseIdentityKind {
  if (
    value === "persisted-device-id" ||
    value === "mac-address" ||
    value === "hashed-mac"
  ) {
    return value;
  }

  throw new DeviceResponseValidationError(
    "target.identity.kind must be persisted-device-id, mac-address, or hashed-mac"
  );
}

function normalizeIdentityLabel(
  value: unknown,
  kind: DeviceResponseIdentityKind
): string {
  const fallback: Record<DeviceResponseIdentityKind, string> = {
    "persisted-device-id": "persisted device ID",
    "mac-address": "MAC address",
    "hashed-mac": "hashed MAC evidence",
  };

  if (typeof value !== "string") return fallback[kind];
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, 80) : fallback[kind];
}

function normalizeDeviceResponseState(value: unknown): DeviceResponseState {
  if (value === "mine" || value === "guest" || value === "not_sure" || value === "investigate") {
    return value;
  }

  throw new DeviceResponseValidationError(
    "state must be one of: mine, guest, not_sure, investigate"
  );
}

function normalizeFriendlyName(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new DeviceResponseValidationError("friendlyName must be a string");
  }

  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length > MAX_FRIENDLY_NAME_LENGTH) {
    throw new DeviceResponseValidationError(
      `friendlyName must be ${MAX_FRIENDLY_NAME_LENGTH} characters or fewer`
    );
  }
  return normalized;
}

function normalizeTargetConfidence(
  value: unknown
): Extract<ObservationIdentityConfidence, "strongest" | "strong"> {
  if (value === "strongest" || value === "strong") return value;
  throw new DeviceResponseValidationError("target.confidence must be strongest or strong");
}

function normalizeObservationId(value: unknown): string {
  return normalizeRequiredString(value, "observationId", 160);
}

function normalizeRequiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new DeviceResponseValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new DeviceResponseValidationError(`${field} is required`);
  }
  if (trimmed.length > maxLength) {
    throw new DeviceResponseValidationError(`${field} must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function normalizeResponseId(value: unknown): string {
  if (typeof value !== "string") {
    throw new DeviceResponseValidationError("responseId must be a string");
  }
  const normalized = value.trim();
  if (!new RegExp(`^${DEVICE_RESPONSE_ID_PREFIX}[a-f0-9]{32}$`).test(normalized)) {
    throw new DeviceResponseValidationError("responseId is invalid");
  }
  return normalized;
}

function tryNormalizeResponseId(value: unknown): string | null {
  try {
    return normalizeResponseId(value);
  } catch {
    return null;
  }
}

function normalizeSha256(value: unknown, field: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value.trim())) {
    throw new DeviceResponseValidationError(`${field} must be a SHA-256 hash`);
  }
  return value.trim();
}

function normalizeIso(value: unknown, field: string): string {
  const iso = isoOrNull(value);
  if (!iso) {
    throw new DeviceResponseValidationError(`${field} must be an ISO timestamp`);
  }
  return iso;
}

function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function optionIsoOrNow(value: string | Date | undefined): string {
  const iso = isoOrNull(value);
  return iso ?? new Date().toISOString();
}

function normalizeMacKey(value: string): string | null {
  const cleaned = value.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (cleaned.length !== 12) return null;
  return cleaned.match(/.{2}/g)?.join(":").toLowerCase() ?? null;
}

function normalizeHashedMacKey(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const match = /^(?:sha256:|hash:)?([a-f0-9]{32,128})$/.exec(normalized);
  return match ? `hash:${match[1]}` : null;
}

function normalizeIdentityValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
