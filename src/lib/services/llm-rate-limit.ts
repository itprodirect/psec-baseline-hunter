export const LLM_RATE_LIMIT_MAX_REQUESTS = 20;
export const LLM_RATE_LIMIT_WINDOW_MS = 60_000;

export const LLM_RATE_LIMIT_ERROR_RESPONSE = {
  success: false,
  error: "Too many requests. Please wait and try again.",
} as const;

export interface LLMRateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
}

export interface LLMRateLimitDecision {
  allowed: boolean;
  identity: string;
}

interface RateLimitBucket {
  windowStartMs: number;
  count: number;
}

const buckets = new Map<string, RateLimitBucket>();

// This per-process limiter intentionally shares one request budget across all LLM POST routes per request identity.
// In production, it assumes a trusted proxy provides x-forwarded-for or x-real-ip.
export function getLLMRateLimitIdentity(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

export function consumeLLMRateLimit(
  request: Pick<Request, "headers">,
  options: LLMRateLimitOptions = {}
): LLMRateLimitDecision {
  const maxRequests = options.maxRequests ?? LLM_RATE_LIMIT_MAX_REQUESTS;
  const windowMs = options.windowMs ?? LLM_RATE_LIMIT_WINDOW_MS;
  const nowMs = options.now ? options.now() : Date.now();
  const identity = getLLMRateLimitIdentity(request.headers);

  pruneExpiredBuckets(nowMs, windowMs);

  const bucket = buckets.get(identity);
  if (!bucket) {
    buckets.set(identity, { windowStartMs: nowMs, count: 1 });
    return { allowed: true, identity };
  }

  if (bucket.count >= maxRequests) {
    return { allowed: false, identity };
  }

  bucket.count += 1;
  return { allowed: true, identity };
}

export function resetLLMRateLimitForTesting(): void {
  buckets.clear();
}

function pruneExpiredBuckets(nowMs: number, windowMs: number): void {
  for (const [identity, bucket] of buckets.entries()) {
    if (nowMs < bucket.windowStartMs || nowMs - bucket.windowStartMs >= windowMs) {
      buckets.delete(identity);
    }
  }
}
