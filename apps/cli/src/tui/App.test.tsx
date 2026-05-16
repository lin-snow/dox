import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render } from "ink-testing-library";

import type { Todo, TodoApi } from "@dox/core";

import { App } from "./App";

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "01HX" + Math.random().toString(36).slice(2, 24).toUpperCase().padEnd(22, "A"),
    title: "task",
    done: false,
    createdAt: "1715856000000",
    updatedAt: "1715856000000",
    ...overrides,
  };
}

interface FakeApi {
  api: TodoApi;
  listMock: ReturnType<typeof mock>;
  createMock: ReturnType<typeof mock>;
  updateMock: ReturnType<typeof mock>;
  deleteMock: ReturnType<typeof mock>;
}

function makeFakeApi(initial: Todo[] = []): FakeApi {
  // Use mutable arrays/state so the fake behaves like a real store across
  // sequential operations within one test.
  const store = new Map(initial.map((t) => [t.id, t]));

  const listMock = mock(async () => Array.from(store.values()));
  const createMock = mock(async (title: string) => {
    const t = makeTodo({ title });
    store.set(t.id, t);
    return t;
  });
  const updateMock = mock(async (id: string, patch: { title?: string; done?: boolean }) => {
    const existing = store.get(id);
    if (!existing) throw new Error(`not found: ${id}`);
    const updated = { ...existing, ...patch };
    store.set(id, updated);
    return updated;
  });
  const deleteMock = mock(async (id: string) => {
    store.delete(id);
  });

  return {
    api: {
      listTodos: listMock,
      getTodo: async (id: string) => {
        const t = store.get(id);
        if (!t) throw new Error(`not found: ${id}`);
        return t;
      },
      createTodo: createMock,
      updateTodo: updateMock,
      deleteTodo: deleteMock,
    },
    listMock,
    createMock,
    updateMock,
    deleteMock,
  };
}

// Yield to the event loop a few times to flush queued microtasks (initial
// listTodos refresh, subsequent state updates, etc.).
async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((r) => setImmediate(r));
  }
}

describe("App", () => {
  let instances: ReturnType<typeof render>[] = [];

  beforeEach(() => {
    instances = [];
  });

  afterEach(() => {
    for (const inst of instances) inst.unmount();
  });

  function mountApp(api: TodoApi) {
    const inst = render(<App api={api} />);
    instances.push(inst);
    return inst;
  }

  test("shows empty placeholder when no todos", async () => {
    const { api } = makeFakeApi([]);
    const { lastFrame } = mountApp(api);
    await flush();
    expect(lastFrame()).toContain("(no todos");
  });

  test("renders todos with cursor on first", async () => {
    const { api } = makeFakeApi([makeTodo({ title: "买菜" }), makeTodo({ title: "写代码" })]);
    const { lastFrame } = mountApp(api);
    await flush();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("买菜");
    expect(frame).toContain("写代码");
    expect(frame).toContain(">"); // cursor pointer
  });

  test("j moves cursor down", async () => {
    const a = makeTodo({ title: "alpha" });
    const b = makeTodo({ title: "beta" });
    const { api } = makeFakeApi([a, b]);
    const { lastFrame, stdin } = mountApp(api);
    await flush();
    stdin.write("j");
    await flush();
    // After j, cursor is on second row; ensure the rendering reflects it.
    const lines = (lastFrame() ?? "").split("\n");
    const alphaLine = lines.find((l) => l.includes("alpha")) ?? "";
    const betaLine = lines.find((l) => l.includes("beta")) ?? "";
    expect(betaLine.startsWith(">") || betaLine.includes("> ")).toBe(true);
    expect(alphaLine.startsWith(">") || alphaLine.includes("> ")).toBe(false);
  });

  test("space toggles done on the cursored todo", async () => {
    const a = makeTodo({ title: "task", done: false });
    const { api, updateMock } = makeFakeApi([a]);
    const { stdin } = mountApp(api);
    await flush();
    stdin.write(" ");
    await flush();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]?.[0]).toBe(a.id);
    expect(updateMock.mock.calls[0]?.[1]).toEqual({ done: true });
  });

  test("d deletes the cursored todo", async () => {
    const a = makeTodo({ title: "doomed" });
    const { api, deleteMock } = makeFakeApi([a]);
    const { stdin, lastFrame } = mountApp(api);
    await flush();
    stdin.write("d");
    await flush();
    expect(deleteMock).toHaveBeenCalledWith(a.id);
    expect(lastFrame() ?? "").toContain("(no todos");
  });

  test("i + enter creates a new todo", async () => {
    const { api, createMock } = makeFakeApi([]);
    const { stdin, lastFrame } = mountApp(api);
    await flush();
    stdin.write("i");
    await flush();
    expect(lastFrame() ?? "").toContain("new todo title");
    // Write text and Enter separately so the TextInput has a chance to settle
    // between input events. Stick to ASCII; multibyte chars over fake stdin
    // are handled by Ink but introduce decoding ordering risks in tests.
    stdin.write("buy milk");
    await flush();
    stdin.write("\r");
    await flush();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]?.[0]).toBe("buy milk");
  });

  test("empty input + enter cancels add mode", async () => {
    const { api, createMock } = makeFakeApi([]);
    const { stdin, lastFrame } = mountApp(api);
    await flush();
    stdin.write("i");
    await flush();
    stdin.write("\r"); // empty submit
    await flush();
    expect(createMock).not.toHaveBeenCalled();
    // Back in list mode (help bar shows list keys).
    expect(lastFrame() ?? "").toContain("j/k nav");
  });
});
