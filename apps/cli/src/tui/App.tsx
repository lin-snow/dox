import { Box, Text, useApp, useInput, useStdout } from "ink";
import { Spinner } from "@inkjs/ui";
import { homedir } from "node:os";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import type { EventsApi, Project, ServerInfo, Todo, TodoApi } from "@dox/core";
import { fetchServerInfo } from "@dox/core";

import { ActivityFeed } from "./components/ActivityFeed";
import { DualBarChart } from "./components/DualBarChart";
import { ErrorAlert } from "./components/ErrorAlert";
import { Footer } from "./components/Footer";
import { HelpOverlay } from "./components/HelpOverlay";
import { Logo } from "./components/Logo";
import { SearchView } from "./components/SearchView";
import { SettingsView } from "./components/SettingsView";
import { Tabs } from "./components/Tabs";
import { TitledPanel } from "./components/TitledPanel";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ProjectEditorView } from "./components/ProjectEditorView";
import { TodoDetailView } from "./components/TodoDetailView";
import { TodoEditorView } from "./components/TodoEditorView";
import { TodoInfo } from "./components/TodoInfo";
import { relativeTime, swatchColor } from "./util";
import { buildSettingsTabs } from "./settings";
import { color, icon } from "./theme";
import {
  filterList,
  initialState,
  reducer,
  visibleTodos,
} from "./state";
import type { Filter } from "./components/Sidebar";
import { filterKey } from "./components/Sidebar";

const POLL_INTERVAL_MS = 30_000;
// Activity feed updates passively; a slower cadence keeps the events query
// load proportional to its UX value (a glance, not the working surface).
const EVENTS_POLL_INTERVAL_MS = 60_000;
const VERSION = "v0.0.0";
const ACTIVITY_DAYS = 14;

interface ProjectsApi {
  list(): Promise<Project[]>;
  create(args: { name: string; description?: string; color?: string }): Promise<Project>;
  remove(id: string): Promise<void>;
}

interface AppProps {
  api: TodoApi;
  projects?: ProjectsApi;
  events?: EventsApi;
  identity?: { userName?: string; server?: string; configPath?: string };
}

export function App({ api, projects, events, identity }: AppProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const { exit } = useApp();
  const { stdout } = useStdout();
  const totalCols = stdout?.columns ?? 100;
  const totalRows = stdout?.rows ?? 40;

  const refresh = useCallback(async () => {
    dispatch({ type: "SYNC_START" });
    try {
      const [todos, projectList] = await Promise.all([
        api.listTodos(),
        projects ? projects.list() : Promise.resolve<Project[]>([]),
      ]);
      dispatch({ type: "TODOS_LOADED", todos });
      if (projects) dispatch({ type: "PROJECTS_LOADED", projects: projectList });
    } catch (err) {
      dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
    } finally {
      dispatch({ type: "SYNC_END" });
    }
  }, [api, projects]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Separate, slower poll for the activity feed — see EVENTS_POLL_INTERVAL_MS.
  // Silently swallows errors so a 500 on /v1/events doesn't paint a banner over
  // the main todos view; the panel just keeps showing the last good snapshot.
  const refreshEvents = useCallback(async () => {
    if (!events) return;
    try {
      const list = await events.list();
      dispatch({ type: "EVENTS_LOADED", events: list });
    } catch {
      // Intentional: events are a non-critical sidebar; main flows keep working.
    }
  }, [events]);

  useEffect(() => {
    if (!events) return;
    void refreshEvents();
    const timer = setInterval(() => void refreshEvents(), EVENTS_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [events, refreshEvents]);

  // One-shot fetch: server build identity doesn't change at runtime, so we
  // don't poll. Failures stay silent — the Status panel just shows "—" until a
  // future mount succeeds.
  useEffect(() => {
    const url = identity?.server;
    if (!url) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await fetchServerInfo(url);
        if (!cancelled) setServerInfo(info);
      } catch {
        // Intentionally swallow — the panel renders a placeholder when null.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity?.server]);

  // ── description hydration ───────────────────────────────────────────────
  // ListTodos omits the description body, so any UI that wants to display
  // markdown (TodoDetailView, TodoEditorView seed) has to issue a GetTodo
  // first. We funnel that through these two helpers so the cache merge logic
  // lives in exactly one place.
  const hydrateTodoDescription = useCallback(
    async (id: string) => {
      try {
        const full = await api.getTodo(id);
        dispatch({ type: "TODO_UPDATED", todo: full });
      } catch (err) {
        dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
      }
    },
    [api],
  );
  const enterEditWithFullTodo = useCallback(
    async (id: string, fallbackTitle: string, cachedDescription?: string) => {
      // Optimistically open the editor with whatever we already know so the
      // user doesn't stare at a loading state for one round-trip.
      dispatch({
        type: "ENTER_EDIT",
        id,
        initialTitle: fallbackTitle,
        initialDescription: cachedDescription ?? "",
      });
      // Then upgrade with the server-canonical description if we didn't have
      // one cached yet. Re-dispatching ENTER_EDIT replaces the seed values.
      if (cachedDescription !== undefined) return;
      try {
        const full = await api.getTodo(id);
        dispatch({
          type: "ENTER_EDIT",
          id: full.id,
          initialTitle: full.title,
          initialDescription: full.description ?? "",
        });
      } catch (err) {
        dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
      }
    },
    [api],
  );

  // Background-hydrate descriptions when the user opens search. ListTodos
  // omits the description body, so without this the search would only match
  // titles. We fire one getTodo per row in parallel; the cache merge in
  // TODO_UPDATED makes the result list reactively pick up matches as bodies
  // land. `hydrating` flips false once every request settles so SearchView can
  // show a "loading descriptions…" hint while it's true.
  const [hydratingSearch, setHydratingSearch] = useState(false);
  useEffect(() => {
    if (state.mode !== "search") return;
    const missing = state.todos.filter((t) => t.description === undefined);
    if (missing.length === 0) return;
    setHydratingSearch(true);
    let cancelled = false;
    void (async () => {
      await Promise.all(
        missing.map(async (t) => {
          try {
            const full = await api.getTodo(t.id);
            if (!cancelled) dispatch({ type: "TODO_UPDATED", todo: full });
          } catch {
            // Silently skip — a failed hydrate just means that one row stays
            // title-only for matching, not a fatal error.
          }
        }),
      );
      if (!cancelled) setHydratingSearch(false);
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally only depend on mode + api: re-running on every todos
    // mutation would re-fetch rows we just updated. New rows created while in
    // search mode will be hydrated next time the user re-enters search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, api]);

  const visible = useMemo(() => visibleTodos(state), [state]);
  const createdSeries = useMemo(
    () => activityByDay(state.todos, ACTIVITY_DAYS, "created"),
    [state.todos],
  );
  const doneSeries = useMemo(
    () => activityByDay(state.todos, ACTIVITY_DAYS, "done"),
    [state.todos],
  );

  // Help overlay swallows everything except its own toggles.
  useInput(
    (input, key) => {
      if (input === "?" || key.escape) dispatch({ type: "CLOSE_HELP" });
    },
    { isActive: state.helpOpen },
  );

  useInput(
    (input, key) => {
      if (state.helpOpen) return;
      if (input === "q" || (key.ctrl && input === "c")) {
        exit();
        return;
      }
      if (input === "?") {
        dispatch({ type: "TOGGLE_HELP" });
        return;
      }
      if (input === "s") {
        dispatch({ type: "OPEN_SETTINGS" });
        return;
      }
      if (input === "/") {
        dispatch({ type: "OPEN_SEARCH" });
        return;
      }
      if (state.error) dispatch({ type: "CLEAR_ERROR" });
      if (input === "j" || key.downArrow) return dispatch({ type: "CURSOR_DOWN" });
      if (input === "k" || key.upArrow) return dispatch({ type: "CURSOR_UP" });
      if (input === "g") return dispatch({ type: "CURSOR_FIRST" });
      if (input === "G") return dispatch({ type: "CURSOR_LAST" });
      if (key.tab || input === "h" || input === "l" || key.leftArrow || key.rightArrow) {
        const dir = input === "h" || key.leftArrow ? -1 : 1;
        return dispatch({ type: "FILTER_CYCLE", direction: dir as 1 | -1 });
      }
      if (input === "r") return void refresh();

      if (input === "i" || input === "a") return dispatch({ type: "ENTER_ADD" });
      if (input === "p" && projects) return dispatch({ type: "ENTER_PROJECT_ADD" });
      if (
        input === "D" &&
        projects &&
        typeof state.filter !== "string" &&
        state.filter.type === "project"
      ) {
        return dispatch({ type: "ENTER_PROJECT_DELETE_CONFIRM", id: state.filter.id });
      }

      const current = visible[state.cursor];
      if (!current) return;
      if (key.return) {
        dispatch({ type: "OPEN_TODO_DETAIL" });
        // The list payload omits description; fetch the full row so the
        // detail view can render the markdown body on this same render pass
        // once the request resolves.
        void hydrateTodoDescription(current.id);
        return;
      }
      if (input === " ") {
        void (async () => {
          try {
            const updated = await api.updateTodo(current.id, { done: !current.done });
            dispatch({ type: "TODO_UPDATED", todo: updated });
          } catch (err) {
            dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
          }
        })();
      } else if (input === "d") {
        void (async () => {
          try {
            await api.deleteTodo(current.id);
            dispatch({ type: "TODO_DELETED", id: current.id });
          } catch (err) {
            dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
          }
        })();
      } else if (input === "e") {
        void enterEditWithFullTodo(current.id, current.title, current.description);
      }
    },
    { isActive: state.mode === "list" },
  );

  // Yes/no input for the delete-project confirmation. Y deletes; N/Esc bails.
  useInput(
    (input, key) => {
      const id = state.deletingProjectId;
      if (!id || !projects) {
        dispatch({ type: "EXIT_MODE" });
        return;
      }
      if (input === "y" || input === "Y") {
        void (async () => {
          try {
            await projects.remove(id);
            dispatch({ type: "PROJECT_DELETED", id });
          } catch (err) {
            dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
            dispatch({ type: "EXIT_MODE" });
          }
        })();
        return;
      }
      if (input === "n" || input === "N" || key.escape) {
        dispatch({ type: "EXIT_MODE" });
      }
    },
    { isActive: state.mode === "projectConfirmDelete" },
  );

  const handleSubmit = (payload: { title: string; description: string }) => {
    const title = payload.title.trim();
    if (!title) {
      dispatch({ type: "EXIT_MODE" });
      return;
    }
    // The form field always returns a string; "" means "no description".
    // On create, we only send it when non-empty (otherwise the server applies
    // its default of NULL). On edit, we always send it so an emptied-out field
    // clears any existing body.
    const description = payload.description;
    if (state.mode === "add") {
      const projectId = activeProjectId(state.filter);
      const opts: { projectId?: string; description?: string } = {};
      if (projectId) opts.projectId = projectId;
      if (description.length > 0) opts.description = description;
      void (async () => {
        try {
          const todo = await api.createTodo(title, opts);
          dispatch({ type: "TODO_ADDED", todo });
        } catch (err) {
          dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
        }
      })();
    } else if (state.mode === "edit" && state.editingId) {
      const id = state.editingId;
      void (async () => {
        try {
          const updated = await api.updateTodo(id, { title, description });
          dispatch({ type: "TODO_UPDATED", todo: updated });
          dispatch({ type: "EXIT_MODE" });
        } catch (err) {
          dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
        }
      })();
    }
  };

  // ── layout widths ─────────────────────────────────────────────────────────
  // Two columns side-by-side. Left column stacks the Server|Status header row
  // on top of a tall Todos list. Right column has a tall combined Activity
  // panel on top (chart + Recent feed inside one TitledPanel) with the
  // contextual Todo Info below it. Subtract 2 cols for outer paddingX={1}.
  const usable = Math.max(60, totalCols - 2);
  const colGap = 2;
  const leftColW = Math.max(40, Math.floor(usable * 0.6));
  const rightColW = Math.max(30, usable - leftColW - colGap);
  const topGap = 2;
  const topCombined = leftColW - topGap;
  // Server panel needs to fit the 23-cell-wide logo + 1-cell padding either
  // side + 1-cell border either side → minimum width 27.
  const serverW = Math.max(27, Math.floor(topCombined * 0.46));
  const statusW = Math.max(26, topCombined - serverW);

  // ── layout heights ────────────────────────────────────────────────────────
  // Grow with the terminal so a tall window translates directly into a taller
  // Todos viewport. Reserves a few rows for the footer + outer padding so the
  // bottom panels don't push the footer off-screen.
  const innerH = Math.max(32, totalRows - 4);
  const topRowH = 14;
  const rowGap = 1;
  const todosH = Math.max(18, innerH - topRowH - rowGap);
  // Right column splits into Activity (top, taller than topRowH but capped so
  // it doesn't dominate) and TodoInfo (bottom, absorbs the rest). Sums to
  // innerH so both columns end on the same row.
  const todoInfoH = Math.max(11, Math.min(18, Math.floor(innerH * 0.38)));
  const activityH = Math.max(15, innerH - todoInfoH - rowGap);

  const activeTab = filterToTabKey(state.filter);
  const projectById = useMemo(
    () => new Map(state.projects.map((p) => [p.id, p])),
    [state.projects],
  );
  const totalCount = state.todos.length;
  const doneCount = state.todos.filter((t) => t.done).length;
  const openCount = totalCount - doneCount;
  const nowMs = Date.now();

  const showSpinner = state.loading && state.todos.length === 0;

  // ── Todos list viewport ───────────────────────────────────────────────────
  // Panel chrome above the list eats: border-top 1 + paddingY-top 1 + meta 1
  // + marginTop 1 + tabs 1 + marginTop 1 = 6, plus paddingY-bottom 1 +
  // border-bottom 1 = 2 below — 8 rows total. Capping the rendered slice to
  // what fits keeps the panel from pushing the footer off-screen.
  const LIST_VIEWPORT_H = Math.max(5, todosH - 8);
  const listWindow = sliceWindow(visible, state.cursor, LIST_VIEWPORT_H);

  // Full-screen settings view replaces the main grid when active. Kept as an
  // early return so we don't have to gate every grid sub-render below.
  if (state.mode === "settings") {
    const tabs = buildSettingsTabs({
      server: identity?.server,
      userName: identity?.userName,
      pollIntervalMs: POLL_INTERVAL_MS,
    });
    return (
      <SettingsView
        tabs={tabs}
        activeTabIndex={Math.min(state.settingsTab, tabs.length - 1)}
        cursor={state.settingsCursor}
        onTabChange={(i) => dispatch({ type: "SETTINGS_TAB", index: i })}
        onCursorChange={(i) => dispatch({ type: "SETTINGS_CURSOR", index: i })}
        onClose={() => dispatch({ type: "CLOSE_SETTINGS" })}
      />
    );
  }

  if (state.mode === "add" || state.mode === "edit") {
    const editingTodo =
      state.mode === "edit" && state.editingId
        ? state.todos.find((t) => t.id === state.editingId) ?? null
        : null;
    return (
      <TodoEditorView
        mode={state.mode}
        defaultTitle={state.mode === "edit" ? state.editingTitle : undefined}
        defaultDescription={
          state.mode === "edit"
            ? state.editingDescription || editingTodo?.description || ""
            : ""
        }
        onSubmit={handleSubmit}
        onCancel={() => dispatch({ type: "EXIT_MODE" })}
      />
    );
  }

  if (state.mode === "projectAdd") {
    return (
      <ProjectEditorView
        onSubmit={(input) => {
          if (!projects) {
            dispatch({ type: "EXIT_MODE" });
            return;
          }
          void (async () => {
            try {
              const project = await projects.create(input);
              dispatch({ type: "PROJECT_ADDED", project });
            } catch (err) {
              dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
            }
          })();
        }}
        onCancel={() => dispatch({ type: "EXIT_MODE" })}
      />
    );
  }

  if (state.mode === "search") {
    return (
      <SearchView
        todos={state.todos}
        projects={state.projects}
        query={state.searchQuery}
        cursor={state.searchCursor}
        hydrating={hydratingSearch}
        nowMs={nowMs}
        onQueryChange={(q) => dispatch({ type: "SEARCH_SET_QUERY", query: q })}
        onCursorUp={() => dispatch({ type: "SEARCH_CURSOR_UP" })}
        onCursorDown={() => dispatch({ type: "SEARCH_CURSOR_DOWN" })}
        onResultCount={(count) =>
          dispatch({ type: "SEARCH_RESULT_COUNT", count })
        }
        onOpen={(id) => {
          dispatch({ type: "SEARCH_OPEN_DETAIL", id });
          // Description is most likely already cached at this point (the
          // search-mode hydration covers it), but call hydrate anyway so a
          // late-arriving body or a stale cache still gets refreshed before
          // the detail page reads it.
          void hydrateTodoDescription(id);
        }}
        onClose={() => dispatch({ type: "CLOSE_SEARCH" })}
      />
    );
  }

  if (state.mode === "searchDetail") {
    const current = state.searchDetailTodoId
      ? state.todos.find((t) => t.id === state.searchDetailTodoId) ?? null
      : null;
    if (!current) {
      // Row vanished (deleted from another client, or cleared by a filter);
      // bounce back to the search list rather than rendering an empty page.
      dispatch({ type: "SEARCH_CLOSE_DETAIL" });
      return null;
    }
    const proj = current.projectId ? projectById.get(current.projectId) ?? null : null;
    return (
      <TodoDetailView
        todo={current}
        project={proj}
        ownerName={identity?.userName}
        nowMs={nowMs}
        onClose={() => dispatch({ type: "SEARCH_CLOSE_DETAIL" })}
        onToggleDone={() => {
          void (async () => {
            try {
              const updated = await api.updateTodo(current.id, { done: !current.done });
              dispatch({ type: "TODO_UPDATED", todo: updated });
            } catch (err) {
              dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
            }
          })();
        }}
        onEdit={() => void enterEditWithFullTodo(current.id, current.title, current.description)}
        onDelete={() => {
          void (async () => {
            try {
              await api.deleteTodo(current.id);
              dispatch({ type: "TODO_DELETED", id: current.id });
              dispatch({ type: "SEARCH_CLOSE_DETAIL" });
            } catch (err) {
              dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
            }
          })();
        }}
      />
    );
  }

  if (state.mode === "todoDetail") {
    const current = visible[state.cursor] ?? null;
    if (!current) {
      // Cursor moved off (delete / filter change); fall back to list.
      dispatch({ type: "CLOSE_TODO_DETAIL" });
      return null;
    }
    const proj = current.projectId ? projectById.get(current.projectId) ?? null : null;
    return (
      <TodoDetailView
        todo={current}
        project={proj}
        ownerName={identity?.userName}
        nowMs={nowMs}
        onClose={() => dispatch({ type: "CLOSE_TODO_DETAIL" })}
        onToggleDone={() => {
          void (async () => {
            try {
              const updated = await api.updateTodo(current.id, { done: !current.done });
              dispatch({ type: "TODO_UPDATED", todo: updated });
            } catch (err) {
              dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
            }
          })();
        }}
        onEdit={() => void enterEditWithFullTodo(current.id, current.title, current.description)}
        onDelete={() => {
          void (async () => {
            try {
              await api.deleteTodo(current.id);
              dispatch({ type: "TODO_DELETED", id: current.id });
              dispatch({ type: "CLOSE_TODO_DETAIL" });
            } catch (err) {
              dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
            }
          })();
        }}
      />
    );
  }

  if (state.mode === "projectConfirmDelete") {
    const target = state.deletingProjectId
      ? state.projects.find((p) => p.id === state.deletingProjectId)
      : null;
    const name = target?.name ?? "this project";
    const todoCount = state.deletingProjectId
      ? state.todos.filter((t) => t.projectId === state.deletingProjectId).length
      : 0;
    return (
      <ConfirmDialog
        title="Delete project"
        tone={color.danger}
        footerMode="confirm delete"
        message={
          <>
            <Text wrap="wrap">
              Delete project <Text color={color.accent} bold>{name}</Text>?
            </Text>
            <Box marginTop={1}>
              <Text color={color.muted} wrap="wrap">
                {todoCount > 0
                  ? `This also removes ${todoCount} todo${todoCount === 1 ? "" : "s"} in this project. Cannot be undone.`
                  : "Cannot be undone."}
              </Text>
            </Box>
          </>
        }
      />
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        {/* ── left column: Server|Status header row + tall Todos list ─── */}
        <Box flexDirection="column" width={leftColW}>
          <Box>
            <TitledPanel title="Server" width={serverW} paddingY={1} height={topRowH}>
              <Logo />
              <Box marginTop={1}>
                <Text color={color.muted}>serving at </Text>
                <Text color={color.accent2} wrap="truncate">
                  {identity?.server ?? "local"}
                </Text>
              </Box>
            </TitledPanel>

            <Box width={topGap} />

            <TitledPanel title="Status" width={statusW} paddingY={1} height={topRowH}>
              <StatusPanel
                userName={identity?.userName}
                server={identity?.server}
                configPath={identity?.configPath}
                serverInfo={serverInfo}
                clientVersion={VERSION}
                syncing={state.syncing}
              />
            </TitledPanel>
          </Box>

          <Box height={rowGap} />

          <TitledPanel title="Todos" width={leftColW} paddingY={1} height={todosH} focused>
          {/* Meta line — at-a-glance summary that survives even when the list
              scrolls offscreen on tiny terminals. */}
          <Box>
            <Text color={color.accent} bold>{totalCount}</Text>
            <Text color={color.muted}>{" todos  "}</Text>
            <Text color={color.muted} dimColor>{icon.dot}</Text>
            <Text color={color.muted}>{"  "}</Text>
            <Text color={color.success} bold>{doneCount}</Text>
            <Text color={color.muted}>{" done  "}</Text>
            <Text color={color.muted} dimColor>{icon.dot}</Text>
            <Text color={color.muted}>{"  "}</Text>
            <Text color={color.accent2} bold>{openCount}</Text>
            <Text color={color.muted}>{" open"}</Text>
            <Box flexGrow={1} />
            <Text color={color.muted} dimColor>sorted by updated</Text>
          </Box>
          <Box marginTop={1}>
            <Tabs
              tabs={[
                {
                  key: "inbox",
                  label: "Private",
                  count: state.todos.filter((t) => !t.projectId).length,
                  kind: "system",
                  prefixIcon: icon.brand,
                },
                {
                  key: "done",
                  label: "Done",
                  count: state.todos.filter((t) => t.done).length,
                  kind: "system",
                  prefixIcon: icon.brand,
                },
                ...state.projects.map((p) => ({
                  key: `p:${p.id}`,
                  label: p.name,
                  count: state.todos.filter((t) => t.projectId === p.id).length,
                  kind: "project" as const,
                  prefixIcon: icon.on,
                  prefixColor: swatchColor(p.color),
                })),
              ]}
              activeKey={activeTab}
            />
          </Box>
          <Box marginTop={1} flexDirection="column">
            {showSpinner ? (
              <Spinner label="Loading todos…" />
            ) : visible.length === 0 ? (
              <Text color={color.muted} dimColor>
                {"  "}nothing here — press <Text color={color.accent}>i</Text> to add a todo
              </Text>
            ) : (
              <>
                {listWindow.items.map((t, idx) => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    nowMs={nowMs}
                    highlighted={listWindow.start + idx === state.cursor}
                    width={leftColW - 4}
                  />
                ))}
                {(listWindow.moreAbove > 0 || listWindow.moreBelow > 0) && (
                  <Box width={leftColW - 4}>
                    <Text color={color.muted} dimColor>
                      {listWindow.moreAbove > 0 ? `↑ ${listWindow.moreAbove} more` : ""}
                    </Text>
                    <Box flexGrow={1} />
                    <Text color={color.muted} dimColor>
                      {listWindow.moreBelow > 0 ? `${listWindow.moreBelow} more ↓` : ""}
                    </Text>
                  </Box>
                )}
              </>
            )}
          </Box>
        </TitledPanel>
        </Box>

        <Box width={colGap} />

        {/* Right column: a single tall Activity panel (chart on top, Recent
            feed below the divider) sits at the top — free to exceed the
            Server/Status header row. TodoInfo sits at the bottom-right. */}
        <Box flexDirection="column" width={rightColW}>
          <TitledPanel
            title="Activity"
            width={rightColW}
            paddingY={1}
            height={activityH}
            borderTint={color.accent2}
          >
            {/* Header: legend + totals — a one-line read of what the chart shows. */}
            <Box>
              <Text color={color.muted} dimColor>▒</Text>
              <Text color={color.muted}>{" Created "}</Text>
              <Text color={color.accent}>{sum(createdSeries)}</Text>
              <Text color={color.muted}>{"   "}</Text>
              <Text color={color.accent}>█</Text>
              <Text color={color.muted}>{" Done "}</Text>
              <Text color={color.success}>{sum(doneSeries)}</Text>
              <Text color={color.muted}>{`   · ${ACTIVITY_DAYS} days`}</Text>
            </Box>
            <Box marginTop={1}>
              <DualBarChart
                primary={doneSeries}
                secondary={createdSeries}
                rows={5}
                ySteps={2}
              />
            </Box>
            {/* X-axis ruler + endpoints. Width matches `rows*2 chars wide chart`
                + 4 chars for the y-axis gutter. */}
            <XAxis days={ACTIVITY_DAYS} />
            {/* In-panel divider separating the trend chart from the live feed.
                Keeps both sub-sections inside one TitledPanel so the right
                column reads as a single Activity module. */}
            <Box marginTop={1}>
              <Text color={color.muted} dimColor>
                {"─ Recent ".padEnd(Math.max(0, rightColW - 4), "─")}
              </Text>
            </Box>
            <Box marginTop={1} flexGrow={1}>
              <ActivityFeed events={state.events} nowMs={nowMs} />
            </Box>
          </TitledPanel>
          <Box height={rowGap} />
          <TitledPanel
            title="Todo Info"
            width={rightColW}
            height={todoInfoH}
            paddingY={1}
            borderTint={color.accent3}
          >
            <TodoInfo
              todo={visible[state.cursor] ?? null}
              project={
                visible[state.cursor]?.projectId
                  ? projectById.get(visible[state.cursor]!.projectId!) ?? null
                  : null
              }
              ownerName={identity?.userName}
              nowMs={nowMs}
            />
          </TitledPanel>
        </Box>
      </Box>

      {state.error && <ErrorAlert message={state.error} />}

      {state.helpOpen && <HelpOverlay />}

      <Footer
        mode="normal"
        version={VERSION}
        hints={listHints}
        outerPadX={1}
      />
    </Box>
  );
}

function StatusPanel({
  userName,
  server,
  configPath,
  serverInfo,
  clientVersion,
  syncing,
}: {
  userName?: string;
  server?: string;
  configPath?: string;
  serverInfo: ServerInfo | null;
  clientVersion: string;
  syncing: boolean;
}) {
  // Each datum on its own row with a short label so narrow panels never
  // truncate values like "v0.3.1" or a short sha. Label column = 5 cells.
  const rows: ReadonlyArray<readonly [string, string, string | undefined]> = [
    ["user", userName ?? "—", color.accent2],
    ["host", server ? stripScheme(server) : "local", color.accent2],
    ["srv", serverInfo?.version || (serverInfo ? "unknown" : "—"), color.accent],
    ["sha", serverInfo?.commit || (serverInfo ? "unknown" : "—"), color.accent],
    ["cli", clientVersion, color.accent],
    ["cfg", configPath ? tildifyPath(configPath) : "—", color.muted],
  ];
  const connTint = serverInfo ? color.success : server ? color.warn : color.muted;
  const connLabel = serverInfo ? "connected" : server ? "probing…" : "local";
  return (
    <Box flexDirection="column">
      {rows.map(([label, value, tint]) => (
        <Box key={label}>
          <Box width={5}>
            <Text color={color.muted}>{label}</Text>
          </Box>
          <Text color={tint} wrap="truncate">
            {value}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={connTint}>{icon.on} </Text>
        <Text color={connTint}>{connLabel}</Text>
        {syncing && (
          <Text color={color.muted}>{`  ${icon.dot} syncing`}</Text>
        )}
      </Box>
    </Box>
  );
}

// Drop "http(s)://" so the host:port fits comfortably in the narrow Status
// panel. Full URL is still printed under the logo in the Server panel.
function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

// Replace the user's home directory with `~` so config paths read naturally in
// the narrow Status panel ("~/.config/dox/config.toml" vs "/Users/.../...").
function tildifyPath(path: string): string {
  const home = homedir();
  if (home && path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

function TodoRow({
  todo,
  nowMs,
  highlighted,
  width,
}: {
  todo: Todo;
  nowMs: number;
  highlighted: boolean;
  width: number;
}) {
  const mark = todo.done ? icon.done : icon.open;
  const markColor = todo.done ? color.success : highlighted ? color.accent : color.muted;
  const bar = highlighted ? icon.selectBar : " ";
  const age = relativeTime(nowMs, todo.updatedAt);
  const ageWidth = 4;
  return (
    <Box width={width}>
      <Text color={color.accent}>{bar}</Text>
      <Text> </Text>
      <Text color={markColor}>{mark}</Text>
      <Text> </Text>
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text
          color={highlighted ? color.accent : undefined}
          bold={highlighted}
          dimColor={todo.done}
          strikethrough={todo.done}
          wrap="truncate"
        >
          {todo.title}
        </Text>
      </Box>
      <Box width={ageWidth} justifyContent="flex-end">
        <Text color={color.muted}>{age}</Text>
      </Box>
    </Box>
  );
}

const listHints: ReadonlyArray<readonly [string, string]> = [
  ["␣", "toggle"],
  ["i", "todo"],
  ["p", "project"],
  ["/", "search"],
  ["h/l", "tab"],
  ["s", "settings"],
  ["?", "help"],
];

function activeProjectId(filter: Filter): string | undefined {
  if (filter === "inbox") return undefined;
  return filter.id;
}

function filterToTabKey(filter: Filter): string {
  return filterKey(filter);
}

// Cursor-centered windowing for long lists. No separate scroll-offset state —
// the window is derived from the cursor each render so j/k naturally drag the
// viewport along once the cursor reaches the middle.
//
// Returns the visible slice along with the count of hidden items on each side,
// so callers can render "↑ N more / N more ↓" hints.
interface WindowSlice<T> {
  items: T[];
  start: number;
  moreAbove: number;
  moreBelow: number;
}
function sliceWindow<T>(items: T[], cursor: number, viewportH: number): WindowSlice<T> {
  if (items.length <= viewportH) {
    return { items, start: 0, moreAbove: 0, moreBelow: 0 };
  }
  const half = Math.floor(viewportH / 2);
  const maxStart = items.length - viewportH;
  const start = Math.max(0, Math.min(cursor - half, maxStart));
  const slice = items.slice(start, start + viewportH);
  return {
    items: slice,
    start,
    moreAbove: start,
    moreBelow: items.length - start - slice.length,
  };
}

function deriveTotals(todos: Todo[]) {
  const done = todos.filter((t) => t.done).length;
  const open = todos.length - done;
  // Crude "Top" = max same-day creation count; renders as a single eye-grabby
  // accent number, even when it's small.
  const perDay = bucketByDay(todos);
  const maxDaily = Math.max(0, ...Object.values(perDay));
  return { total: todos.length, done, open, maxDaily };
}

function bucketByDay(todos: Todo[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of todos) {
    const ms = typeof t.createdAt === "string" ? Number(t.createdAt) : Number(t.createdAt ?? 0);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    const day = new Date(ms).toISOString().slice(0, 10);
    out[day] = (out[day] ?? 0) + 1;
  }
  return out;
}

function sum(xs: number[]): number {
  let total = 0;
  for (const x of xs) total += x;
  return total;
}

// X-axis ruler under the dual bar chart. `days × 2` cells matches the chart
// width (each day is rendered as `▒█`); 4-cell leading gutter aligns with the
// y-axis labels inside DualBarChart. Total row width is pinned to gutter +
// chart so the right-edge "today" label lines up with today's bar instead of
// drifting to the parent panel's right border.
function XAxis({ days }: { days: number }) {
  const gutter = 4;
  const chartWidth = days * 2;
  const totalW = gutter + chartWidth;
  return (
    <Box flexDirection="column" width={totalW}>
      <Box width={totalW}>
        <Text color={color.muted}>{" ".repeat(gutter)}</Text>
        <Text color={color.muted}>{"─".repeat(chartWidth)}</Text>
      </Box>
      <Box width={totalW}>
        <Text color={color.muted}>{" ".repeat(gutter)}</Text>
        <Text color={color.muted}>{`${days}d ago`}</Text>
        <Box flexGrow={1} />
        <Text color={color.muted}>today</Text>
      </Box>
    </Box>
  );
}

function activityByDay(todos: Todo[], days: number, kind: "created" | "done"): number[] {
  const today = startOfDay(Date.now());
  const buckets = new Array(days).fill(0);
  for (const t of todos) {
    // "done" bucket = day the todo was last updated (proxy for completion day,
    // since we don't store the completion timestamp separately).
    if (kind === "done" && !t.done) continue;
    const raw = kind === "created" ? t.createdAt : t.updatedAt;
    const ms = typeof raw === "string" ? Number(raw) : Number(raw ?? 0);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    const day = startOfDay(ms);
    const offset = Math.round((today - day) / 86_400_000);
    if (offset >= 0 && offset < days) buckets[days - 1 - offset] += 1;
  }
  return buckets;
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}
