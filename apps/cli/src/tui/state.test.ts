import { describe, expect, test } from "bun:test";

import type { Todo } from "@dox/core";

import { initialState, reducer, visibleTodos, type State } from "./state";

// Pure reducer tests — no Ink, no async, no polling. Most of the behavior the
// TUI surfaces (cursor movement, filter cycling, mode transitions, list
// recomputation on toggle/delete) is encoded here and runs in microseconds.
// The companion App.test.tsx keeps only a handful of smokes that verify the
// keymap + Ink + async-API wiring actually reaches these actions.

let idCounter = 0;
function todo(overrides: Partial<Todo> = {}): Todo {
  idCounter += 1;
  return {
    id: `01T${String(idCounter).padStart(23, "0")}`,
    title: `todo-${idCounter}`,
    done: false,
    createdAt: "1715856000000",
    updatedAt: "1715856000000",
    createdBy: "test-user",
    ...overrides,
  };
}

// Compose dispatches without rewriting the boilerplate `s = reducer(s, …)` on
// every line. Mirrors how a component would step through actions over time.
function applyAll(
  state: State,
  actions: Parameters<typeof reducer>[1][],
): State {
  return actions.reduce(reducer, state);
}

describe("reducer / loading", () => {
  test("TODOS_LOADED replaces todos and clears loading", () => {
    const s = reducer(initialState, {
      type: "TODOS_LOADED",
      todos: [todo({ title: "a" }), todo({ title: "b" })],
    });
    expect(s.loading).toBe(false);
    expect(s.todos.map((t) => t.title)).toEqual(["a", "b"]);
  });

  test("TODOS_LOADED reclamps cursor when prior selection no longer exists", () => {
    const seeded = applyAll(initialState, [
      { type: "TODOS_LOADED", todos: [todo(), todo(), todo()] },
      { type: "CURSOR_LAST" },
    ]);
    expect(seeded.cursor).toBe(2);
    const trimmed = reducer(seeded, { type: "TODOS_LOADED", todos: [todo()] });
    expect(trimmed.cursor).toBe(0);
  });
});

describe("reducer / cursor", () => {
  const seed = (n: number) =>
    reducer(initialState, {
      type: "TODOS_LOADED",
      todos: Array.from({ length: n }, () => todo()),
    });

  test("CURSOR_DOWN advances and clamps at last", () => {
    const s = applyAll(seed(2), [
      { type: "CURSOR_DOWN" },
      { type: "CURSOR_DOWN" },
    ]);
    expect(s.cursor).toBe(1);
  });

  test("CURSOR_UP retreats and clamps at zero", () => {
    const s = applyAll(seed(2), [{ type: "CURSOR_UP" }]);
    expect(s.cursor).toBe(0);
  });

  test("CURSOR_FIRST / CURSOR_LAST jump to bounds", () => {
    const last = reducer(seed(3), { type: "CURSOR_LAST" });
    expect(last.cursor).toBe(2);
    const first = reducer(last, { type: "CURSOR_FIRST" });
    expect(first.cursor).toBe(0);
  });
});

describe("reducer / filters", () => {
  test("FILTER_CYCLE walks inbox → done with no projects (single hop)", () => {
    const s = reducer(initialState, { type: "FILTER_CYCLE", direction: 1 });
    expect(s.filter).toBe("done");
    const back = reducer(s, { type: "FILTER_CYCLE", direction: 1 });
    expect(back.filter).toBe("inbox");
  });

  test("visibleTodos filters by Private / Done / project", () => {
    const open = todo({ title: "open", done: false });
    const closed = todo({ title: "closed", done: true });
    const projOpen = todo({ title: "p-open", done: false, projectId: "p1" });
    const base = reducer(initialState, {
      type: "TODOS_LOADED",
      todos: [open, closed, projOpen],
    });

    expect(visibleTodos(base).map((t) => t.title)).toEqual(["open"]);
    expect(
      visibleTodos({ ...base, filter: "done" }).map((t) => t.title),
    ).toEqual(["closed"]);
    expect(
      visibleTodos({
        ...base,
        filter: { type: "project", id: "p1" },
      }).map((t) => t.title),
    ).toEqual(["p-open"]);
  });

  test("Done filter sorts most-recently-completed first", () => {
    const older = todo({ done: true, updatedAt: "1000", title: "older" });
    const newer = todo({ done: true, updatedAt: "2000", title: "newer" });
    const s = applyAll(initialState, [
      { type: "TODOS_LOADED", todos: [older, newer] },
      { type: "FILTER_CYCLE", direction: 1 },
    ]);
    expect(s.filter).toBe("done");
    expect(visibleTodos(s).map((t) => t.title)).toEqual(["newer", "older"]);
  });
});

describe("reducer / mutations", () => {
  test("TODO_ADDED prepends and resets cursor", () => {
    const s = applyAll(initialState, [
      { type: "TODOS_LOADED", todos: [todo({ title: "old" })] },
      { type: "CURSOR_LAST" },
      { type: "TODO_ADDED", todo: todo({ title: "new" }) },
    ]);
    expect(s.todos[0]?.title).toBe("new");
    expect(s.cursor).toBe(0);
    expect(s.mode).toBe("list");
  });

  test("TODO_UPDATED done=true drops row from Private list and reclamps", () => {
    const open = todo({ title: "open" });
    const s = applyAll(initialState, [
      { type: "TODOS_LOADED", todos: [open, todo({ title: "other" })] },
      { type: "CURSOR_LAST" },
      { type: "TODO_UPDATED", todo: { ...open, done: true } },
    ]);
    expect(visibleTodos(s).map((t) => t.title)).toEqual(["other"]);
    expect(s.cursor).toBe(0);
  });

  test("TODO_UPDATED preserves cached description when patch omits it", () => {
    const t = todo({ title: "x", description: "body" });
    const s = applyAll(initialState, [
      { type: "TODOS_LOADED", todos: [t] },
      { type: "TODO_UPDATED", todo: { ...t, title: "renamed" } },
    ]);
    expect(s.todos[0]?.title).toBe("renamed");
    expect(s.todos[0]?.description).toBe("body");
  });

  test("TODO_DELETED removes and reclamps cursor", () => {
    const a = todo();
    const b = todo();
    const s = applyAll(initialState, [
      { type: "TODOS_LOADED", todos: [a, b] },
      { type: "CURSOR_LAST" },
      { type: "TODO_DELETED", id: b.id },
    ]);
    expect(s.todos).toHaveLength(1);
    expect(s.cursor).toBe(0);
  });
});

describe("reducer / modes", () => {
  test("ENTER_ADD / EXIT_MODE round-trip", () => {
    const opened = reducer(initialState, { type: "ENTER_ADD" });
    expect(opened.mode).toBe("add");
    const closed = reducer(opened, { type: "EXIT_MODE" });
    expect(closed.mode).toBe("list");
  });

  test("ENTER_EDIT seeds title + description", () => {
    const s = reducer(initialState, {
      type: "ENTER_EDIT",
      id: "01T",
      initialTitle: "hello",
      initialDescription: "world",
    });
    expect(s.mode).toBe("edit");
    expect(s.editingId).toBe("01T");
    expect(s.editingTitle).toBe("hello");
    expect(s.editingDescription).toBe("world");
  });

  test("TOGGLE_HELP flips the overlay", () => {
    const open = reducer(initialState, { type: "TOGGLE_HELP" });
    expect(open.helpOpen).toBe(true);
    const close = reducer(open, { type: "TOGGLE_HELP" });
    expect(close.helpOpen).toBe(false);
  });

  test("OPEN_SEARCH resets query/cursor; SEARCH_SET_QUERY also resets cursor", () => {
    const opened = applyAll(initialState, [
      { type: "OPEN_SEARCH" },
      { type: "SEARCH_CURSOR_DOWN" },
      { type: "SEARCH_CURSOR_DOWN" },
    ]);
    expect(opened.searchCursor).toBe(2);
    const typed = reducer(opened, { type: "SEARCH_SET_QUERY", query: "abc" });
    expect(typed.searchQuery).toBe("abc");
    expect(typed.searchCursor).toBe(0);
  });
});

describe("reducer / toast", () => {
  test("TOAST_SET / TOAST_CLEAR round-trip", () => {
    const t = todo({ title: "milk" });
    const set = reducer(initialState, {
      type: "TOAST_SET",
      toast: {
        kind: "doneToggled",
        todoId: t.id,
        title: t.title,
        prevDone: false,
        expiresAt: Date.now() + 5000,
      },
    });
    expect(set.toast?.title).toBe("milk");
    const cleared = reducer(set, { type: "TOAST_CLEAR" });
    expect(cleared.toast).toBe(null);
  });
});
