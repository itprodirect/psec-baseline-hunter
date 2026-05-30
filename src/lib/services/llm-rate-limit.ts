export const LLM_RATE_LIMIT_MAX_REQUESTS = 20;
export const LLM_RATE_LIMIT_WINDOW_MS = 60_000;
export const SHARED_LLM_RATE_LIMIT_IDENTITY = "shared";

export const LLM_RATE_LIMIT_ERROR_RESPONSE = {
  success: false,
  error: "Too many requests. Please wait and try again.",
} as const;

export interface LLMRateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
  trustProxyHeaders?: boolean;
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

// This per-process limiter intentionally shares one request budget across all LLM POST routes.
// Forwarded proxy headers are trusted only when explicitly enabled.
export function getLLMRateLimitIdentity(
  headers: Headers,
  options: Pick<LLMRateLimitOptions, "trustProxyHeaders"> = {}
): string {
  const trustProxyHeaders =
    options.trustProxyHeaders ??
    process.env.LLM_RATE_LIMIT_TRUST_PROXY === "true";

  if (!trustProxyHeaders) {
    return SHARED_LLM_RATE_LIMIT_IDENTITY;
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const forwardedIps = forwardedFor
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
    const rightmostIp = forwardedIps[forwardedIps.length - 1];
    if (rightmostIp) {
      return rightmostIp;
    }
  }

  return SHARED_LLM_RATE_LIMIT_IDENTITY;
}

export function consumeLLMRateLimit(
  request: Pick<Request, "headers">,
  options: LLMRateLimitOptions = {}
): LLMRateLimitDecision {
  const maxRequests = options.maxRequests ?? LLM_RATE_LIMIT_MAX_REQUESTS;
  const windowMs = options.windowMs ?? LLM_RATE_LIMIT_WINDOW_MS;
  const nowMs = options.now ? options.now() : Date.now();
  const identity = getLLMRateLimitIdentity(request.headers, {
    trustProxyHeaders: options.trustProxyHeaders,
  });

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
