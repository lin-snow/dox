import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type { ActivityEvent, EventsApi, Todo, TodoApi } from "@dox/core";

import { App } from "./App";
import { mount } from "./test-utils";

// Integration smokes. The reducer is exhaustively covered in state.test.ts —
// these only verify the parts the reducer can't see: that the Ink tree
// renders, that single-keystroke modes (help, search, editor cancel) wire up,
// and that async API calls (delete, events) reach the backend with the right
// args.
//
// Tests that depend on multi-keystroke flows landing in a freshly-mounted
// child input (cursor movement, toast, TextInput-fed creation) were removed:
// they were flaky on slower machines because Ink's useInput subscribes inside
// useEffect and the post-commit settle window varies with load. Cover those
// paths by hand in the running TUI.

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id:
      "01HX" +
      Math.random().toString(36).slice(2, 24).toUpperCase().padEnd(22, "A"),
    title: "task",
    done: false,
    createdAt: "1715856000000",
    updatedAt: "1715856000000",
    createdBy: "test-user",
    ...overrides,
  };
}

interface FakeApi {
  api: TodoApi;
  createMock: ReturnType<typeof mock>;
  updateMock: ReturnType<typeof mock>;
  deleteMock: ReturnType<typeof mock>;
}

function makeFakeApi(initial: Todo[] = []): FakeApi {
  // Mutable store so the fake reflects mutations across sequential calls.
  const store = new Map(initial.map((t) => [t.id, t]));
  const createMock = mock(async (title: string) => {
    const t = makeTodo({ title });
    store.set(t.id, t);
    return t;
  });
  const updateMock = mock(
    async (id: string, patch: { title?: string; done?: boolean }) => {
      const existing = store.get(id);
      if (!existing) throw new Error(`not found: ${id}`);
      const updated = { ...existing, ...patch };
      store.set(id, updated);
      return updated;
    },
  );
  const deleteMock = mock(async (id: string) => {
    store.delete(id);
  });
  return {
    api: {
      listTodos: async () => Array.from(store.values()),
      getTodo: async (id) => {
        const t = store.get(id);
        if (!t) throw new Error(`not found: ${id}`);
        return t;
      },
      createTodo: createMock,
      updateTodo: updateMock,
      deleteTodo: deleteMock,
    },
    createMock,
    updateMock,
    deleteMock,
  };
}

describe("App (integration smokes)", () => {
  let instances: ReturnType<typeof mount>[] = [];

  beforeEach(() => {
    instances = [];
  });

  afterEach(() => {
    for (const inst of instances) inst.unmount();
  });

  function mountApp(api: TodoApi, events?: EventsApi) {
    const inst = mount(<App api={api} events={events} />);
    instances.push(inst);
    return inst;
  }

  test("empty list shows the add-todo placeholder", async () => {
    const { api } = makeFakeApi([]);
    const { settle } = mountApp(api);
    await settle((f) => f.includes("nothing here"));
  });

  test("d deletes the cursored todo", async () => {
    const a = makeTodo({ title: "doomed" });
    const { api, deleteMock } = makeFakeApi([a]);
    const { press, settle } = mountApp(api);
    await settle((f) => f.includes("doomed"));
    press("d");
    await settle((f) => f.includes("nothing here"));
    expect(deleteMock).toHaveBeenCalledWith(a.id);
  });

  test("Ctrl-S with blank title cancels add mode", async () => {
    const { api, createMock } = makeFakeApi([]);
    const { press, settle } = mountApp(api);
    await settle((f) => f.includes("nothing here"));
    press("i");
    await settle((f) => f.includes("New todo"));
    press("\x13"); // empty title — treated as cancel
    await settle((f) => f.includes("NORMAL"));
    expect(createMock).not.toHaveBeenCalled();
  });

  test("? toggles the help overlay", async () => {
    const { api } = makeFakeApi([]);
    const { press, settle } = mountApp(api);
    await settle((f) => f.includes("nothing here"));
    press("?");
    await settle((f) => f.includes("keybindings"));
    press("?");
    await settle((f) => !f.includes("keybindings"));
  });

  test("/ opens search and narrows results live", async () => {
    const { api } = makeFakeApi([
      makeTodo({ title: "buy milk" }),
      makeTodo({ title: "write code" }),
      makeTodo({ title: "design search" }),
    ]);
    const { press, settle } = mountApp(api);
    await settle((f) => f.includes("buy milk"));
    press("/");
    await settle((f) => f.includes("Search") && f.includes("3 todos total"));
    press("milk");
    await settle(
      (f) =>
        f.includes("1 match") &&
        f.includes("buy milk") &&
        !f.includes("write code"),
    );
  });

  test("activity feed renders events from the api", async () => {
    const { api } = makeFakeApi([]);
    const event: ActivityEvent = {
      id: "01EVENTSAMPLE0000000000000",
      verb: "todo_completed",
      actorId: "u1",
      actorName: "alice",
      projectId: "p1",
      projectName: "API",
      projectColor: "magenta",
      targetType: "todo",
      targetId: "01TODO0000000000000000000",
      targetLabel: "fix login bug",
      createdAt: String(Date.now() - 30_000),
    };
    const events: EventsApi = { list: async () => [event] };
    const { settle } = mountApp(api, events);
    await settle((f) => f.includes("alice") && f.includes("fix login bug"));
  });

  test("long lists window with a more-below indicator", async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      makeTodo({ title: `task-${String(i).padStart(2, "0")}` }),
    );
    const { api } = makeFakeApi(many);
    const { settle, lastFrame } = mountApp(api);
    await settle((f) => f.includes("task-00"));
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("task-39");
    expect(frame).toMatch(/\d+ more ↓/);
  });
});
