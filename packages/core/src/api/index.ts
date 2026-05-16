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

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`dox api error ${status}: ${body}`);
    this.name = "ApiError";
  }
}

export class ApiClient {
  constructor(private readonly cfg: Config) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.cfg.token}`,
      "Content-Type": "application/json",
    };
  }

  async listTodos(): Promise<Todo[]> {
    const res = await fetch(`${this.cfg.server}/v1/todos`, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }
    const json = (await res.json()) as { todos?: Todo[] };
    return json.todos ?? [];
  }
}
