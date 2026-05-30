import * as path from "path";
import type { RunManifest } from "@/lib/services/run-registry";

export const LLM_FALLBACK_ERROR_MESSAGE = "LLM unavailable; using rule-based fallback.";

export interface SafeErrorMessageOptions {
  allowClientMessage?: (error: unknown) => boolean;
}

export function getSafeErrorMessage(
  error: unknown,
  fallbackMessage: string,
  options: SafeErrorMessageOptions = {}
): string {
  if (options.allowClientMessage?.(error) && error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

function normalizeSeparators(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function toClientDataPath(filePath: string): string {
  const cwd = process.cwd();
  const resolvedPath = path.resolve(filePath);
  const relativePath = path.relative(cwd, resolvedPath);

  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return normalizeSeparators(relativePath);
  }

  return path.basename(filePath);
}

export function sanitizeRunManifestForClient(manifest: RunManifest): RunManifest {
  return {
    ...manifest,
    runFolder: toClientDataPath(manifest.runFolder),
    keyFiles: Object.fromEntries(
      Object.entries(manifest.keyFiles).map(([label, filePaths]) => [
        label,
        filePaths.map(toClientDataPath),
      ])
    ),
  };
}
