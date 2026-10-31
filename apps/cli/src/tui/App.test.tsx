import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  ActivityEvent,
  EventsApi,
  NotificationsApi,
  Todo,
  TodoApi,
} from "@dox/core";

import { App } from "./App";
import { mount } from "./test-utils";

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

  function mountApp(
    api: TodoApi,
    events?: EventsApi,
    notifications?: NotificationsApi,
  ) {
    const inst = mount(
      <App api={api} events={events} notifications={notifications} />,
    );
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
    press("\x13");
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

  test("Due tab lists only today + overdue todos", async () => {
    const { api } = makeFakeApi([
      makeTodo({
        title: "overdue thing",
        dueAt: String(Date.now() - 86_400_000),
      }),
      makeTodo({
        title: "far future",
        dueAt: String(Date.now() + 5 * 86_400_000),
      }),
    ]);
    const { press, settle, lastFrame } = mountApp(api);
    await settle(
      (f) => f.includes("overdue thing") && f.includes("far future"),
    );
    // Filters ring today -> inbox -> done, so stepping back from inbox lands
    // on the Due tab.
    press("h");
    await settle(
      (f) => f.includes("sorted by due") && f.includes("overdue thing"),
    );
    expect(lastFrame() ?? "").not.toContain("far future");
  });

  test("n opens reminders and acknowledges them", async () => {
    const { api } = makeFakeApi([
      makeTodo({ title: "due soon", dueAt: String(Date.now() + 3_600_000) }),
    ]);
    let acked = 0;
    const notifications: NotificationsApi = {
      list: async () => ({
        notifications: [
          {
            id: "01REMINDER0000000000000000",
            todoId: "01TODO0000000000000000000",
            todoTitle: "due soon",
            kind: "due",
            scheduledFor: String(Date.now() - 60_000),
            createdAt: String(Date.now() - 60_000),
          },
        ],
        unreadCount: acked === 0 ? 1 : 0,
      }),
      ack: async () => {
        acked += 1;
        return 1;
      },
    };
    const { press, settle, lastFrame } = mountApp(
      api,
      undefined,
      notifications,
    );
    await settle((f) => f.includes("due soon"));
    // The unread count is a badge, not decorative state: it's the only signal
    // that something fired before you open the list.
    await settle((f) => f.includes("⌛") && f.includes("new"));
    press("n");
    await settle((f) => f.includes("Reminders") && f.includes("due soon"));
    expect(acked).toBe(1);
    press("\x1b");
    await settle((f) => f.includes("NORMAL"));
    // Acking on open clears the badge as well as the rows.
    expect(lastFrame() ?? "").not.toContain("new");
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
