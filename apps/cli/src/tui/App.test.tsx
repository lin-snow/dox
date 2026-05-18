import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render } from "ink-testing-library";

import type { ActivityEvent, EventsApi, Todo, TodoApi } from "@dox/core";

import { App } from "./App";

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
  listMock: ReturnType<typeof mock>;
  createMock: ReturnType<typeof mock>;
  updateMock: ReturnType<typeof mock>;
  deleteMock: ReturnType<typeof mock>;
}

function makeFakeApi(initial: Todo[] = []): FakeApi {
  // Mutable store so the fake reflects mutations across sequential calls.
  const store = new Map(initial.map((t) => [t.id, t]));

  const listMock = mock(async () => Array.from(store.values()));
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

async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((r) => setImmediate(r));
  }
}

// Wait until `predicate` returns true. Use anywhere the assertion depends on
// React having committed a state change — useInput → dispatch → re-render is
// async, and the number of microtasks / scheduler turns to settle varies with
// machine load. setTimeout(0) yields to the full macrotask queue (including
// React's MessageChannel-based scheduler on Node), which is more reliable
// than setImmediate alone for flushing React 19's deferred work.
async function flushUntil(
  predicate: () => boolean,
  attempts = 1000,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return;
    await new Promise<void>((r) => setTimeout(r, 0));
  }
  throw new Error(
    `flushUntil: predicate never became true within ${attempts} ticks`,
  );
}

// Selection marker rendered on the focused row by TodoList — kept here so any
// future glyph change touches one spot in the tests.
const SELECT_BAR = "▎";

describe("App", () => {
  let instances: ReturnType<typeof render>[] = [];

  beforeEach(() => {
    instances = [];
  });

  afterEach(() => {
    for (const inst of instances) inst.unmount();
  });

  function mountApp(api: TodoApi, events?: EventsApi) {
    const inst = render(<App api={api} events={events} />);
    instances.push(inst);
    return inst;
  }

  test("shows empty placeholder when no todos", async () => {
    const { api } = makeFakeApi([]);
    const { lastFrame } = mountApp(api);
    await flush();
    expect(lastFrame()).toContain("nothing here");
  });

  test("renders todos with selection bar on first", async () => {
    const { api } = makeFakeApi([
      makeTodo({ title: "buy milk" }),
      makeTodo({ title: "write code" }),
    ]);
    const { lastFrame } = mountApp(api);
    await flush();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("buy milk");
    expect(frame).toContain("write code");
    expect(frame).toContain(SELECT_BAR);
  });

  test("j moves cursor down", async () => {
    const a = makeTodo({ title: "alpha" });
    const b = makeTodo({ title: "beta" });
    const { api } = makeFakeApi([a, b]);
    const { lastFrame, stdin } = mountApp(api);
    // Match the list-row pattern explicitly: `▎ ○ <title>` or `  ○ <title>`.
    // Title also appears in the Todo Details pane as "Title: <title>", which
    // would otherwise shadow the row we care about.
    const rowOf = (title: string, frame: string) =>
      frame
        .split("\n")
        .find((l) => new RegExp(`[▎ ]\\s*[○✓]\\s+${title}`).test(l)) ?? "";
    // Wait for the initial render to commit AND useInput to subscribe before
    // sending the keypress — without confirming "alpha selected" first, a
    // stdin.write fired between commit and useEffect would be silently
    // dropped by ink and the cursor would never move.
    await flushUntil(() =>
      rowOf("alpha", lastFrame() ?? "").includes(SELECT_BAR),
    );
    stdin.write("j");
    await flushUntil(() =>
      rowOf("beta", lastFrame() ?? "").includes(SELECT_BAR),
    );
    expect(rowOf("alpha", lastFrame() ?? "").includes(SELECT_BAR)).toBe(false);
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

  // Done todos must not clutter the working list: completing one drops it
  // immediately and the empty-state placeholder takes over. A short-lived
  // toast carries the undo affordance; pressing `z` while it's up reopens
  // the todo and the row reappears.
  test("done todos disappear from the list; z undoes within the toast", async () => {
    const a = makeTodo({ title: "buy milk", done: false });
    const { api, updateMock } = makeFakeApi([a]);
    const { stdin, lastFrame } = mountApp(api);
    await flushUntil(() => (lastFrame() ?? "").includes("buy milk"));
    stdin.write(" ");
    // Row leaves the list and the toast banner appears in its place.
    await flushUntil(() => {
      const frame = lastFrame() ?? "";
      return frame.includes("z to undo") && frame.includes("nothing here");
    });
    stdin.write("z");
    await flushUntil(() => (lastFrame() ?? "").includes("buy milk"));
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock.mock.calls[0]?.[1]).toEqual({ done: true });
    expect(updateMock.mock.calls[1]?.[1]).toEqual({ done: false });
  });

  test("d deletes the cursored todo", async () => {
    const a = makeTodo({ title: "doomed" });
    const { api, deleteMock } = makeFakeApi([a]);
    const { stdin, lastFrame } = mountApp(api);
    await flush();
    stdin.write("d");
    await flush();
    expect(deleteMock).toHaveBeenCalledWith(a.id);
    expect(lastFrame() ?? "").toContain("nothing here");
  });

  test("i + ctrl-s creates a new todo", async () => {
    const { api, createMock } = makeFakeApi([]);
    const { stdin, lastFrame } = mountApp(api);
    await flush();
    stdin.write("i");
    await flush();
    expect(lastFrame() ?? "").toContain("New todo");
    // Editor has 2 fields (title + description). Enter on title advances
    // focus to description; Ctrl+S saves from either field. Enter inside the
    // description inserts a newline — see MultilineInput.
    stdin.write("buy milk");
    await flush();
    stdin.write("\x13"); // Ctrl+S — submit
    await flush();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]?.[0]).toBe("buy milk");
  });

  test("ctrl-s with blank title cancels add mode", async () => {
    const { api, createMock } = makeFakeApi([]);
    const { stdin, lastFrame } = mountApp(api);
    await flush();
    stdin.write("i");
    await flush();
    stdin.write("\x13"); // Ctrl+S with empty title — behaves like cancel
    await flush();
    expect(createMock).not.toHaveBeenCalled();
    // Back in list mode — StatusBar's mode pill shows NORMAL.
    expect(lastFrame() ?? "").toContain("NORMAL");
  });

  test("? toggles the help overlay", async () => {
    const { api } = makeFakeApi([]);
    const { stdin, lastFrame } = mountApp(api);
    await flush();
    stdin.write("?");
    await flush();
    expect(lastFrame() ?? "").toContain("keybindings");
    stdin.write("?");
    await flush();
    expect(lastFrame() ?? "").not.toContain("keybindings");
  });

  // Regression guard for the Inbox→Private rename. The tab key (filter literal)
  // stays "inbox" but the visible label must read "Private" so users don't
  // mistake the personal todo bucket for an auto-created project. "All" used to
  // sit between Inbox and Done; both the new label and the absence of "All"
  // are checked here.
  test("Private tab is shown, All tab is gone", async () => {
    const { api } = makeFakeApi([makeTodo({ title: "x" })]);
    const { lastFrame } = mountApp(api);
    await flush();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Private");
    expect(frame).not.toMatch(/\bAll\b\s*\d/);
  });

  // `/` jumps from the main list to the dedicated SearchView. The view shows
  // the matched-count meta strip and filters live as the user types.
  test("/ opens search and narrows results by query", async () => {
    const { api } = makeFakeApi([
      makeTodo({ title: "buy milk" }),
      makeTodo({ title: "write code" }),
      makeTodo({ title: "design search" }),
    ]);
    const { stdin, lastFrame } = mountApp(api);
    await flush();
    stdin.write("/");
    await flush();
    // SearchView header + "3 todos total" meta line render on empty query.
    const opened = lastFrame() ?? "";
    expect(opened).toContain("Search");
    expect(opened).toContain("3 todos total");
    stdin.write("milk");
    await flush();
    const filtered = lastFrame() ?? "";
    expect(filtered).toContain("1 match");
    expect(filtered).toContain("buy milk");
    expect(filtered).not.toContain("write code");
  });

  // Pressing Enter on the search result opens the detail page for that row,
  // not for whatever the main-list cursor happens to be on.
  test("enter on a search result opens its todo detail", async () => {
    const { api } = makeFakeApi([
      makeTodo({ title: "alpha task" }),
      makeTodo({ title: "beta task" }),
    ]);
    const { stdin, lastFrame } = mountApp(api);
    await flush();
    stdin.write("/");
    await flush();
    stdin.write("beta");
    await flush();
    stdin.write("\r");
    await flush();
    const frame = lastFrame() ?? "";
    // TodoDetailView puts the title under a bold accent header inside the
    // "Todo" panel — match the panel chrome so we don't false-match against
    // the SearchView still rendering "beta" in a row.
    expect(frame).toContain("Todo");
    expect(frame).toContain("beta task");
    expect(frame).toContain("DESCRIPTION");
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
      // ~30s ago so relativeTime renders a stable "30s" or so.
      createdAt: String(Date.now() - 30_000),
    };
    const events: EventsApi = { list: async () => [event] };
    const { lastFrame } = mountApp(api, events);
    await flush();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("alice");
    expect(frame).toContain("fix login bug");
  });

  test("activity feed shows empty-state CTA without events", async () => {
    const { api } = makeFakeApi([]);
    const events: EventsApi = { list: async () => [] };
    const { lastFrame } = mountApp(api, events);
    await flush();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("no activity yet");
    expect(frame).toContain("invite teammates");
  });

  // With more todos than the viewport allows, the list slices to a window and
  // shows a "↓ more" hint. Cursor starts at 0, so a high-index title must not
  // be visible.
  test("long lists are windowed with a more-below indicator", async () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      makeTodo({ title: `task-${String(i).padStart(2, "0")}` }),
    );
    const { api } = makeFakeApi(many);
    const { lastFrame } = mountApp(api);
    await flush();
    const frame = lastFrame() ?? "";
    expect(frame).toContain("task-00");
    expect(frame).not.toContain("task-39");
    expect(frame).toMatch(/\d+ more ↓/);
  });
});
