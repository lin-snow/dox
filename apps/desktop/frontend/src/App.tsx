import { ApiError } from "@dox/core/browser";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  flatten,
  group,
  writeChecklist,
  readChecklist,
} from "./board";
import { ActivitySheet } from "./components/ActivitySheet";
import { Column } from "./components/Column";
import { Composer, type Draft } from "./components/Composer";
import { Onboarding } from "./components/Onboarding";
import { SearchOverlay } from "./components/SearchOverlay";
import { SettingsModal } from "./components/SettingsModal";
import { TopBar } from "./components/TopBar";
import { subscribe } from "./events";

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isUnauthorized = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

const EMPTY: Record<"later" | "week" | "today", string> = {
  later: "nothing unscheduled",
  week: "nothing this week",
  today: "all clear",
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
  const [todos, setTodos] = useState<Todo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  /** undefined: closed, null: new, todo: editing. */
  const [editing, setEditing] = useState<Todo | null | undefined>(undefined);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [booting, setBooting] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const now = useNow();

  const handleError = useCallback((caught: unknown) => {
    if (isUnauthorized(caught)) {
      setNotice("your session expired — sign in again");
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
    setProjects(projectList.filter((project) => !project.archived));
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
        setEditing(await api.todos.getTodo(id));
      });
    },
    [guard],
  );

  // Backend pushes: notification taps, tray "open", session changes.
  useEffect(() => {
    if (!session?.signedIn) return;
    return subscribe((event) => {
      if (event.type === "open") openTodo(event.todoId);
      if (event.type === "reminder" || event.type === "session") {
        void guard(refreshSession);
      }
    });
  }, [session?.signedIn, openTodo, guard, refreshSession]);

  const columns = useMemo(() => {
    const scoped =
      filter === "all"
        ? todos
        : todos.filter((todo) => todo.projectId === filter);
    return group(scoped, now);
  }, [filter, now, todos]);

  const ordered = useMemo(() => flatten(columns), [columns]);

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
        current && current.id === todo.id
          ? { ...current, done: next }
          : current,
      );
      try {
        // Field-level patch: never resend title/description, so a concurrent
        // edit from another client survives.
        await api.todos.updateTodo(todo.id, { done: next });
      } catch (caught) {
        setTodos(before);
        handleError(caught);
      }
    },
    [handleError, todos],
  );

  const patchTodo = useCallback(
    async (todo: Todo, body: TodoPatch) => {
      try {
        const updated = await api.todos.updateTodo(todo.id, body);
        setTodos((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        return updated;
      } catch (caught) {
        handleError(caught);
        throw caught;
      }
    },
    [handleError],
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
        });
        await refreshAll();
      } catch (caught) {
        handleError(caught);
        throw caught;
      }
    },
    [handleError, refreshAll],
  );

  const remove = useCallback(
    async (todo: Todo) => {
      try {
        await api.todos.deleteTodo(todo.id);
        setEditing(undefined);
        await refreshAll();
      } catch (caught) {
        handleError(caught);
        throw caught;
      }
    },
    [handleError, refreshAll],
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
    });
  }, [guard]);

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

  const archiveProject = useCallback(
    async (id: string) => {
      await guard(async () => {
        await api.projects.update(id, { archived: true });
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
      if (meta && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setEditing(null);
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
        setEditing(undefined);
        return;
      }
      if (typing) return;

      const index = ordered.findIndex((todo) => todo.id === cursorId);
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
  }, [cursorId, guard, openTodo, ordered, refreshAll, toggle]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 6000);
    return () => window.clearTimeout(timer);
  }, [error]);

  if (booting) {
    return (
      <div className="splash">
        <span className="mark">◆</span> loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="splash">
        <p className="error">
          {error || "the desktop backend is not answering"}
        </p>
      </div>
    );
  }

  if (!session.signedIn || !session.user) {
    return (
      <>
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
      <div className="drag" />
      <TopBar
        onSearch={() => setSearchOpen(true)}
        onActivity={() => setActivityOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      <div className="board">
        {BUCKETS.map((bucket, index) => (
          <Column
            key={bucket.key}
            label={bucket.label}
            count={counts[bucket.key]}
            todos={columns[bucket.key]}
            projects={projects}
            filter={filter}
            cursorId={cursorId}
            showFilters={index === 0}
            empty={EMPTY[bucket.key]}
            onFilter={chooseFilter}
            onCreateProject={(name) => void createProject(name, "")}
            onToggle={(todo) => void toggle(todo)}
            onOpen={(todo) => setEditing(todo)}
            onChecklist={toggleCheck}
          />
        ))}
      </div>

      {editing !== undefined ? (
        <Composer
          key={editing?.id ?? "new"}
          todo={editing}
          projects={projects}
          defaultProjectId={filter === "all" ? undefined : filter}
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
          onArchiveProject={archiveProject}
          onSignOut={signOut}
          onChangeServer={signOut}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {error ? (
        <button type="button" className="toast" onClick={() => setError("")}>
          {error}
        </button>
      ) : null}
    </div>
  );
}
