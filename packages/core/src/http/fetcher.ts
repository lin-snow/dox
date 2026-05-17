export type Fetcher = (req: Request) => Promise<Response>;
export type Middleware = (next: Fetcher) => Fetcher;

export const compose = (...mws: Middleware[]): Middleware =>
  (next) => mws.reduceRight((acc, mw) => mw(acc), next);

interface ApiErrorBody {
  code?: number;
  message?: string;
}

const grpcCodeLabel: Record<number, string> = {
  3: "invalid argument",
  5: "not found",
  6: "already exists",
  7: "permission denied",
  9: "failed precondition",
  13: "internal",
  14: "unavailable",
  16: "unauthenticated",
};

function friendlyMessage(status: number, body: ApiErrorBody): string {
  const detail = body.message ?? "";
  const code = body.code;
  const suffix = detail ? `: ${detail}` : "";

  if (status === 401 || code === 16) return `unauthorized (token missing or invalid)${suffix}`;
  if (code === 5) return `not found${suffix}`;
  if (code === 3) return `invalid argument${suffix}`;
  if (code === 7) return `permission denied${suffix}`;
  if (code === 9) return `precondition failed${suffix}`;
  if (code === 14 || status === 503) return `service unavailable${suffix}`;
  if (status >= 500) return `server error (${status})${suffix}`;

  const label = code !== undefined ? grpcCodeLabel[code] ?? `code=${code}` : `HTTP ${status}`;
  return detail ? `${label}: ${detail}` : label;
}

export class ApiError extends Error {
  public readonly grpcCode?: number;

  constructor(public readonly status: number, public readonly rawBody: string) {
    let body: ApiErrorBody = {};
    try {
      body = JSON.parse(rawBody) as ApiErrorBody;
    } catch {
      // Non-JSON body; fall through with empty body.
    }
    super(friendlyMessage(status, body));
    this.name = "ApiError";
    this.grpcCode = body.code;
  }
}
