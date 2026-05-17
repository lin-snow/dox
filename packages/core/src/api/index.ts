import type { Config } from "../config";

// grpc-gateway serializes int64 as JSON string; JS Number can't hold the full
// range so we keep them as strings until display.
export interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodoPatch {
  title?: string;
  done?: boolean;
}

// TodoApi is the contract surface for callers (TUI, CLI commands, tests).
export interface TodoApi {
  listTodos(): Promise<Todo[]>;
  getTodo(id: string): Promise<Todo>;
  createTodo(title: string): Promise<Todo>;
  updateTodo(id: string, patch: TodoPatch): Promise<Todo>;
  deleteTodo(id: string): Promise<void>;
}

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

export interface PairingResult {
  token: string;
  deviceId: string;
  deviceName: string;
}

// normalizePairingCode strips formatting (dashes, spaces) and uppercases —
// matches the server's pair.NormalizeCode so users can paste the displayed
// "ABCD-EFGH" form unchanged.
export function normalizePairingCode(input: string): string {
  return input.replace(/[-\s]/g, "").toUpperCase();
}

// redeemPairingCode trades a pairing code for a per-device bearer token.
// Does not require a config (the endpoint is public).
export async function redeemPairingCode(serverUrl: string, code: string): Promise<PairingResult> {
  const res = await fetch(`${serverUrl}/v1/auth/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalizePairingCode(code) }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  const body = (await res.json()) as { token?: string; deviceId?: string; deviceName?: string };
  if (!body.token || !body.deviceId || !body.deviceName) {
    throw new Error(`malformed redeem response: ${JSON.stringify(body)}`);
  }
  return { token: body.token, deviceId: body.deviceId, deviceName: body.deviceName };
}

export class ApiClient implements TodoApi {
  constructor(private readonly cfg: Config) {}

  async listTodos(): Promise<Todo[]> {
    const res = await this.request("GET", "/v1/todos");
    const json = (await res.json()) as { todos?: Todo[] };
    return json.todos ?? [];
  }

  async getTodo(id: string): Promise<Todo> {
    const res = await this.request("GET", `/v1/todos/${encodeURIComponent(id)}`);
    return (await res.json()) as Todo;
  }

  async createTodo(title: string): Promise<Todo> {
    const res = await this.request("POST", "/v1/todos", { title });
    return (await res.json()) as Todo;
  }

  async updateTodo(id: string, patch: TodoPatch): Promise<Todo> {
    const res = await this.request("PATCH", `/v1/todos/${encodeURIComponent(id)}`, patch);
    return (await res.json()) as Todo;
  }

  async deleteTodo(id: string): Promise<void> {
    await this.request("DELETE", `/v1/todos/${encodeURIComponent(id)}`);
  }

  private async request(method: string, path: string, body?: object): Promise<Response> {
    const res = await fetch(`${this.cfg.server}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.token}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
    return res;
  }
}
