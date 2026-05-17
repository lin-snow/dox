import type { Fetcher } from "../http";
import type { Todo, TodoFilter, TodoPatch } from "./domain";

export interface TodoApi {
  listTodos(filter?: TodoFilter): Promise<Todo[]>;
  getTodo(id: string): Promise<Todo>;
  createTodo(
    title: string,
    opts?: { projectId?: string; description?: string },
  ): Promise<Todo>;
  updateTodo(id: string, patch: TodoPatch): Promise<Todo>;
  deleteTodo(id: string): Promise<void>;
}

export class TodoClient implements TodoApi {
  constructor(
    private readonly fetcher: Fetcher,
    private readonly base: string,
  ) {}

  async listTodos(filter?: TodoFilter): Promise<Todo[]> {
    const url = new URL(`${this.base}/v1/todos`);
    if (filter) {
      url.searchParams.set("project_id", filter);
    }
    const res = await this.fetcher(new Request(url.toString()));
    const json = (await res.json()) as { todos?: Todo[] };
    return json.todos ?? [];
  }

  async getTodo(id: string): Promise<Todo> {
    const res = await this.fetcher(
      new Request(`${this.base}/v1/todos/${encodeURIComponent(id)}`),
    );
    return (await res.json()) as Todo;
  }

  async createTodo(
    title: string,
    opts?: { projectId?: string; description?: string },
  ): Promise<Todo> {
    const body: Record<string, unknown> = { title };
    if (opts?.projectId) body.project_id = opts.projectId;
    if (opts?.description !== undefined) body.description = opts.description;
    const res = await this.fetcher(this.json("POST", "/v1/todos", body));
    return (await res.json()) as Todo;
  }

  async updateTodo(id: string, patch: TodoPatch): Promise<Todo> {
    // grpc-gateway maps proto field names to snake_case JSON. Forward the
    // patch as-is for title/done, and translate description so an explicit
    // empty string round-trips as "clear this field".
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.done !== undefined) body.done = patch.done;
    if (patch.description !== undefined) body.description = patch.description;
    const res = await this.fetcher(
      this.json("PATCH", `/v1/todos/${encodeURIComponent(id)}`, body),
    );
    return (await res.json()) as Todo;
  }

  async deleteTodo(id: string): Promise<void> {
    await this.fetcher(
      new Request(`${this.base}/v1/todos/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    );
  }

  private json(method: string, path: string, body: object): Request {
    return new Request(`${this.base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}
