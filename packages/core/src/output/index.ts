import type { Todo } from "../api";

export interface Output {
  todo(t: Todo): void;
  todos(ts: Todo[]): void;
  ok(message: string, details?: Record<string, unknown>): void;
  error(message: string): void;
}

export class HumanOutput implements Output {
  todo(t: Todo): void {
    console.log(formatTodo(t));
  }

  todos(ts: Todo[]): void {
    if (ts.length === 0) {
      console.log("(no todos)");
      return;
    }
    for (const t of ts) console.log(formatTodo(t));
  }

  ok(message: string, _details?: Record<string, unknown>): void {
    console.log(message);
  }

  error(message: string): void {
    console.error(`dox: ${message}`);
  }
}

export class JsonOutput implements Output {
  todo(t: Todo): void {
    console.log(JSON.stringify(t));
  }

  todos(ts: Todo[]): void {
    console.log(JSON.stringify({ todos: ts }));
  }

  ok(message: string, details?: Record<string, unknown>): void {
    console.log(JSON.stringify({ ok: true, message, ...(details ?? {}) }));
  }

  error(message: string): void {
    console.error(JSON.stringify({ error: message }));
  }
}

function formatTodo(t: Todo): string {
  const mark = t.done ? "[x]" : "[ ]";
  const id = t.id.slice(0, 6);
  return `${mark} ${id}…  ${t.title}`;
}
