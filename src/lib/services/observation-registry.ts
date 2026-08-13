/**
 * Observation Bundle Registry Service
 * Stores sanitized Observation Bundle v1 records under data/observations.
 */

import * as fs from "fs";
import * as path from "path";
import { getDataDir, ensureDir } from "./ingest";
import {
  MAX_OBSERVATION_BUNDLE_JSON_BYTES,
  ObservationBundleValidationError,
  isObservationNormalizationLossCode,
  sanitizeCanonicalLocalObservationBundleV1,
  sanitizeImportedObservationBundleV1,
  sanitizeStoredObservationBundleV1,
  sanitizeSupplementalObservationBundleV1,
} from "./observation-bundle";
import { hashString } from "@/lib/utils/hash";
import type {
  ObservationCadenceStatus,
  ObservationFreshnessEvaluation,
  ObservationFreshnessOptions,
  ObservationRegistryEntry,
  ObservationRegistryImportOptions,
  ObservationRegistryIndex,
  ObservationRegistryListFilters,
  ObservationRegistryRecord,
  ObservationTimeRange,
  RegisterObservationResult,
} from "@/lib/types/observation-registry";
import type {
  CoverageRecord,
  ObservationBatch,
  ObservationBundleV1,
  ObservationNormalization,
  ObservationNormalizationLossCode,
  ObservationOrigin,
  ObservationOriginKind,
} from "@/lib/types/observation-bundle";

const REGISTRY_VERSION = 1;
const OBSERVATION_BUNDLE_SCHEMA_VERSION = "psec.observation-bundle.v1";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_OBSERVATION_RECORD_JSON_BYTES = MAX_OBSERVATION_BUNDLE_JSON_BYTES * 3;
const ISO_INSTANT_WITH_ZONE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/**
 * Freshness policy: observations are expected every 30 days. A bundle is
 * "aging" during the 7-day grace window after its next due date, then "stale".
 */
export const OBSERVATION_FRESHNESS_CADENCE_DAYS = 30;
export const OBSERVATION_FRESHNESS_GRACE_DAYS = 7;

export class ObservationRegistryTimestampError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObservationRegistryTimestampError";
  }
}

export function getObservationRegistryDir(): string {
  return ensureDir(path.join(getDataDir(), "observations"));
}

export function loadObservationRegistry(): ObservationRegistryIndex {
  const indexPath = getObservationRegistryIndexPath();

  if (!fs.existsSync(indexPath)) {
    return emptyRegistry();
  }

  try {
    const content = fs.readFileSync(indexPath, "utf-8");
    return normalizeRegistryIndex(JSON.parse(content));
  } catch (error) {
    console.error("Failed to load observation registry:", error);
    return emptyRegistry();
  }
}

export function registerObservationBundle(
  rawBundle: unknown,
  options: ObservationRegistryImportOptions = {}
): RegisterObservationResult {
  return registerSanitizedObservationBundle(
    rawBundle,
    sanitizeImportedObservationBundleV1,
    options
  );
}

export function registerCanonicalObservationBundle(
  rawBundle: unknown,
  options: ObservationRegistryImportOptions = {}
): RegisterObservationResult {
  return registerSanitizedObservationBundle(
    rawBundle,
    sanitizeCanonicalLocalObservationBundleV1,
    options
  );
}

export function registerSupplementalObservationBundle(
  rawBundle: unknown,
  options: ObservationRegistryImportOptions = {}
): RegisterObservationResult {
  return registerSanitizedObservationBundle(
    rawBundle,
    sanitizeSupplementalObservationBundleV1,
    options
  );
}

function registerSanitizedObservationBundle(
  rawBundle: unknown,
  sanitize: (raw: unknown) => ObservationBundleV1,
  options: ObservationRegistryImportOptions
): RegisterObservationResult {
  assertRegistryImportTimestamps(rawBundle);
  const bundle = sanitize(rawBundle);
  return saveSanitizedObservationBundle(bundle, options);
}

export function registerObservationBundleJson(
  jsonText: string,
  options: ObservationRegistryImportOptions = {}
): RegisterObservationResult {
  return registerObservationBundle(parseRegistryObservationBundleJson(jsonText), options);
}

export function getObservationById(
  registryId: string,
  options: ObservationFreshnessOptions = {}
): ObservationRegistryRecord | null {
  const safeId = normalizeRegistryId(registryId);
  if (!safeId) return null;

  const record = readObservationRecord(safeId, options);
  if (!record) return null;
  return reconcileRecordWithIndex(
    record,
    loadObservationRegistry().observations[safeId],
    options
  );
}

export function isObservationRegistryId(value: string): boolean {
  return normalizeRegistryId(value) !== null;
}

export function listObservations(
  filters: ObservationRegistryListFilters = {},
  freshnessOptions: ObservationFreshnessOptions = {}
): ObservationRegistryEntry[] {
  const registry = loadObservationRegistry();
  let entries = Object.values(registry.observations).map((entry) => {
    const record = readObservationRecord(entry.registryId, freshnessOptions);
    return record
      ? entryFromRecord(reconcileRecordWithIndex(record, entry, freshnessOptions))
      : reviewOnlyIndexEntry(entry, "normalization-metadata-invalid");
  });

  if (filters.siteId) {
    const siteId = filters.siteId.toLowerCase();
    entries = entries.filter((entry) => entry.site.siteId.toLowerCase() === siteId);
  }

  if (filters.network) {
    const network = filters.network.toLowerCase();
    entries = entries.filter((entry) => entry.networkName.toLowerCase() === network);
  }

  const order = filters.order ?? "asc";
  return entries
    .map((entry) => refreshEntryFreshness(entry, freshnessOptions))
    .sort((a, b) => compareChronology(a, b, order));
}

export function findDuplicateObservation(
  contentHash: string,
  options: ObservationFreshnessOptions = {}
): ObservationRegistryRecord | null {
  if (!isSha256(contentHash)) return null;

  const registry = loadObservationRegistry();
  const registryId =
    registry.contentHashes[contentHash] ??
    Object.values(registry.observations).find((entry) => entry.contentHash === contentHash)
      ?.registryId;

  const record = registryId ? getObservationById(registryId, options) : null;
  return record?.contentHash === contentHash ? record : null;
}

export function computeObservationBundleContentHash(bundle: ObservationBundleV1): string {
  return hashString(stableStringify(bundle));
}

export function evaluateObservationFreshness(
  bundle: ObservationBundleV1,
  options: ObservationFreshnessOptions = {}
): ObservationFreshnessEvaluation {
  return evaluateFreshnessParts(bundle.batch, bundle.coverage, timeRangeFromBundle(bundle), options);
}

function saveSanitizedObservationBundle(
  bundle: ObservationBundleV1,
  options: ObservationRegistryImportOptions
): RegisterObservationResult {
  const contentHash = computeObservationBundleContentHash(bundle);
  const registry = loadObservationRegistry();
  const existingId =
    registry.contentHashes[contentHash] ??
    Object.values(registry.observations).find((entry) => entry.contentHash === contentHash)
      ?.registryId;

  if (existingId) {
    const rawExisting = readObservationRecord(existingId, options);
    const existing = rawExisting
      ? reconcileRecordWithIndex(
          rawExisting,
          registry.observations[existingId],
          options
        )
      : null;
    if (
      existing &&
      existing.contentHash === contentHash &&
      (bundle.origin.kind !== "canonical-local-artifacts" ||
        existing.origin.kind === "canonical-local-artifacts")
    ) {
      return { record: existing, isNew: false, duplicateOf: existingId };
    }
  }

  const existingSourceRunObservation =
    bundle.origin.kind === "canonical-local-artifacts"
      ? findExistingObservationBySourceRunIdentity(registry, bundle, options)
      : null;
  if (existingSourceRunObservation) {
    return {
      record: existingSourceRunObservation,
      isNew: false,
      duplicateOf: existingSourceRunObservation.registryId,
    };
  }

  const importedAt = optionIsoOrNull(options.importedAt, "importedAt") ?? new Date().toISOString();
  const registryId = buildRegistryId(bundle, contentHash);
  const record = buildObservationRecord(registryId, bundle, contentHash, importedAt, {
    ...options,
    evaluatedAt: options.evaluatedAt ?? importedAt,
  });

  fs.writeFileSync(getObservationRecordPath(registryId), JSON.stringify(record, null, 2));
  registry.observations[registryId] = entryFromRecord(record);
  registry.contentHashes[contentHash] = registryId;
  saveObservationRegistry(registry);

  return { record, isNew: true };
}

function findExistingObservationBySourceRunIdentity(
  registry: ObservationRegistryIndex,
  bundle: ObservationBundleV1,
  options: ObservationFreshnessOptions
): ObservationRegistryRecord | null {
  const sourceRunUid = stableSourceIdentityPart(bundle.batch.sourceRunUid, "run-unknown");
  const observationId = stableSourceIdentityPart(bundle.observationId, "obs-unknown");
  if (!sourceRunUid && !observationId) return null;

  for (const entry of Object.values(registry.observations)) {
    if (entry.origin.kind !== "canonical-local-artifacts") {
      continue;
    }
    const entrySourceRunUid = stableSourceIdentityPart(
      entry.batch.sourceRunUid,
      "run-unknown"
    );
    const entryObservationId = stableSourceIdentityPart(entry.observationId, "obs-unknown");
    const matchesSourceRunUid = Boolean(sourceRunUid && entrySourceRunUid === sourceRunUid);
    const matchesObservationIdWithoutRunUid = Boolean(
      !sourceRunUid &&
        !entrySourceRunUid &&
        observationId &&
        entryObservationId === observationId
    );

    if (!matchesSourceRunUid && !matchesObservationIdWithoutRunUid) continue;

    const rawExisting = readObservationRecord(entry.registryId, options);
    const existing = rawExisting
      ? reconcileRecordWithIndex(rawExisting, entry, options)
      : null;
    if (existing?.origin.kind === "canonical-local-artifacts") return existing;
  }

  return null;
}

function stableSourceIdentityPart(value: unknown, fallback: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed !== fallback ? trimmed : null;
}

function readObservationRecord(
  registryId: string,
  options: ObservationFreshnessOptions
): ObservationRegistryRecord | null {
  const safeId = normalizeRegistryId(registryId);
  if (!safeId) return null;

  const recordPath = getObservationRecordPath(safeId);
  if (!fs.existsSync(recordPath)) return null;

  try {
    if (fs.statSync(recordPath).size > MAX_OBSERVATION_RECORD_JSON_BYTES) {
      return null;
    }

    const raw = JSON.parse(fs.readFileSync(recordPath, "utf-8"));
    if (!isRecord(raw)) return null;

    const bundle = reconcileStoredRecordAuthority(
      raw,
      sanitizeStoredObservationBundleV1(raw.bundle)
    );
    const contentHash = computeObservationBundleContentHash(bundle);
    const importedAt = isoOrNull(raw.importedAt) ?? new Date().toISOString();
    return buildObservationRecord(safeId, bundle, contentHash, importedAt, options);
  } catch {
    return null;
  }
}

function reconcileStoredRecordAuthority(
  rawRecord: Record<string, unknown>,
  sanitizedBundle: ObservationBundleV1
): ObservationBundleV1 {
  const rawBundle = isRecord(rawRecord.bundle) ? rawRecord.bundle : {};
  const wrapperOrigin = normalizeIndexOrigin(rawRecord.origin);
  const bundleOrigin = normalizeIndexOrigin(rawBundle.origin);
  let origin = sanitizedBundle.origin;
  let normalization = mergeNormalizationCopies(
    sanitizedBundle.normalization,
    normalizeIndexNormalization(rawRecord.normalization)
  );

  if (
    !wrapperOrigin.valid ||
    !bundleOrigin.valid ||
    wrapperOrigin.value.kind !== bundleOrigin.value.kind
  ) {
    origin = { kind: "legacy-unknown", assignedBy: "server" };
    const missing = rawRecord.origin === undefined || rawBundle.origin === undefined;
    normalization = mergeIndexLoss(
      normalization,
      missing ? "authority-metadata-missing" : "authority-metadata-invalid"
    );
  }

  const wrapperNormalization = normalizeIndexNormalization(rawRecord.normalization);
  const bundleNormalization = normalizeIndexNormalization(rawBundle.normalization);
  if (
    !isValidNormalizationMetadata(rawRecord.normalization) ||
    !isValidNormalizationMetadata(rawBundle.normalization) ||
    !sameNormalization(wrapperNormalization, bundleNormalization)
  ) {
    const missing =
      rawRecord.normalization === undefined || rawBundle.normalization === undefined;
    normalization = mergeIndexLoss(
      mergeNormalizationCopies(normalization, bundleNormalization),
      missing ? "normalization-metadata-missing" : "normalization-metadata-invalid"
    );
  }

  const lossy = normalization.status === "lossy";
  const reconciled: ObservationBundleV1 = {
    ...sanitizedBundle,
    origin,
    normalization,
    batch: {
      ...sanitizedBundle.batch,
      partial: sanitizedBundle.batch.partial || lossy || origin.kind === "legacy-unknown",
    },
    coverage:
      lossy && sanitizedBundle.coverage.status === "complete"
        ? { ...sanitizedBundle.coverage, status: "partial" }
        : sanitizedBundle.coverage,
  };
  return sanitizeReconciledStoredBundle(reconciled);
}

function reconcileRecordWithIndex(
  record: ObservationRegistryRecord,
  indexEntry: ObservationRegistryEntry | undefined,
  options: ObservationFreshnessOptions
): ObservationRegistryRecord {
  const originMatches = Boolean(
    indexEntry &&
      indexEntry.origin.kind === record.origin.kind &&
      indexEntry.origin.assignedBy === record.origin.assignedBy
  );
  const normalizationMatches = Boolean(
    indexEntry && sameNormalization(indexEntry.normalization, record.normalization)
  );
  if (originMatches && normalizationMatches) return record;

  let normalization = indexEntry
    ? mergeNormalizationCopies(record.normalization, indexEntry.normalization)
    : record.normalization;
  if (!originMatches) {
    normalization = mergeIndexLoss(normalization, "authority-metadata-invalid");
  }
  if (!normalizationMatches) {
    normalization = mergeIndexLoss(normalization, "normalization-metadata-invalid");
  }
  const bundle = sanitizeReconciledStoredBundle({
    ...record.bundle,
    origin: { kind: "legacy-unknown", assignedBy: "server" },
    normalization,
    batch: { ...record.bundle.batch, partial: true },
    coverage:
      record.bundle.coverage.status === "complete"
        ? { ...record.bundle.coverage, status: "partial" }
        : record.bundle.coverage,
  });
  return buildObservationRecord(
    record.registryId,
    bundle,
    computeObservationBundleContentHash(bundle),
    record.importedAt,
    options
  );
}

function sanitizeReconciledStoredBundle(
  bundle: ObservationBundleV1
): ObservationBundleV1 {
  return bundle.origin.kind === "legacy-unknown"
    ? sanitizeStoredObservationBundleV1(bundle)
    : bundle;
}

function buildObservationRecord(
  registryId: string,
  bundle: ObservationBundleV1,
  contentHash: string,
  importedAt: string,
  options: ObservationFreshnessOptions
): ObservationRegistryRecord {
  const timeRange = timeRangeFromBundle(bundle);

  return {
    registryId,
    observationId: bundle.observationId,
    contentHash,
    importedAt,
    origin: bundle.origin,
    normalization: bundle.normalization,
    site: bundle.site,
    networkName: bundle.site.networkName,
    batch: bundle.batch,
    sources: bundle.sources,
    vantage: bundle.vantage,
    coverage: bundle.coverage,
    timeRange,
    freshness: evaluateFreshnessParts(bundle.batch, bundle.coverage, timeRange, options),
    deviceCount: bundle.devices.length,
    notes: bundle.notes,
    bundle,
  };
}

function evaluateFreshnessParts(
  batch: ObservationBatch,
  coverage: CoverageRecord,
  timeRange: ObservationTimeRange,
  options: ObservationFreshnessOptions
): ObservationFreshnessEvaluation {
  const cadenceDays = positiveInteger(options.cadenceDays) ?? OBSERVATION_FRESHNESS_CADENCE_DAYS;
  const graceDays = positiveInteger(options.graceDays) ?? OBSERVATION_FRESHNESS_GRACE_DAYS;
  const evaluatedAt =
    optionIsoOrNull(options.evaluatedAt, "evaluatedAt") ?? new Date().toISOString();
  const observedAt = latestObservationTime(timeRange);
  const dueAt = observedAt ? addDays(observedAt, cadenceDays) : null;
  const graceEndsAt = dueAt ? addDays(dueAt, graceDays) : null;
  const ageDays = observedAt ? wholeDaysBetween(observedAt, evaluatedAt) : null;
  const cadence = evaluateCadenceStatus(evaluatedAt, observedAt, dueAt, graceEndsAt);

  if (batch.partial || coverage.status !== "complete" || coverage.missingSources.length > 0) {
    return {
      status: "partial",
      cadenceStatus: cadence.status,
      evaluatedAt,
      observedAt,
      dueAt,
      graceEndsAt,
      ageDays,
      cadenceDays,
      graceDays,
      reason: `Observation coverage is partial; cadence status is ${cadence.status}.`,
    };
  }

  return {
    status: cadence.status,
    cadenceStatus: cadence.status,
    evaluatedAt,
    observedAt,
    dueAt,
    graceEndsAt,
    ageDays,
    cadenceDays,
    graceDays,
    reason: cadence.reason,
  };
}

function evaluateCadenceStatus(
  evaluatedAt: string,
  observedAt: string | null,
  dueAt: string | null,
  graceEndsAt: string | null
): { status: ObservationCadenceStatus; reason: string } {
  if (!observedAt || !dueAt || !graceEndsAt) {
    return {
      status: "stale",
      reason: "Observation has no usable collection timestamp.",
    };
  }

  if (evaluatedAt <= dueAt) {
    return {
      status: "fresh",
      reason: "Observation is within the collection cadence.",
    };
  }

  if (evaluatedAt <= graceEndsAt) {
    return {
      status: "aging",
      reason: "Observation is past cadence but still inside the grace window.",
    };
  }

  return {
    status: "stale",
    reason: "Observation is older than the cadence plus grace window.",
  };
}

function saveObservationRegistry(registry: ObservationRegistryIndex): void {
  registry.lastUpdated = new Date().toISOString();
  fs.writeFileSync(getObservationRegistryIndexPath(), JSON.stringify(registry, null, 2));
}

function entryFromRecord(record: ObservationRegistryRecord): ObservationRegistryEntry {
  return {
    registryId: record.registryId,
    observationId: record.observationId,
    contentHash: record.contentHash,
    importedAt: record.importedAt,
    origin: record.origin,
    normalization: record.normalization,
    site: record.site,
    networkName: record.networkName,
    batch: record.batch,
    sources: record.sources,
    vantage: record.vantage,
    coverage: record.coverage,
    timeRange: record.timeRange,
    freshness: record.freshness,
    deviceCount: record.deviceCount,
    notes: record.notes,
  };
}

function refreshEntryFreshness(
  entry: ObservationRegistryEntry,
  options: ObservationFreshnessOptions
): ObservationRegistryEntry {
  return {
    ...entry,
    freshness: evaluateFreshnessParts(entry.batch, entry.coverage, entry.timeRange, options),
  };
}

function reviewOnlyIndexEntry(
  entry: ObservationRegistryEntry,
  code: ObservationNormalizationLossCode
): ObservationRegistryEntry {
  return {
    ...entry,
    origin: { kind: "legacy-unknown", assignedBy: "server" },
    normalization: mergeIndexLoss(entry.normalization, code),
    batch: { ...entry.batch, partial: true },
    coverage:
      entry.coverage.status === "complete"
        ? { ...entry.coverage, status: "partial" }
        : entry.coverage,
  };
}

function getObservationRegistryIndexPath(): string {
  return path.join(getObservationRegistryDir(), "index.json");
}

function getObservationRecordPath(registryId: string): string {
  return path.join(getObservationRegistryDir(), `${registryId}.json`);
}

function emptyRegistry(): ObservationRegistryIndex {
  return {
    version: REGISTRY_VERSION,
    observations: {},
    contentHashes: {},
    lastUpdated: new Date().toISOString(),
  };
}

function normalizeRegistryIndex(raw: unknown): ObservationRegistryIndex {
  if (!isRecord(raw) || !isRecord(raw.observations)) {
    return emptyRegistry();
  }

  const observations: Record<string, ObservationRegistryEntry> = {};
  const contentHashes: Record<string, string> = {};

  for (const [id, entry] of Object.entries(raw.observations)) {
    const safeId = normalizeRegistryId(id);
    const normalizedEntry = normalizeObservationEntry(entry);
    if (!safeId || !normalizedEntry) continue;

    observations[safeId] = normalizedEntry;
    if (isSha256(normalizedEntry.contentHash)) {
      contentHashes[normalizedEntry.contentHash] = safeId;
    }
  }

  if (isRecord(raw.contentHashes)) {
    for (const [hash, id] of Object.entries(raw.contentHashes)) {
      const safeId = typeof id === "string" ? normalizeRegistryId(id) : null;
      if (isSha256(hash) && safeId) {
        contentHashes[hash] = safeId;
      }
    }
  }

  return {
    version: REGISTRY_VERSION,
    observations,
    contentHashes,
    lastUpdated: isoOrNull(raw.lastUpdated) ?? new Date().toISOString(),
  };
}

function normalizeObservationEntry(value: unknown): ObservationRegistryEntry | null {
  if (!isObservationEntryShape(value)) return null;
  const origin = normalizeIndexOrigin(value.origin);
  const normalization = normalizeIndexNormalization(value.normalization);
  if (origin.valid) {
    return { ...(value as unknown as ObservationRegistryEntry), origin: origin.value, normalization };
  }
  return {
    ...(value as unknown as ObservationRegistryEntry),
    origin: origin.value,
    normalization: mergeIndexLoss(
      normalization,
      value.origin === undefined ? "authority-metadata-missing" : "authority-metadata-invalid"
    ),
  };
}

function isObservationEntryShape(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return (
    typeof value.registryId === "string" &&
    typeof value.observationId === "string" &&
    typeof value.contentHash === "string" &&
    isSha256(value.contentHash) &&
    typeof value.importedAt === "string" &&
    isRecord(value.site) &&
    typeof value.networkName === "string" &&
    isRecord(value.batch) &&
    Array.isArray(value.sources) &&
    isRecord(value.vantage) &&
    isRecord(value.coverage) &&
    isRecord(value.timeRange) &&
    isRecord(value.freshness) &&
    typeof value.deviceCount === "number" &&
    Array.isArray(value.notes)
  );
}

function normalizeIndexOrigin(value: unknown): { value: ObservationOrigin; valid: boolean } {
  if (
    isRecord(value) &&
    value.assignedBy === "server" &&
    INDEX_ORIGIN_KIND_SET.has(value.kind as ObservationOriginKind)
  ) {
    return {
      value: { kind: value.kind as ObservationOriginKind, assignedBy: "server" },
      valid: true,
    };
  }
  return {
    value: { kind: "legacy-unknown", assignedBy: "server" },
    valid: false,
  };
}

function normalizeIndexNormalization(value: unknown): ObservationNormalization {
  if (value === undefined || value === null) {
    return {
      status: "lossy",
      losses: [{ code: "normalization-metadata-missing", count: 1 }],
    };
  }
  if (!isRecord(value)) {
    return {
      status: "lossy",
      losses: [{ code: "normalization-metadata-invalid", count: 1 }],
    };
  }

  const byCode = new Map<ObservationNormalizationLossCode, number>();
  let invalid =
    (value.status !== "complete" && value.status !== "lossy") ||
    !Array.isArray(value.losses);
  if (Array.isArray(value.losses)) {
    for (const loss of value.losses) {
      if (
        !isRecord(loss) ||
        typeof loss.code !== "string" ||
        !isObservationNormalizationLossCode(loss.code) ||
        typeof loss.count !== "number" ||
        !Number.isInteger(loss.count) ||
        loss.count < 1
      ) {
        invalid = true;
        continue;
      }
      const code = loss.code as ObservationNormalizationLossCode;
      if (byCode.has(code)) invalid = true;
      byCode.set(
        code,
        Math.max(byCode.get(code) ?? 0, Math.min(1_000_000, loss.count))
      );
    }
  }
  if (
    (value.status === "complete" && byCode.size > 0) ||
    (value.status === "lossy" && byCode.size === 0)
  ) {
    invalid = true;
  }
  if (invalid) {
    byCode.set(
      "normalization-metadata-invalid",
      Math.max(byCode.get("normalization-metadata-invalid") ?? 0, 1)
    );
  }
  const losses = [...byCode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => ({ code, count }));
  return { status: losses.length > 0 ? "lossy" : "complete", losses };
}

function isValidNormalizationMetadata(value: unknown): boolean {
  if (
    !isRecord(value) ||
    (value.status !== "complete" && value.status !== "lossy") ||
    !Array.isArray(value.losses)
  ) {
    return false;
  }
  const seen = new Set<string>();
  for (const loss of value.losses) {
    if (
      !isRecord(loss) ||
      typeof loss.code !== "string" ||
      !isObservationNormalizationLossCode(loss.code) ||
      seen.has(loss.code) ||
      typeof loss.count !== "number" ||
      !Number.isInteger(loss.count) ||
      loss.count < 1
    ) {
      return false;
    }
    seen.add(loss.code);
  }
  return (
    (value.status === "complete" && value.losses.length === 0) ||
    (value.status === "lossy" && value.losses.length > 0)
  );
}

function mergeNormalizationCopies(
  ...states: ObservationNormalization[]
): ObservationNormalization {
  const byCode = new Map<ObservationNormalizationLossCode, number>();
  for (const state of states) {
    for (const loss of state.losses) {
      byCode.set(loss.code, Math.max(byCode.get(loss.code) ?? 0, loss.count));
    }
  }
  const losses = [...byCode.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => ({ code, count }));
  return { status: losses.length > 0 ? "lossy" : "complete", losses };
}

function sameNormalization(
  left: ObservationNormalization,
  right: ObservationNormalization
): boolean {
  return (
    left.status === right.status &&
    left.losses.length === right.losses.length &&
    left.losses.every(
      (loss, index) =>
        loss.code === right.losses[index]?.code &&
        loss.count === right.losses[index]?.count
    )
  );
}

function mergeIndexLoss(
  normalization: ObservationNormalization,
  code: ObservationNormalizationLossCode
): ObservationNormalization {
  const existing = normalization.losses.find((loss) => loss.code === code);
  return {
    status: "lossy",
    losses: existing
      ? normalization.losses
      : [...normalization.losses, { code, count: 1 }].sort((a, b) =>
          a.code.localeCompare(b.code)
        ),
  };
}

const INDEX_ORIGIN_KIND_SET = new Set<ObservationOriginKind>([
  "canonical-local-artifacts",
  "server-synthetic-demo",
  "external-import",
  "supplemental-review",
  "legacy-unknown",
]);

function buildRegistryId(bundle: ObservationBundleV1, contentHash: string): string {
  const observedAt = latestObservationTime(timeRangeFromBundle(bundle));
  const datePart = observedAt ? observedAt.slice(0, 10).replace(/-/g, "") : "undated";
  const sitePart = safeIdPart(bundle.site.siteId || bundle.site.networkName, "site").slice(0, 32);
  return `obs_${datePart}_${sitePart}_${contentHash}`;
}

function normalizeRegistryId(value: string): string | null {
  const trimmed = value.trim();
  return /^obs_[a-z0-9][a-z0-9_-]{1,140}$/.test(trimmed) ? trimmed : null;
}

function safeIdPart(value: string, fallback: string): string {
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);

  return clean || fallback;
}

function timeRangeFromBundle(bundle: ObservationBundleV1): ObservationTimeRange {
  return {
    startedAt: bundle.batch.startedAt,
    endedAt: bundle.batch.endedAt,
    generatedAt: bundle.batch.generatedAt,
  };
}

function latestObservationTime(timeRange: ObservationTimeRange): string | null {
  return timeRange.endedAt ?? timeRange.startedAt ?? timeRange.generatedAt;
}

function compareChronology(
  a: ObservationRegistryEntry,
  b: ObservationRegistryEntry,
  order: "asc" | "desc"
): number {
  const aTime = timeValue(latestObservationTime(a.timeRange));
  const bTime = timeValue(latestObservationTime(b.timeRange));
  const diff = aTime - bTime;
  if (diff !== 0) return order === "asc" ? diff : -diff;
  return a.registryId.localeCompare(b.registryId);
}

function timeValue(iso: string | null): number {
  if (!iso) return 0;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
}

function parseRegistryObservationBundleJson(jsonText: string): unknown {
  if (Buffer.byteLength(jsonText, "utf-8") > MAX_OBSERVATION_BUNDLE_JSON_BYTES) {
    throw new ObservationBundleValidationError("Observation bundle JSON is too large.");
  }

  try {
    return JSON.parse(jsonText);
  } catch {
    throw new ObservationBundleValidationError("This file is not valid JSON.");
  }
}

function assertRegistryImportTimestamps(raw: unknown): void {
  if (!isRecord(raw) || raw.schemaVersion !== OBSERVATION_BUNDLE_SCHEMA_VERSION) return;
  const batch = isRecord(raw.batch) ? raw.batch : null;
  if (!batch) return;

  assertOptionalBundleTimestamp(batch.startedAt, "batch.startedAt");
  assertOptionalBundleTimestamp(batch.endedAt, "batch.endedAt");
  assertRequiredBundleTimestamp(batch.generatedAt, "batch.generatedAt");
}

function assertOptionalBundleTimestamp(value: unknown, field: string): void {
  if (value === undefined || value === null) return;
  assertRequiredBundleTimestamp(value, field);
}

function assertRequiredBundleTimestamp(value: unknown, field: string): void {
  if (typeof value !== "string" || !parseStrictExplicitIsoString(value)) {
    throw new ObservationBundleValidationError(
      `${field} must be an ISO timestamp with Z or an explicit offset`
    );
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * MS_PER_DAY).toISOString();
}

function wholeDaysBetween(startIso: string, endIso: string): number {
  const diff = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(diff)) return 0;
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
}

function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== "string") return null;
  return parseStrictExplicitIsoString(value);
}

function parseStrictExplicitIsoString(value: string): string | null {
  const match = ISO_INSTANT_WITH_ZONE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function optionIsoOrNull(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  const iso = isoOrNull(value);
  if (!iso) {
    throw new ObservationRegistryTimestampError(
      `${field} must be an ISO timestamp with Z or an explicit offset`
    );
  }
  return iso;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
