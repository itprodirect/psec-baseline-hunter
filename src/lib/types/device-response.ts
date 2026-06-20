import type { ObservationIdentityConfidence } from "./observation-comparison";

export type DeviceResponseState = "mine" | "guest" | "not_sure" | "investigate";

export type DeviceResponseIdentityKind =
  | "persisted-device-id"
  | "mac-address"
  | "hashed-mac";

export interface DeviceResponseIdentityRef {
  kind: DeviceResponseIdentityKind;
  hash: string;
  label: string;
}

export interface DeviceResponseTarget {
  responseId: string;
  siteId: string;
  observationId: string;
  deviceIdHash: string | null;
  identity: DeviceResponseIdentityRef;
  confidence: Extract<ObservationIdentityConfidence, "strongest" | "strong">;
  reason: string;
}

export interface DeviceResponseSourceRef {
  observationId: string;
  deviceIdHash: string | null;
  reason: string;
}

export interface DeviceResponseRecord {
  responseId: string;
  siteId: string;
  identity: DeviceResponseIdentityRef;
  state: DeviceResponseState;
  friendlyName: string | null;
  createdAt: string;
  updatedAt: string;
  createdFrom: DeviceResponseSourceRef;
  updatedFrom: DeviceResponseSourceRef;
}

export interface DeviceResponseIndex {
  version: number;
  responses: Record<string, DeviceResponseRecord>;
  lastUpdated: string;
}

export interface DeviceResponseStatement {
  state: DeviceResponseState;
  stateLabel: string;
  friendlyName: string | null;
  createdAt: string;
  updatedAt: string;
  source: "user";
}

export interface DeviceResponseCarryForward {
  fromObservationId: string;
  reason: string;
  updatedAt: string;
}

export interface ActivityDeviceResponse {
  target: DeviceResponseTarget | null;
  statement: DeviceResponseStatement | null;
  carriedForward: DeviceResponseCarryForward | null;
  unavailableReason: string | null;
}

export interface DeviceResponseApiResponse {
  success: boolean;
  response?: DeviceResponseStatement | null;
  responseId?: string;
  cleared?: boolean;
  error?: string;
}
