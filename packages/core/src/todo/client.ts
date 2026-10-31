import type { Fetcher } from "../http";
import type { Todo, TodoCreateOptions, TodoFilter, TodoPatch } from "./domain";

export interface TodoApi {
  listTodos(filter?: TodoFilter): Promise<Todo[]>;
  getTodo(id: string): Promise<Todo>;
  createTodo(title: string, opts?: TodoCreateOptions): Promise<Todo>;
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

  async createTodo(title: string, opts?: TodoCreateOptions): Promise<Todo> {
    const body: Record<string, unknown> = { title };
    if (opts?.projectId) body.project_id = opts.projectId;
    if (opts?.description !== undefined) body.description = opts.description;
    if (opts?.dueAt !== undefined) body.due_at = opts.dueAt;
    if (opts?.dueAllDay !== undefined) body.due_all_day = opts.dueAllDay;
    if (opts?.dueZone !== undefined) body.due_zone = opts.dueZone;
    if (opts?.remindAt !== undefined) body.remind_at = opts.remindAt;
    const res = await this.fetcher(this.json("POST", "/v1/todos", body));
    return (await res.json()) as Todo;
  }

  async updateTodo(id: string, patch: TodoPatch): Promise<Todo> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.done !== undefined) body.done = patch.done;
    if (patch.description !== undefined) body.description = patch.description;
    // 0 is the server's "clear" sentinel; null is the ergonomic client spelling.
    if (patch.dueAt !== undefined) body.due_at = patch.dueAt ?? 0;
    if (patch.dueAllDay !== undefined) body.due_all_day = patch.dueAllDay;
    if (patch.dueZone !== undefined) body.due_zone = patch.dueZone;
    if (patch.remindAt !== undefined) body.remind_at = patch.remindAt ?? 0;
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
