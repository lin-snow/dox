import type { IO } from "../io";
import type { Todo } from "../todo/domain";

export interface Output {
  todo(t: Todo): void;
  todos(ts: Todo[]): void;
  ok(message: string, details?: Record<string, unknown>): void;
  error(message: string): void;
}

export class HumanOutput implements Output {
  constructor(private readonly io: IO) {}

  todo(t: Todo): void {
    this.io.stdout.write(formatTodo(t) + "\n");
  }

  todos(ts: Todo[]): void {
    if (ts.length === 0) {
      this.io.stdout.write("(no todos)\n");
      return;
    }
    this.io.stdout.write(ts.map(formatTodo).join("\n") + "\n");
  }

  ok(message: string): void {
    this.io.stdout.write(message + "\n");
  }

  error(message: string): void {
    this.io.stderr.write(`dox: ${message}\n`);
  }
}

export class JsonOutput implements Output {
  constructor(private readonly io: IO) {}

  todo(t: Todo): void {
    this.io.stdout.write(JSON.stringify(t) + "\n");
  }

  todos(ts: Todo[]): void {
    this.io.stdout.write(JSON.stringify({ todos: ts }) + "\n");
  }

  ok(message: string, details?: Record<string, unknown>): void {
    this.io.stdout.write(JSON.stringify({ ok: true, message, ...(details ?? {}) }) + "\n");
  }

  error(message: string): void {
    this.io.stderr.write(JSON.stringify({ error: message }) + "\n");
  }
}

function formatTodo(t: Todo): string {
  const mark = t.done ? "[x]" : "[ ]";
  const id = t.id.slice(0, 6);
  return `${mark} ${id}…  ${t.title}`;
}
