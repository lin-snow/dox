import type { Fetcher } from "../http";
import type { Todo, TodoPatch } from "./domain";

// TodoApi is the contract surface for callers (TUI, CLI commands, tests).
export interface TodoApi {
  listTodos(): Promise<Todo[]>;
  getTodo(id: string): Promise<Todo>;
  createTodo(title: string): Promise<Todo>;
  updateTodo(id: string, patch: TodoPatch): Promise<Todo>;
  deleteTodo(id: string): Promise<void>;
}

export class TodoClient implements TodoApi {
  constructor(private readonly fetcher: Fetcher, private readonly base: string) {}

  async listTodos(): Promise<Todo[]> {
    const res = await this.fetcher(new Request(`${this.base}/v1/todos`));
    const json = (await res.json()) as { todos?: Todo[] };
    return json.todos ?? [];
  }

  async getTodo(id: string): Promise<Todo> {
    const res = await this.fetcher(
      new Request(`${this.base}/v1/todos/${encodeURIComponent(id)}`),
    );
    return (await res.json()) as Todo;
  }

  async createTodo(title: string): Promise<Todo> {
    const res = await this.fetcher(this.json("POST", "/v1/todos", { title }));
    return (await res.json()) as Todo;
  }

  async updateTodo(id: string, patch: TodoPatch): Promise<Todo> {
    const res = await this.fetcher(
      this.json("PATCH", `/v1/todos/${encodeURIComponent(id)}`, patch),
    );
    return (await res.json()) as Todo;
  }

  async deleteTodo(id: string): Promise<void> {
    await this.fetcher(
      new Request(`${this.base}/v1/todos/${encodeURIComponent(id)}`, { method: "DELETE" }),
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
