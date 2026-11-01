import { ApiError } from "@dox/core/browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  api,
  desktop,
  type ActivityEvent,
  type Prefs,
  type Project,
  type Session,
  type Todo,
  type TodoPatch,
} from "./api";
import {
  BUCKETS,
  bucketOf,
  dueForBucket,
  flatten,
  group,
  readChecklist,
  writeChecklist,
  type Bucket,
} from "./board";
import { ActivitySheet } from "./components/ActivitySheet";
import { Column } from "./components/Column";
import { Composer, type Draft } from "./components/Composer";
import { DoneView } from "./components/DoneView";
import { HelpSheet } from "./components/HelpSheet";
import { LiveRegion, useAnnouncer } from "./components/LiveRegion";
import { Onboarding } from "./components/Onboarding";
import { SearchOverlay } from "./components/SearchOverlay";
import { SettingsModal } from "./components/SettingsModal";
import { TopBar, type View } from "./components/TopBar";
import { subscribe } from "./events";

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

const EMPTY: Record<"later" | "week" | "today", string> = {
  later: "Nothing waiting",
  week: "Nothing this week",
  today: "All clear",
};

/** Re-bucket on the minute so "Today" stays true across midnight. */
function useNow(every = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(timer);
  }, [every]);
  return now;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({
    lastView: "all",
    notificationsEnabled: true,
  });
  const [filter, setFilter] = useState("all");
  /** Which list the window shows: the board, or the completed todos. */
  const [view, setView] = useState<View>("board");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  /** undefined: closed; todo: null means a new one, preset picks the column. */
  const [editing, setEditing] = useState<
    { todo: Todo | null; preset?: Bucket } | undefined
  >(undefined);
  const [helpOpen, setHelpOpen] = useState(false);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [booting, setBooting] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  /** Drag in flight: the row, plus where the pointer currently is. */
  const [drag, setDrag] = useState<{
    id: string;
    over: { id: string | null; bucket: Bucket };
  } | null>(null);

  const now = useNow();
  const { status, announce } = useAnnouncer();

  // The `notice` string is the other half-visible message in this app (the
  // toast is the first); it feeds the shared polite region rather than growing
  // a live region of its own.
  useEffect(() => {
    if (notice) announce(notice);
  }, [announce, notice]);

  const handleError = useCallback((caught: unknown) => {
    if (isUnauthorized(caught)) {
      setNotice("Your session expired. Sign in again.");
      setEditing(undefined);
      setSession((current) =>
        current ? { ...current, signedIn: false, user: null } : current,
      );
      return;
    }
    setError(message(caught));
  }, []);

  const guard = useCallback(
    async (action: () => Promise<void>) => {
      try {
        await action();
      } catch (caught) {
        handleError(caught);
      }
    },
    [handleError],
  );

  const refreshAll = useCallback(async () => {
    const [list, projectList, feed] = await Promise.all([
      // The board renders notes and checklists inline, so it asks for
      // descriptions the plain listing leaves out.
      api.todos.listTodos(undefined, { includeDescription: true }),
      api.projects.list(),
      api.events.list({ limit: 40 }),
    ]);
    setTodos(list);
    setProjects(projectList);
    setEvents(feed);
  }, []);

  const refreshSession = useCallback(async () => {
    setSession(await desktop.session());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [current, stored] = await Promise.all([
          desktop.session(),
          desktop.prefs(),
        ]);
        if (cancelled) return;
        setSession(current);
        setPrefs(stored);
        setFilter(
          stored.lastView?.startsWith("project:")
            ? stored.lastView.slice(8)
            : "all",
        );
        if (current.signedIn) await refreshAll();
      } catch (caught) {
        if (!cancelled) setError(message(caught));
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAll]);

  const openTodo = useCallback(
    (id: string) => {
      void guard(async () => {
        setEditing({ todo: await api.todos.getTodo(id) });
      });
    },
    [guard],
  );

  /**
   * Coalesce server-change wakeups: the backend long-polls the change counter,
   * so a burst of writes elsewhere arrives as several `data` frames within a
   * few milliseconds and must not become several full refetches.
   */
  const refreshTimer = useRef<number | undefined>(undefined);
  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      void guard(refreshAll);
    }, 150);
  }, [guard, refreshAll]);

  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);

  // Backend pushes: notification taps, tray "open", session changes, and — from
  // the change watcher — "the server has data you have not seen".
  useEffect(() => {
    if (!session?.signedIn) return;
    return subscribe((event) => {
      if (event.type === "open") openTodo(event.todoId);
      if (event.type === "data") scheduleRefresh();
      if (event.type === "reminder") {
        void guard(refreshSession);
        scheduleRefresh();
      }
      if (event.type === "session") void guard(refreshSession);
    });
  }, [session?.signedIn, openTodo, guard, refreshSession, scheduleRefresh]);

  const columns = useMemo(() => {
    // The board is open work only: a ticked todo moves to the Done view
    // instead of sitting inline. `todos` keeps everything, so search still
    // reaches a completed todo and the Done view needs no refetch.
    const open = todos.filter((todo) => !todo.done);
    const scoped =
      filter === "all"
        ? open
        : filter === "inbox"
          ? open.filter((todo) => !todo.projectId)
          : open.filter((todo) => todo.projectId === filter);
    return group(scoped, now);
  }, [filter, now, todos]);

  /** Completed todos, most recently ticked first. `updatedAt` is the closest
   * thing this resource has to "when it was completed", so it is the order the
   * Done view claims — nothing here is manual. */
  const doneTodos = useMemo(
    () =>
      todos
        .filter((todo) => todo.done)
        .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0)),
    [todos],
  );

  const ordered = useMemo(
    () => (view === "done" ? doneTodos : flatten(columns)),
    [columns, doneTodos, view],
  );

  const activeProjects = useMemo(
    () => projects.filter((project) => !project.archived),
    [projects],
  );

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );

  const counts = useMemo(() => {
    const open = (list: Todo[]) => list.filter((todo) => !todo.done).length;
    return {
      later: open(columns.later),
      week: open(columns.week),
      today: open(columns.today),
    };
  }, [columns]);

  const toggle = useCallback(
    async (todo: Todo) => {
      const next = !todo.done;
      const apply = (list: Todo[]) =>
        list.map((item) =>
          item.id === todo.id ? { ...item, done: next } : item,
        );
      const before = todos;
      setTodos(apply);
      setEditing((current) =>
        current?.todo?.id === todo.id
          ? { todo: { ...current.todo, done: next }, preset: current.preset }
          : current,
      );
      // The row leaves whichever list is on screen — into Done when ticked,
      // back to the board when reopened — so hand the cursor to the row that
      // takes its place rather than leaving the selection on something that is
      // no longer drawn.
      const leaving = view === "done" ? !next : next;
      if (leaving && cursorId === todo.id) {
        const rows = view === "done" ? doneTodos : columns[bucketOf(todo, now)];
        const at = rows.findIndex((item) => item.id === todo.id);
        setCursorId((rows[at + 1] ?? rows[at - 1])?.id ?? null);
      }
      try {
        // Field-level patch: never resend title/description, so a concurrent
        // edit from another client survives.
        await api.todos.updateTodo(todo.id, { done: next });
      } catch (caught) {
        setTodos(before);
        handleError(caught);
      }
    },
    [columns, cursorId, doneTodos, handleError, now, todos, view],
  );

  const patchTodo = useCallback(
    async (todo: Todo, body: TodoPatch) => {
      try {
        const updated = await api.todos.updateTodo(todo.id, body);
        setTodos((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        announce("saved");
        return updated;
      } catch (caught) {
        handleError(caught);
        throw caught;
      }
    },
    [announce, handleError],
  );

  /**
   * Reorder inside one list. Scopes matter: the board can show every project
   * at once, but MoveTodo renumbers a single scope, so a drop beside a row
   * from another project has no meaning and is refused rather than guessed.
   */
  const reorder = useCallback(
    async (moved: Todo, anchor?: Todo) => {
      if (anchor && (moved.projectId ?? "") !== (anchor.projectId ?? "")) {
        setNotice("Open a single project to reorder todos.");
        return;
      }
      await guard(async () => {
        await api.todos.moveTodo(moved.id, anchor?.id);
        await refreshAll();
        announce(`moved: ${moved.title}`);
      });
    },
    [announce, guard, refreshAll],
  );

  /** Drop = reorder inside a column, reschedule into another one. */
  const dropInto = useCallback(
    async (target: { id: string | null; bucket: Bucket }) => {
      const current = drag;
      setDrag(null);
      if (!current || current.id === target.id) return;
      const moved = todos.find((todo) => todo.id === current.id);
      if (!moved) return;

      if (bucketOf(moved, now) !== target.bucket) {
        await guard(async () => {
          await api.todos.updateTodo(
            moved.id,
            dueForBucket(target.bucket, now),
          );
          await refreshAll();
          announce(`rescheduled: ${moved.title}`);
        });
        return;
      }

      const rows = columns[target.bucket].filter((t) => t.id !== moved.id);
      if (target.id === null) {
        await reorder(moved, rows[rows.length - 1]);
        return;
      }
      // The indicator sits above the row under the pointer, so the anchor is
      // that row's predecessor -- or nothing, for the top of the column.
      const at = rows.findIndex((t) => t.id === target.id);
      await reorder(moved, at <= 0 ? undefined : rows[at - 1]);
    },
    [announce, columns, drag, guard, now, refreshAll, reorder, todos],
  );

  const create = useCallback(
    async (draft: Draft) => {
      try {
        await api.todos.createTodo(draft.title, {
          description: draft.description || undefined,
          projectId: draft.projectId,
          dueAt: draft.dueAt ?? undefined,
          dueAllDay: draft.dueAt ? !!draft.dueAllDay : undefined,
          dueZone: draft.dueAt ? (draft.dueZone ?? "") : undefined,
          remindAt: draft.remindAt,
          startsAt: draft.startsAt,
          endsAt: draft.endsAt,
        });
        await refreshAll();
        announce(`created: ${draft.title}`);
      } catch (caught) {
        handleError(caught);
        throw caught;
      }
    },
    [announce, handleError, refreshAll],
  );

  const remove = useCallback(
    async (todo: Todo) => {
      try {
        await api.todos.deleteTodo(todo.id);
        setEditing(undefined);
        await refreshAll();
        announce(`deleted: ${todo.title}`);
      } catch (caught) {
        handleError(caught);
        throw caught;
      }
    },
    [announce, handleError, refreshAll],
  );

  const toggleCheck = useCallback(
    (todo: Todo, index: number) => {
      const items = readChecklist(todo.description);
      if (!items) return;
      const next = items.map((item, at) =>
        at === index ? { ...item, done: !item.done } : item,
      );
      void guard(async () => {
        await patchTodo(todo, { description: writeChecklist(next) });
      });
    },
    [guard, patchTodo],
  );

  const chooseFilter = useCallback((id: string) => {
    setFilter(id);
    setCursorId(null);
    void desktop
      .savePrefs({ lastView: id === "all" ? "all" : `project:${id}` })
      .catch(() => {
        /* prefs are best-effort; the app works without them */
      });
  }, []);

  /** Switching lists clears the cursor and any drag: both are scoped to the
   * list that was on screen, and a selection pointing at a row the new list
   * does not draw would make the arrow keys jump. */
  const switchView = useCallback(
    (next: View) => {
      setView(next);
      setCursorId(null);
      setDrag(null);
      announce(next === "done" ? "showing done" : "showing board");
    },
    [announce],
  );

  const signedIn = useCallback(
    (next: Session) => {
      setSession(next);
      setNotice("");
      setEditing(undefined);
      void guard(refreshAll);
    },
    [guard, refreshAll],
  );

  const signOut = useCallback(async () => {
    setSettingsOpen(false);
    await guard(async () => {
      setSession(await desktop.signOut());
      setTodos([]);
      setProjects([]);
      setEvents([]);
      setEditing(undefined);
      announce("signed out");
    });
  }, [announce, guard]);

  const savePrefs = useCallback(
    async (patch: Partial<Prefs>) => {
      setPrefs((current) => ({ ...current, ...patch }));
      await guard(async () => {
        setPrefs(await desktop.savePrefs(patch));
      });
    },
    [guard],
  );

  const createProject = useCallback(
    async (name: string, color: string) => {
      await guard(async () => {
        await api.projects.create({ name, color });
        await refreshAll();
      });
    },
    [guard, refreshAll],
  );

  const renameProject = useCallback(
    async (id: string, name: string) => {
      await guard(async () => {
        await api.projects.update(id, { name });
        await refreshAll();
      });
    },
    [guard, refreshAll],
  );

  const setArchived = useCallback(
    async (id: string, archived: boolean) => {
      await guard(async () => {
        await api.projects.update(id, { archived });
        if (archived && filter === id) chooseFilter("all");
        await refreshAll();
      });
    },
    [chooseFilter, filter, guard, refreshAll],
  );

  // Deleting a project also deletes its todos (the schema cascades), so the
  // settings row asks for a second click first.
  const deleteProject = useCallback(
    async (id: string) => {
      await guard(async () => {
        await api.projects.remove(id);
        if (filter === id) chooseFilter("all");
        await refreshAll();
      });
    },
    [chooseFilter, filter, guard, refreshAll],
  );

  // Keyboard: vim-ish navigation plus the shortcuts a desktop app is expected
  // to have. Ignored while typing so forms behave normally.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        switchView(view === "done" ? "board" : "done");
        return;
      }
      if (meta && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setEditing({ todo: null });
        return;
      }
      if (meta && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void guard(refreshAll);
        return;
      }
      if (meta && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setSettingsOpen(false);
        setActivityOpen(false);
        setHelpOpen(false);
        setEditing(undefined);
        return;
      }
      if (typing) return;

      // A dialog owns the keyboard while it is open. Without this, a cursor
      // key pressed on a dialog button would move the board selection behind
      // the dialog, and `n` would stack a second composer on the first.
      if (
        editing !== undefined ||
        searchOpen ||
        settingsOpen ||
        activityOpen ||
        helpOpen
      ) {
        return;
      }

      if (event.key === "n") {
        event.preventDefault();
        setEditing({ todo: null });
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }

      const index = ordered.findIndex((todo) => todo.id === cursorId);

      // Alt+arrows are the keyboard equivalent of a drag: same reorder, same
      // server call, so the feature is not pointer-only. Only the board has an
      // order to set; the Done list is sorted by recency.
      if (
        view === "board" &&
        event.altKey &&
        (event.key === "ArrowDown" || event.key === "ArrowUp")
      ) {
        event.preventDefault();
        const target = ordered.find((todo) => todo.id === cursorId);
        if (!target) return;
        const rows = columns[bucketOf(target, now)];
        const at = rows.findIndex((todo) => todo.id === target.id);
        if (event.key === "ArrowDown") {
          if (at >= rows.length - 1) return;
          void reorder(target, rows[at + 1]);
        } else {
          void reorder(target, at <= 1 ? undefined : rows[at - 2]);
        }
        return;
      }

      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        const next = ordered[Math.min(index + 1, ordered.length - 1)];
        if (next) setCursorId(next.id);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        const next = ordered[Math.max(index - 1, 0)];
        if (next) setCursorId(next.id);
        return;
      }
      if (event.key === "Enter" && cursorId) {
        openTodo(cursorId);
        return;
      }
      if (event.key === " ") {
        const target0 = ordered.find((todo) => todo.id === cursorId);
        if (target0) {
          event.preventDefault();
          void toggle(target0);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activityOpen,
    columns,
    cursorId,
    editing,
    guard,
    helpOpen,
    now,
    openTodo,
    ordered,
    refreshAll,
    reorder,
    searchOpen,
    settingsOpen,
    switchView,
    toggle,
    view,
  ]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  if (booting) {
    return (
      <>
        <LiveRegion status={status} alert={error} />
        <div className="splash">
          <img className="brand-mark" src="/dox.png" alt="" />
          <span>Loading…</span>
        </div>
      </>
    );
  }

  if (!session) {
    return (
      <>
        <LiveRegion status={status} alert={error} />
        <div className="splash">
          <p className="error">{error || "Can't reach the server."}</p>
        </div>
      </>
    );
  }

  if (!session.signedIn || !session.user) {
    return (
      <>
        {/* The signed-out root keeps its own region: App remounts between
            branches, and a live region only announces what changes while it
            is on screen. */}
        <LiveRegion status={status} alert={error} />
        <Onboarding
          initialServer={session.server}
          notice={notice}
          onDone={signedIn}
        />
        {error ? (
          <button type="button" className="toast" onClick={() => setError("")}>
            {error}
          </button>
        ) : null}
      </>
    );
  }

  const canManageProjects = session.user.role === "owner";

  return (
    <div className="app">
      <LiveRegion status={status} alert={error} />
      {/* One hint for every row: each row points here with aria-describedby,
          so the equivalent of a drag is spoken once instead of three times per
          column. */}
      <p id="task-reorder-hint" className="sr-only">
        Draggable. Or select it with j and k, then press Alt with the up or down
        arrow to move it within its column.
      </p>
      <div className="drag" />
      <TopBar
        view={view}
        doneCount={doneTodos.length}
        onView={switchView}
        onSearch={() => setSearchOpen(true)}
        onActivity={() => setActivityOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      {view === "done" ? (
        <DoneView
          todos={doneTodos}
          projects={activeProjects}
          cursorId={cursorId}
          onToggle={(todo) => void toggle(todo)}
          onOpen={(todo) => setEditing({ todo })}
          onChecklist={toggleCheck}
        />
      ) : (
        <div className="board">
          {BUCKETS.map((bucket, index) => (
            <Column
              key={bucket.key}
              bucket={bucket.key}
              label={bucket.label}
              count={counts[bucket.key]}
              todos={columns[bucket.key]}
              projects={activeProjects}
              filter={filter}
              cursorId={cursorId}
              showFilters={index === 0}
              empty={EMPTY[bucket.key]}
              addLabel="New todo"
              dragId={drag?.id ?? null}
              dropOver={drag?.over ?? null}
              onFilter={chooseFilter}
              onCreateProject={(name) => void createProject(name, "")}
              onAdd={() => setEditing({ todo: null, preset: bucket.key })}
              onToggle={(todo) => void toggle(todo)}
              onOpen={(todo) => setEditing({ todo })}
              onChecklist={toggleCheck}
              onDragStart={(todo) =>
                setDrag({ id: todo.id, over: { id: null, bucket: bucket.key } })
              }
              onDragOverRow={(todo) =>
                setDrag((current) =>
                  current
                    ? { ...current, over: { id: todo.id, bucket: bucket.key } }
                    : current,
                )
              }
              onDragOverColumn={() =>
                setDrag((current) =>
                  current
                    ? { ...current, over: { id: null, bucket: bucket.key } }
                    : current,
                )
              }
              onDropRow={(todo) =>
                void dropInto({ id: todo.id, bucket: bucket.key })
              }
              onDropColumn={() =>
                void dropInto({ id: null, bucket: bucket.key })
              }
              onDragEnd={() => setDrag(null)}
            />
          ))}
        </div>
      )}

      {editing !== undefined ? (
        <Composer
          key={editing.todo?.id ?? "new"}
          todo={editing.todo}
          preset={editing.preset}
          projects={activeProjects}
          defaultProjectId={
            filter === "all" || filter === "inbox" ? undefined : filter
          }
          onClose={() => setEditing(undefined)}
          onCreate={create}
          onPatch={patchTodo}
          onDelete={remove}
        />
      ) : null}

      {searchOpen ? (
        <SearchOverlay
          todos={todos}
          projects={projectById}
          onOpen={(id) => {
            setSearchOpen(false);
            openTodo(id);
          }}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}

      {activityOpen ? (
        <ActivitySheet
          events={events}
          onRefresh={() => void guard(refreshAll)}
          onClose={() => setActivityOpen(false)}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsModal
          session={session}
          prefs={prefs}
          projects={projects}
          canManageProjects={canManageProjects}
          onPrefs={savePrefs}
          onRenameProject={renameProject}
          onArchiveProject={(id) => setArchived(id, true)}
          onRestoreProject={(id) => setArchived(id, false)}
          onDeleteProject={deleteProject}
          onSignOut={signOut}
          onChangeServer={signOut}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {helpOpen ? <HelpSheet onClose={() => setHelpOpen(false)} /> : null}

      {error ? (
        <button type="button" className="toast" onClick={() => setError("")}>
          {error}
        </button>
      ) : null}
    </div>
  );
}
