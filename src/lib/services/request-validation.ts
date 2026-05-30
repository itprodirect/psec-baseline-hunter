import type { NextRequest } from "next/server";
import type { CreateRuleRequest, RiskLevel, RuleAction, SaveComparisonRequest } from "@/lib/types";
import type { InventoryDevice } from "@/lib/services/inventory";
import { sanitizeNetworkName } from "@/lib/services/path-safety";

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export type JsonObject = Record<string, unknown>;

const PROTOCOLS = ["tcp", "udp"] as const;
const RULE_ACTIONS = ["override", "whitelist"] as const;
const RISK_LEVELS = ["P0", "P1", "P2"] as const;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isRequestValidationError(error: unknown): error is RequestValidationError {
  return error instanceof RequestValidationError;
}

export async function readJsonObject(request: NextRequest): Promise<JsonObject> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new RequestValidationError("Request body must be valid JSON");
  }

  if (!isPlainObject(body)) {
    throw new RequestValidationError("Request body must be a JSON object");
  }

  return body;
}

export function validateCreateRuleBody(body: JsonObject): CreateRuleRequest {
  const port = validatePort(body.port, "port");
  const protocol = validateProtocol(body.protocol);
  const network = validateNetworkName(body.network, "network");
  const action = validateRuleAction(body.action);
  const customRisk =
    body.customRisk === undefined
      ? undefined
      : validateRiskLevel(body.customRisk, "customRisk");
  const reason = validateRequiredString(body.reason, "reason", { maxLength: 1000 });

  if (action === "override" && !customRisk) {
    throw new RequestValidationError("customRisk is required when action is 'override'");
  }

  return {
    port,
    protocol,
    network,
    action,
    customRisk: action === "override" ? customRisk : undefined,
    reason,
  };
}

export function validateRuleUpdateBody(
  body: JsonObject
): { action?: RuleAction; customRisk?: RiskLevel; reason?: string } {
  const updates: { action?: RuleAction; customRisk?: RiskLevel; reason?: string } = {};

  if (Object.hasOwn(body, "action")) {
    updates.action = validateRuleAction(body.action);
  }

  if (Object.hasOwn(body, "customRisk")) {
    updates.customRisk = validateRiskLevel(body.customRisk, "customRisk");
  }

  if (Object.hasOwn(body, "reason")) {
    updates.reason = validateRequiredString(body.reason, "reason", { maxLength: 1000 });
  }

  if (updates.action === "override" && !updates.customRisk) {
    throw new RequestValidationError("customRisk is required when action is 'override'");
  }

  if (Object.keys(updates).length === 0) {
    throw new RequestValidationError("At least one update field is required");
  }

  return updates;
}

export function validateDiffBody(body: JsonObject): {
  baselineRunUid: string;
  currentRunUid: string;
} {
  const baselineRunUid = validateResourceId(body.baselineRunUid, "baselineRunUid");
  const currentRunUid = validateResourceId(body.currentRunUid, "currentRunUid");

  if (baselineRunUid === currentRunUid) {
    throw new RequestValidationError(
      "baselineRunUid and currentRunUid must refer to different runs"
    );
  }

  return {
    baselineRunUid,
    currentRunUid,
  };
}

export function validateSaveComparisonBody(body: JsonObject): SaveComparisonRequest {
  const baselineRunUid = validateResourceId(body.baselineRunUid, "baselineRunUid");
  const currentRunUid = validateResourceId(body.currentRunUid, "currentRunUid");

  if (baselineRunUid === currentRunUid) {
    throw new RequestValidationError("baselineRunUid and currentRunUid must be different");
  }

  return {
    baselineRunUid,
    currentRunUid,
    title: validateOptionalString(body.title, "title", { maxLength: 120 }),
    notes: validateOptionalString(body.notes, "notes", { maxLength: 2000 }),
  };
}

export function validateInventoryAddBody(body: JsonObject): {
  network: string;
  device: Partial<InventoryDevice>;
} {
  const network = validateNetworkName(body.network, "network");
  const deviceBody = validateObjectField(body.device, "device");
  const device: Partial<InventoryDevice> = {};

  const stringFields = [
    ["device", 120],
    ["mac", 64],
    ["vendor", 120],
    ["ip", 64],
    ["hostnames", 255],
    ["status", 40],
    ["notes", 1000],
    ["securityRecs", 1000],
  ] as const;

  for (const [field, maxLength] of stringFields) {
    if (Object.hasOwn(deviceBody, field)) {
      device[field] = validateOptionalString(deviceBody[field], `device.${field}`, {
        maxLength,
      }) ?? "";
    }
  }

  if (!device.ip && !device.mac) {
    throw new RequestValidationError("device must include a non-empty ip or mac");
  }

  return { network, device };
}

export function validateIngestBody(body: JsonObject): {
  zipPath: string;
  network?: string;
} {
  const zipPath = validateRequiredString(body.zipPath, "zipPath", { maxLength: 512 });
  const network = validateOptionalNetworkName(body.network, "network");

  return { zipPath, network };
}

export function validateParseBody(body: JsonObject): { xmlPath: string } {
  return {
    xmlPath: validateRequiredString(body.xmlPath, "xmlPath", { maxLength: 512 }),
  };
}

export function validateResourceId(value: unknown, field: string): string {
  return validateRequiredString(value, field, {
    maxLength: 160,
    pattern: ID_PATTERN,
    patternMessage: `${field} may only contain letters, numbers, underscores, and hyphens`,
  });
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateObjectField(value: unknown, field: string): JsonObject {
  if (!isPlainObject(value)) {
    throw new RequestValidationError(`${field} must be a JSON object`);
  }

  return value;
}

function validatePort(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new RequestValidationError(`${field} must be an integer from 1 to 65535`);
  }

  if (value < 1 || value > 65535) {
    throw new RequestValidationError(`${field} must be an integer from 1 to 65535`);
  }

  return value;
}

function validateProtocol(value: unknown): "tcp" | "udp" {
  return validateEnum(value, "protocol", PROTOCOLS);
}

function validateRuleAction(value: unknown): RuleAction {
  return validateEnum(value, "action", RULE_ACTIONS);
}

function validateRiskLevel(value: unknown, field: string): RiskLevel {
  return validateEnum(value, field, RISK_LEVELS);
}

function validateEnum<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowedValues: T
): T[number] {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    throw new RequestValidationError(
      `${field} must be one of: ${allowedValues.join(", ")}`
    );
  }

  return value;
}

function validateNetworkName(value: unknown, field: string): string {
  const network = validateRequiredString(value, field, { maxLength: 120 });

  if (!sanitizeNetworkName(network)) {
    throw new RequestValidationError(`${field} is invalid`);
  }

  return network;
}

function validateOptionalNetworkName(value: unknown, field: string): string | undefined {
  const network = validateOptionalString(value, field, { maxLength: 120 });

  if (network === undefined) {
    return undefined;
  }

  if (!sanitizeNetworkName(network)) {
    throw new RequestValidationError(`${field} is invalid`);
  }

  return network;
}

function validateRequiredString(
  value: unknown,
  field: string,
  options: { maxLength: number; pattern?: RegExp; patternMessage?: string }
): string {
  if (typeof value !== "string") {
    throw new RequestValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new RequestValidationError(`${field} is required`);
  }

  return validateStringLengthAndPattern(trimmed, field, options);
}

function validateOptionalString(
  value: unknown,
  field: string,
  options: { maxLength: number; pattern?: RegExp; patternMessage?: string }
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new RequestValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return validateStringLengthAndPattern(trimmed, field, options);
}

function validateStringLengthAndPattern(
  value: string,
  field: string,
  options: { maxLength: number; pattern?: RegExp; patternMessage?: string }
): string {
  if (value.length > options.maxLength) {
    throw new RequestValidationError(`${field} must be ${options.maxLength} characters or fewer`);
  }

  if (options.pattern && !options.pattern.test(value)) {
    throw new RequestValidationError(options.patternMessage ?? `${field} is invalid`);
  }

  return value;
}
