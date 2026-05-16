import type { Config } from "../config";

// grpc-gateway serializes int64 as JSON string; we keep them as strings until
// display, since JS Number can't safely hold full int64.
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

// TodoApi is the contract surface that callers (TUI / CLI commands) depend on.
// Test fakes can implement it without needing a Config or real network.
export interface TodoApi {
  listTodos(): Promise<Todo[]>;
  getTodo(id: string): Promise<Todo>;
  createTodo(title: string): Promise<Todo>;
  updateTodo(id: string, patch: TodoPatch): Promise<Todo>;
  deleteTodo(id: string): Promise<void>;
}

// Subset of grpc-gateway's error body format.
interface ApiErrorBody {
  code?: number;
  message?: string;
}

// gRPC status codes we care about for friendly messaging.
const grpcCodeName: Record<number, string> = {
  3: "InvalidArgument",
  5: "NotFound",
  6: "AlreadyExists",
  7: "PermissionDenied",
  9: "FailedPrecondition",
  13: "Internal",
  14: "Unavailable",
  16: "Unauthenticated",
};

// Translate HTTP/gRPC error into a human-readable Chinese message.
function friendlyMessage(status: number, body: ApiErrorBody): string {
  const detail = body.message ?? "";
  const code = body.code;

  if (status === 401 || code === 16) return `未授权（token 无效或缺失）${detail ? `: ${detail}` : ""}`;
  if (code === 5) return `未找到${detail ? `: ${detail}` : ""}`;
  if (code === 3) return `参数错误${detail ? `: ${detail}` : ""}`;
  if (code === 7) return `权限不足${detail ? `: ${detail}` : ""}`;
  if (code === 9) return `操作前置条件不满足${detail ? `: ${detail}` : ""}`;
  if (code === 14 || status === 503) return `服务暂不可用${detail ? `: ${detail}` : ""}`;
  if (status >= 500) return `服务器错误 (${status})${detail ? `: ${detail}` : ""}`;

  const codeLabel = code !== undefined ? grpcCodeName[code] ?? `code=${code}` : `HTTP ${status}`;
  return detail ? `${codeLabel}: ${detail}` : codeLabel;
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
