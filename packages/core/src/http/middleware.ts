import type { Config } from "../config";
import type { IO } from "../io";
import { ApiError, compose, type Fetcher, type Middleware } from "./fetcher";

export const withAuth = (token: string): Middleware => (next) => (req) => {
  req.headers.set("Authorization", `Bearer ${token}`);
  return next(req);
};

export const withErrorMap: Middleware = (next) => async (req) => {
  const res = await next(req);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry only on transient failures: 5xx responses (wrapped as ApiError by
// withErrorMap) and network-level errors. 4xx is a caller bug — fail fast.
const isRetryable = (e: unknown): boolean => {
  if (e instanceof ApiError) return e.status >= 500;
  return true;
};

export const withRetry = (max = 2): Middleware => (next) => async (req) => {
  for (let attempt = 0; ; attempt++) {
    try {
      // Bun's Request.clone() returns the Web-standard Request type, which TS
      // narrows compared to Bun's extended Request. Runtime behavior matches.
      return await next(req.clone() as Request);
    } catch (e) {
      if (attempt >= max || !isRetryable(e)) throw e;
      await sleep(2 ** attempt * 100);
    }
  }
};

export const withLog =
  (log: (line: string) => void): Middleware =>
  (next) =>
  async (req) => {
    const t = Date.now();
    const res = await next(req);
    log(`${req.method} ${req.url} → ${res.status} (${Date.now() - t}ms)`);
    return res;
  };

// withErrorMap sits inside withRetry: 4xx must not be retried, and the retry
// loop needs the thrown ApiError to decide whether to back off or bail.
export const buildFetcher = (cfg: Config, io: IO): Fetcher =>
  compose(
    withAuth(cfg.token),
    withRetry(2),
    withErrorMap,
    withLog(io.debug),
  )(fetch);
