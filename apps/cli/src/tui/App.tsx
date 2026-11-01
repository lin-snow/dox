import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { Spinner } from "@inkjs/ui";
import { homedir } from "node:os";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";

import type {
  EventsApi,
  InviteClient,
  NotificationsApi,
  Project,
  ProjectMember,
  ServerInfo,
  Todo,
  TodoApi,
  UserClient,
} from "@dox/core";
import {
  dueLabel,
  fetchServerInfo,
  formatWhenInput,
  isOverdue,
  localZone,
  parseWhen,
} from "@dox/core";

import { AboutView } from "./components/views/about/AboutView";
import { ActivityFeed } from "./components/views/todo/ActivityFeed";
import { NotificationsView } from "./components/views/notifications/NotificationsView";
import { DualBarChart } from "./components/charts/DualBarChart";
import { ErrorAlert } from "./components/primitives/ErrorAlert";
import { Footer } from "./components/layout/Footer";
import { HelpView } from "./components/views/help/HelpView";
import { Logo } from "./components/layout/Logo";
import { SearchView } from "./components/views/search/SearchView";
import { SettingsView } from "./components/views/settings/SettingsView";
import { Tabs } from "./components/layout/Tabs";
import { TitledPanel } from "./components/primitives/TitledPanel";
import { ConfirmDialog } from "./components/primitives/ConfirmDialog";
import { ProjectEditorView } from "./components/views/project/ProjectEditorView";
import { ProjectManageView } from "./components/views/project/ProjectManageView";
import { TodoDetailView } from "./components/views/todo/TodoDetailView";
import { TodoEditorView } from "./components/views/todo/TodoEditorView";
import { TodoInfo } from "./components/views/todo/TodoInfo";
import { SettingsModal } from "./components/views/settings/SettingsModal";
import { useMinHold, useSpinnerFrame } from "./hooks";
import { dueInput, relativeTime, swatchColor } from "./util";
import { buildSettingsTabs } from "./settings";
import { color, icon } from "./theme";
import {
  dueTodayOrOverdue,
  initialState,
  reducer,
  visibleTodos,
} from "./state";
import type { Filter } from "./components/layout/Sidebar";
import { filterKey } from "./components/layout/Sidebar";

import { displayVersion, VERSION } from "../version";

const POLL_INTERVAL_MS = 30_000;
const EVENTS_POLL_INTERVAL_MS = 60_000;
const REMINDERS_POLL_INTERVAL_MS = 30_000;
const ACTIVITY_DAYS = 14;

interface ProjectsApi {
  list(): Promise<Project[]>;
  create(args: {
    name: string;
    description?: string;
    color?: string;
  }): Promise<Project>;
  remove(id: string): Promise<void>;
  listMembers?: (projectId: string) => Promise<ProjectMember[]>;
}

interface AppProps {
  api: TodoApi;
  projects?: ProjectsApi;
  events?: EventsApi;
  notifications?: NotificationsApi;
  users?: UserClient;
  invites?: InviteClient;
  identity?: {
    userId?: string;
    userName?: string;
    role?: string;
    server?: string;
    configPath?: string;
  };
  onSignedOut?: () => void;
}

export function App({
  api,
  projects,
  events,
  notifications,
  users,
  invites,
  identity,
  onSignedOut,
}: AppProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const { exit } = useApp();
  const { columns: totalCols, rows: totalRows } = useWindowSize();

  const refresh = useCallback(async () => {
    dispatch({ type: "SYNC_START" });
    try {
      const [todos, projectList] = await Promise.all([
        api.listTodos(),
        projects ? projects.list() : Promise.resolve<Project[]>([]),
      ]);
      dispatch({ type: "TODOS_LOADED", todos });
      if (projects)
        dispatch({ type: "PROJECTS_LOADED", projects: projectList });
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

  const refreshEvents = useCallback(async () => {
    if (!events) return;
    try {
      const list = await events.list();
      dispatch({ type: "EVENTS_LOADED", events: list });
    } catch {}
  }, [events]);

  useEffect(() => {
    if (!events) return;
    void refreshEvents();
    const timer = setInterval(
      () => void refreshEvents(),
      EVENTS_POLL_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [events, refreshEvents]);

  const refreshReminders = useCallback(async () => {
    if (!notifications) return;
    try {
      const list = await notifications.list({ limit: 50 });
      dispatch({
        type: "REMINDERS_LOADED",
        reminders: list.notifications,
        unreadCount: list.unreadCount,
      });
    } catch {}
  }, [notifications]);

  useEffect(() => {
    if (!notifications) return;
    void refreshReminders();
    const timer = setInterval(
      () => void refreshReminders(),
      REMINDERS_POLL_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, [notifications, refreshReminders]);

  // Opening the list is the acknowledgement: it is the only place reminders
  // are shown, and the badge exists to get you here.
  useEffect(() => {
    if (state.mode !== "notifications" || !notifications) return;
    let cancelled = false;
    void (async () => {
      try {
        await notifications.ack();
        const list = await notifications.list({ limit: 50 });
        if (cancelled) return;
        dispatch({
          type: "REMINDERS_LOADED",
          reminders: list.notifications,
          unreadCount: list.unreadCount,
        });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [state.mode, notifications]);

  useEffect(() => {
    if (state.mode !== "projectManage") return;
    if (state.manageMembersLoaded) return;
    const pid = state.manageProjectId;
    if (!pid || !projects?.listMembers) {
      dispatch({ type: "MANAGE_MEMBERS_SET", members: [] });
      return;
    }
    void (async () => {
      try {
        const members = await projects.listMembers!(pid);
        dispatch({ type: "MANAGE_MEMBERS_SET", members });
      } catch (err) {
        dispatch({ type: "MANAGE_ERROR", error: (err as Error).message });
        dispatch({ type: "MANAGE_MEMBERS_SET", members: [] });
      }
    })();
  }, [state.mode, state.manageProjectId, state.manageMembersLoaded, projects]);

  useEffect(() => {
    if (state.mode !== "settings") return;
    if (!state.settingsServerLoaded && users && identity?.role === "owner") {
      void (async () => {
        try {
          const s = await users.getSettings();
          dispatch({ type: "SETTINGS_SERVER_SET", settings: s });
        } catch (err) {
          dispatch({ type: "SETTINGS_ERROR", error: (err as Error).message });
          dispatch({ type: "SETTINGS_SERVER_SET", settings: null });
        }
      })();
    } else if (!state.settingsServerLoaded && identity?.role !== "owner") {
      dispatch({
        type: "SETTINGS_SERVER_SET",
        settings: serverInfo
          ? {
              registrationOpen: serverInfo.registrationOpen,
              serverName: serverInfo.serverName,
              serverDescription: serverInfo.serverDescription,
            }
          : null,
      });
    }
    if (!state.settingsOutgoingLoaded && invites) {
      void (async () => {
        try {
          const list = await invites.listOutgoing();
          dispatch({ type: "SETTINGS_OUTGOING_SET", invites: list });
        } catch (err) {
          dispatch({ type: "SETTINGS_ERROR", error: (err as Error).message });
          dispatch({ type: "SETTINGS_OUTGOING_SET", invites: [] });
        }
      })();
    }
  }, [
    state.mode,
    state.settingsServerLoaded,
    state.settingsOutgoingLoaded,
    users,
    invites,
    identity?.role,
    serverInfo,
  ]);

  useEffect(() => {
    const url = identity?.server;
    if (!url) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await fetchServerInfo(url);
        if (!cancelled) setServerInfo(info);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [identity?.server]);

  useEffect(() => {
    if (!state.settingsNotice) return;
    const timer = setTimeout(
      () => dispatch({ type: "SETTINGS_NOTICE", notice: null }),
      4000,
    );
    return () => clearTimeout(timer);
  }, [state.settingsNotice]);

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
  const editPayload = useCallback((todo: Todo) => {
    return {
      id: todo.id,
      initialTitle: todo.title,
      initialDescription: todo.description ?? "",
      initialDue: dueInput(todo),
      initialRemind:
        todo.remindAt === undefined
          ? ""
          : formatWhenInput(Number(todo.remindAt), false),
    };
  }, []);
  const enterEditWithFullTodo = useCallback(
    async (id: string, fallbackTitle: string, cachedDescription?: string) => {
      const cached = state.todos.find((t) => t.id === id);
      dispatch({
        type: "ENTER_EDIT",
        id,
        initialTitle: fallbackTitle,
        initialDescription: cachedDescription ?? "",
        initialDue: cached ? dueInput(cached) : "",
        initialRemind: cached?.remindAt
          ? formatWhenInput(Number(cached.remindAt), false)
          : "",
      });
      if (cachedDescription !== undefined) return;
      try {
        const full = await api.getTodo(id);
        dispatch({ type: "ENTER_EDIT", ...editPayload(full) });
      } catch (err) {
        dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
      }
    },
    [api, editPayload, state.todos],
  );

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
          } catch {}
        }),
      );
      if (!cancelled) setHydratingSearch(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mode, api]);

  const visible = useMemo(() => visibleTodos(state), [state]);

  const cursoredTodo = visible[state.cursor];
  const cursoredId = cursoredTodo?.id;
  const cursoredDescriptionLoaded = cursoredTodo?.description !== undefined;
  useEffect(() => {
    if (state.mode !== "list") return;
    if (!cursoredId || cursoredDescriptionLoaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const full = await api.getTodo(cursoredId);
        if (!cancelled) dispatch({ type: "TODO_UPDATED", todo: full });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [state.mode, cursoredId, cursoredDescriptionLoaded, api]);
  const createdSeries = useMemo(
    () => activityByDay(state.todos, ACTIVITY_DAYS, "created"),
    [state.todos],
  );
  const doneSeries = useMemo(
    () => activityByDay(state.todos, ACTIVITY_DAYS, "done"),
    [state.todos],
  );

  const toggleDone = useCallback(
    async (todo: Todo) => {
      const prevDone = todo.done;
      try {
        const updated = await api.updateTodo(todo.id, { done: !prevDone });
        dispatch({ type: "TODO_UPDATED", todo: updated });
        dispatch({
          type: "TOAST_SET",
          toast: {
            kind: "doneToggled",
            todoId: todo.id,
            title: todo.title,
            prevDone,
            expiresAt: Date.now() + 5000,
          },
        });
      } catch (err) {
        dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
      }
    },
    [api],
  );

  useEffect(() => {
    const t = state.toast;
    if (!t) return;
    const ms = Math.max(0, t.expiresAt - Date.now());
    const id = setTimeout(() => dispatch({ type: "TOAST_CLEAR" }), ms);
    return () => clearTimeout(id);
  }, [state.toast]);

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
      if (input === "A") {
        dispatch({ type: "OPEN_ABOUT" });
        return;
      }
      if (input === "/") {
        dispatch({ type: "OPEN_SEARCH" });
        return;
      }
      if (input === "n" && notifications) {
        dispatch({ type: "OPEN_NOTIFICATIONS" });
        return;
      }
      if (input === "z" && state.toast?.kind === "doneToggled") {
        const t = state.toast;
        void (async () => {
          try {
            const updated = await api.updateTodo(t.todoId, {
              done: t.prevDone,
            });
            dispatch({ type: "TODO_UPDATED", todo: updated });
            dispatch({ type: "TOAST_CLEAR" });
          } catch (err) {
            dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
          }
        })();
        return;
      }
      if (state.error) dispatch({ type: "CLEAR_ERROR" });
      if (input === "j" || key.downArrow)
        return dispatch({ type: "CURSOR_DOWN" });
      if (input === "k" || key.upArrow) return dispatch({ type: "CURSOR_UP" });
      if (input === "g") return dispatch({ type: "CURSOR_FIRST" });
      if (input === "G") return dispatch({ type: "CURSOR_LAST" });
      if (
        key.tab ||
        input === "h" ||
        input === "l" ||
        key.leftArrow ||
        key.rightArrow
      ) {
        const dir = input === "h" || key.leftArrow ? -1 : 1;
        return dispatch({ type: "FILTER_CYCLE", direction: dir as 1 | -1 });
      }
      if (input === "r") return void refresh();

      if (input === "i" || input === "a")
        return dispatch({ type: "ENTER_ADD" });
      if (input === "p" && projects)
        return dispatch({ type: "ENTER_PROJECT_ADD" });
      if (
        input === "D" &&
        projects &&
        typeof state.filter !== "string" &&
        state.filter.type === "project"
      ) {
        return dispatch({
          type: "ENTER_PROJECT_DELETE_CONFIRM",
          id: state.filter.id,
        });
      }
      if (
        input === "m" &&
        projects &&
        typeof state.filter !== "string" &&
        state.filter.type === "project"
      ) {
        return dispatch({
          type: "ENTER_PROJECT_MANAGE",
          projectId: state.filter.id,
        });
      }

      const current = visible[state.cursor];
      if (!current) return;
      if (key.return) {
        dispatch({ type: "OPEN_TODO_DETAIL" });
        void hydrateTodoDescription(current.id);
        return;
      }
      if (input === " ") {
        void toggleDone(current);
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
        void enterEditWithFullTodo(
          current.id,
          current.title,
          current.description,
        );
      }
    },
    { isActive: state.mode === "list" },
  );

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

  const handleSubmit = (payload: {
    title: string;
    description: string;
    due: string;
    remind: string;
    meetStart: string;
    meetEnd: string;
  }) => {
    const title = payload.title.trim();
    if (!title) {
      dispatch({ type: "EXIT_MODE" });
      return;
    }
    const dueRaw = payload.due.trim();
    const remindRaw = payload.remind.trim();
    const due = dueRaw ? parseWhen(dueRaw) : null;
    if (dueRaw && !due) {
      dispatch({
        type: "LOAD_ERROR",
        error: `invalid due date "${dueRaw}" - try 2026-11-05, "2026-11-05 09:30", 09:30, or +2h`,
      });
      return;
    }
    const remind = remindRaw ? parseWhen(remindRaw) : null;
    if (remindRaw && !remind) {
      dispatch({
        type: "LOAD_ERROR",
        error: `invalid reminder "${remindRaw}" - try 2026-11-05 09:30, 09:30, or +30m`,
      });
      return;
    }
    // A meeting is a window: both ends or none. One-sided input is a mistake,
    // not a half-window the server should have to reconcile.
    const meetStartRaw = payload.meetStart.trim();
    const meetEndRaw = payload.meetEnd.trim();
    const meetStart = meetStartRaw ? parseWhen(meetStartRaw) : null;
    const meetEnd = meetEndRaw ? parseWhen(meetEndRaw) : null;
    if ((meetStartRaw === "") !== (meetEndRaw === "")) {
      dispatch({
        type: "LOAD_ERROR",
        error: `a meeting needs both a start and an end - add the ${
          meetStartRaw ? "end" : "start"
        } too`,
      });
      return;
    }
    if (meetStartRaw && (!meetStart || !meetEnd)) {
      dispatch({
        type: "LOAD_ERROR",
        error: `invalid meeting window - try 2026-11-05 09:30`,
      });
      return;
    }
    if (meetStart && meetEnd && meetEnd.at <= meetStart.at) {
      dispatch({
        type: "LOAD_ERROR",
        error: "the meeting must end after it starts",
      });
      return;
    }
    const meeting =
      meetStart && meetEnd
        ? { startsAt: meetStart.at, endsAt: meetEnd.at }
        : null;
    const description = payload.description;
    // Empty due input means "no deadline": send explicit clears on edit so a
    // removed date really goes away, and omit them on create.
    const dueFields = due
      ? {
          dueAt: due.at,
          dueAllDay: due.allDay,
          dueZone: due.allDay ? localZone() : "",
        }
      : null;
    const remindAt = remind ? remind.at : null;

    if (state.mode === "add") {
      const projectId = activeProjectId(state.filter);
      const opts: {
        projectId?: string;
        description?: string;
        dueAt?: number;
        dueAllDay?: boolean;
        dueZone?: string;
        remindAt?: number;
        startsAt?: number;
        endsAt?: number;
      } = {};
      if (projectId) opts.projectId = projectId;
      if (description.length > 0) opts.description = description;
      if (dueFields) {
        opts.dueAt = dueFields.dueAt;
        opts.dueAllDay = dueFields.dueAllDay;
        opts.dueZone = dueFields.dueZone;
      }
      if (remindAt !== null) opts.remindAt = remindAt;
      if (meeting) {
        opts.startsAt = meeting.startsAt;
        opts.endsAt = meeting.endsAt;
      }
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
      const existing = state.todos.find((t) => t.id === id);
      // Clearing a window means clearing it whole: sending one side alone is a
      // half window, and the server reads a 0 start as "drop both".
      const meetingFields = meeting
        ? { startsAt: meeting.startsAt, endsAt: meeting.endsAt }
        : existing?.startsAt !== undefined
          ? { startsAt: null }
          : {};
      void (async () => {
        try {
          const updated = await api.updateTodo(id, {
            title,
            description,
            dueAt: dueFields ? dueFields.dueAt : null,
            dueAllDay: dueFields?.dueAllDay ?? false,
            dueZone: dueFields?.dueZone ?? "",
            remindAt,
            ...meetingFields,
          });
          dispatch({ type: "TODO_UPDATED", todo: updated });
          dispatch({ type: "EXIT_MODE" });
        } catch (err) {
          dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
        }
      })();
    }
  };

  const usable = Math.max(60, totalCols - 2);
  const colGap = 2;
  const leftColW = Math.max(40, Math.floor(usable * 0.6));
  const rightColW = Math.max(36, usable - leftColW - colGap);
  const topGap = 2;
  const topCombined = leftColW - topGap;
  const serverW = Math.max(23, Math.floor(topCombined * 0.46));
  const statusW = Math.max(26, topCombined - serverW);

  const MAX_INNER_H = 48;
  const innerH = Math.min(MAX_INNER_H, Math.max(32, totalRows - 4));
  const topRowH = 14;
  const rowGap = 1;
  const todosH = Math.max(18, innerH - topRowH - rowGap);
  const activityH = Math.max(17, Math.min(22, Math.floor(innerH * 0.46)));
  const todoInfoH = Math.max(11, innerH - activityH - rowGap);

  const activeTab = filterToTabKey(state.filter);
  const projectById = useMemo(
    () => new Map(state.projects.map((p) => [p.id, p])),
    [state.projects],
  );
  const openCount = state.todos.filter((t) => !t.done).length;
  const nowMs = Date.now();
  const todayMs = startOfDay(nowMs);
  const doneTodayCount = state.todos.filter(
    (t) => t.done && Number(t.updatedAt ?? 0) >= todayMs,
  ).length;

  const showSpinner = state.loading && state.todos.length === 0;

  if (state.helpOpen) {
    return <HelpView onClose={() => dispatch({ type: "CLOSE_HELP" })} />;
  }

  const toastChromeH = state.toast?.kind === "doneToggled" ? 2 : 0;
  const LIST_VIEWPORT_H = Math.max(5, todosH - 8 - toastChromeH);
  const listWindow = sliceWindow(visible, state.cursor, LIST_VIEWPORT_H);

  if (state.mode === "settings") {
    const settingsTabs = buildSettingsTabs({
      identity: {
        userName: identity?.userName,
        server: identity?.server,
        role: identity?.role,
      },
      server: state.settingsServer,
      serverLoaded: state.settingsServerLoaded,
      outgoing: state.settingsOutgoing,
      outgoingLoaded: state.settingsOutgoingLoaded,
      on: {
        editServerName: () =>
          dispatch({ type: "SETTINGS_EDIT", editing: { kind: "serverName" } }),
        editServerDescription: () =>
          dispatch({
            type: "SETTINGS_EDIT",
            editing: { kind: "serverDescription" },
          }),
        toggleRegistration: (next) =>
          dispatch({
            type: "SETTINGS_EDIT",
            editing: { kind: "registrationToggle", next },
          }),
        changePassword: () =>
          dispatch({
            type: "SETTINGS_EDIT",
            editing: { kind: "changePassword" },
          }),
        signOut: () =>
          dispatch({ type: "SETTINGS_EDIT", editing: { kind: "signOut" } }),
        redeemCode: () =>
          dispatch({ type: "SETTINGS_EDIT", editing: { kind: "redeemCode" } }),
        revokeInvite: (codeHash) =>
          dispatch({
            type: "SETTINGS_EDIT",
            editing: { kind: "revokeInvite", codeHash },
          }),
      },
    });

    const editing = state.settingsEditing;
    if (editing) {
      return (
        <SettingsModal
          editing={editing}
          state={state}
          dispatch={dispatch}
          users={users}
          invites={invites}
          projects={projects}
          onRefresh={refresh}
          onSignedOut={onSignedOut}
        />
      );
    }
    return (
      <SettingsView
        tabs={settingsTabs}
        activeTab={state.settingsTab}
        cursor={state.settingsCursor}
        notice={state.settingsNotice}
        onTabChange={(tab) => dispatch({ type: "SETTINGS_TAB", tab })}
        onCursorChange={(i) => dispatch({ type: "SETTINGS_CURSOR", index: i })}
        onClose={() => dispatch({ type: "CLOSE_SETTINGS" })}
      />
    );
  }

  if (state.mode === "add" || state.mode === "edit") {
    const editingTodo =
      state.mode === "edit" && state.editingId
        ? (state.todos.find((t) => t.id === state.editingId) ?? null)
        : null;
    // A meeting window is edited as text, same vocabulary as every other time
    // field, so the stored instants are rendered back through the shared
    // formatter rather than reimplemented here.
    const editingWindow =
      editingTodo?.startsAt !== undefined && editingTodo.endsAt !== undefined
        ? {
            start: formatWhenInput(Number(editingTodo.startsAt), false),
            end: formatWhenInput(Number(editingTodo.endsAt), false),
          }
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
        defaultDue={state.mode === "edit" ? state.editingDue : undefined}
        defaultRemind={state.mode === "edit" ? state.editingRemind : undefined}
        defaultMeetStart={editingWindow?.start}
        defaultMeetEnd={editingWindow?.end}
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

  if (state.mode === "projectManage") {
    const proj = state.manageProjectId
      ? (projectById.get(state.manageProjectId) ?? null)
      : null;
    const isOwner = !!(
      proj &&
      identity?.userId &&
      proj.ownerId === identity.userId
    );
    return (
      <ProjectManageView
        project={proj}
        members={state.manageMembers}
        membersLoaded={state.manageMembersLoaded}
        editing={state.manageEditing}
        busy={state.manageBusy}
        error={state.manageError}
        nowMs={nowMs}
        isOwner={isOwner}
        onClose={() => dispatch({ type: "EXIT_PROJECT_MANAGE" })}
        onOpenInvitePicker={() =>
          dispatch({ type: "MANAGE_EDIT", editing: { kind: "invitePicker" } })
        }
        onPickInviteRole={(role) => {
          if (!invites || !proj) return;
          dispatch({ type: "MANAGE_BUSY", busy: true });
          void (async () => {
            try {
              const inv = await invites.create({ projectId: proj.id, role });
              dispatch({ type: "MANAGE_BUSY", busy: false });
              dispatch({
                type: "MANAGE_EDIT",
                editing: {
                  kind: "codeReveal",
                  code: inv.code,
                  role: inv.role,
                  expiresAt: inv.expiresAt,
                },
              });
            } catch (err) {
              dispatch({ type: "MANAGE_ERROR", error: (err as Error).message });
            }
          })();
        }}
        onDismissModal={() => dispatch({ type: "MANAGE_EDIT", editing: null })}
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
          void hydrateTodoDescription(id);
        }}
        onClose={() => dispatch({ type: "CLOSE_SEARCH" })}
      />
    );
  }

  if (state.mode === "searchDetail") {
    const current = state.searchDetailTodoId
      ? (state.todos.find((t) => t.id === state.searchDetailTodoId) ?? null)
      : null;
    if (!current) {
      dispatch({ type: "SEARCH_CLOSE_DETAIL" });
      return null;
    }
    const proj = current.projectId
      ? (projectById.get(current.projectId) ?? null)
      : null;
    return (
      <TodoDetailView
        todo={current}
        project={proj}
        ownerName={identity?.userName}
        nowMs={nowMs}
        onClose={() => dispatch({ type: "SEARCH_CLOSE_DETAIL" })}
        onToggleDone={() => void toggleDone(current)}
        onEdit={() =>
          void enterEditWithFullTodo(
            current.id,
            current.title,
            current.description,
          )
        }
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
      dispatch({ type: "CLOSE_TODO_DETAIL" });
      return null;
    }
    const proj = current.projectId
      ? (projectById.get(current.projectId) ?? null)
      : null;
    return (
      <TodoDetailView
        todo={current}
        project={proj}
        ownerName={identity?.userName}
        nowMs={nowMs}
        onClose={() => dispatch({ type: "CLOSE_TODO_DETAIL" })}
        onToggleDone={() => void toggleDone(current)}
        onEdit={() =>
          void enterEditWithFullTodo(
            current.id,
            current.title,
            current.description,
          )
        }
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

  if (state.mode === "notifications") {
    return (
      <NotificationsView
        reminders={state.reminders}
        projects={state.projects}
        nowMs={nowMs}
        onClose={() => dispatch({ type: "CLOSE_NOTIFICATIONS" })}
      />
    );
  }

  if (state.mode === "about") {
    return (
      <AboutView
        version={VERSION}
        onClose={() => dispatch({ type: "CLOSE_ABOUT" })}
      />
    );
  }

  if (state.mode === "projectConfirmDelete") {
    const target = state.deletingProjectId
      ? state.projects.find((p) => p.id === state.deletingProjectId)
      : null;
    const name = target?.name ?? "this project";
    const todoCount = state.deletingProjectId
      ? state.todos.filter((t) => t.projectId === state.deletingProjectId)
          .length
      : 0;
    return (
      <ConfirmDialog
        title="Delete project"
        tone={color.danger}
        footerMode="confirm delete"
        message={
          <>
            <Text wrap="wrap">
              Delete project{" "}
              <Text color={color.accent} bold>
                {name}
              </Text>
              ?
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
        {}
        <Box flexDirection="column" width={leftColW}>
          <Box>
            <TitledPanel
              title="Server"
              width={serverW}
              paddingY={1}
              height={topRowH}
            >
              <Box
                flexDirection="column"
                flexGrow={1}
                justifyContent="center"
                alignItems="center"
              >
                <Logo />
                <Box marginTop={1}>
                  <Text color={color.muted}>self-hosted todo</Text>
                </Box>
              </Box>
            </TitledPanel>

            <Box width={topGap} />

            <TitledPanel
              title="Status"
              width={statusW}
              paddingY={1}
              height={topRowH}
            >
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

          <TitledPanel
            title="Todos"
            width={leftColW}
            paddingY={1}
            height={todosH}
            focused
          >
            {}
            <Box>
              <Text color={color.accent2} bold>
                {openCount}
              </Text>
              <Text color={color.muted}>{" open  "}</Text>
              <Text color={color.muted} dimColor>
                {icon.dot}
              </Text>
              <Text color={color.muted}>{"  "}</Text>
              <Text color={color.success} bold>
                {doneTodayCount}
              </Text>
              <Text color={color.muted}>{" done today"}</Text>
              <Box flexGrow={1} />
              {state.unreadReminders > 0 && (
                <Box marginRight={2}>
                  <Text color={color.warn}>{icon.due} </Text>
                  <Text color={color.warn} bold>
                    {state.unreadReminders}
                  </Text>
                  <Text color={color.muted} dimColor>
                    {" new"}
                  </Text>
                </Box>
              )}
              <Text color={color.muted} dimColor>
                {state.filter === "today"
                  ? "sorted by due"
                  : "sorted by updated"}
              </Text>
            </Box>
            <Box marginTop={1}>
              <Tabs
                tabs={[
                  {
                    key: "today",
                    label: "Due",
                    count: state.todos.filter(
                      (t) => !t.done && dueTodayOrOverdue(t, nowMs),
                    ).length,
                    kind: "system",
                    prefixIcon: icon.due,
                  },
                  {
                    key: "inbox",
                    label: "Private",
                    count: state.todos.filter((t) => !t.projectId && !t.done)
                      .length,
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
                    count: state.todos.filter(
                      (t) => t.projectId === p.id && !t.done,
                    ).length,
                    kind: "project" as const,
                    prefixIcon: icon.on,
                    prefixColor: swatchColor(p.color),
                  })),
                ]}
                activeKey={activeTab}
              />
            </Box>
            {state.toast?.kind === "doneToggled" &&
              (() => {
                const reopened = state.toast.prevDone;
                const glyph = reopened ? icon.open : icon.done;
                const tint = reopened ? color.accent2 : color.success;
                const verb = reopened ? "reopened" : "completed";
                return (
                  <Box marginTop={1}>
                    <Text color={tint}>{glyph}</Text>
                    <Text color={color.muted}>{` ${verb} "`}</Text>
                    <Text color={color.accent}>{state.toast.title}</Text>
                    <Text color={color.muted}>{'"'}</Text>
                    <Box flexGrow={1} />
                    <Text color={color.muted}>press </Text>
                    <Text color={color.accent} bold>
                      z
                    </Text>
                    <Text color={color.muted}> to undo</Text>
                  </Box>
                );
              })()}
            <Box marginTop={1} flexDirection="column">
              {showSpinner ? (
                <Spinner label="Loading todos…" />
              ) : visible.length === 0 ? (
                state.filter === "done" ? (
                  <Text color={color.muted} dimColor>
                    {"  "}No completions yet. Finished todos land here.
                  </Text>
                ) : state.filter === "today" ? (
                  <Text color={color.muted} dimColor>
                    {"  "}Nothing due today. Give a todo a due date with{" "}
                    <Text color={color.accent}>e</Text>.
                  </Text>
                ) : (
                  <Text color={color.muted} dimColor>
                    {"  "}Nothing here. Press{" "}
                    <Text color={color.accent}>i</Text> to add a todo.
                  </Text>
                )
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
                        {listWindow.moreAbove > 0
                          ? `↑ ${listWindow.moreAbove} more`
                          : ""}
                      </Text>
                      <Box flexGrow={1} />
                      <Text color={color.muted} dimColor>
                        {listWindow.moreBelow > 0
                          ? `${listWindow.moreBelow} more ↓`
                          : ""}
                      </Text>
                    </Box>
                  )}
                </>
              )}
            </Box>
          </TitledPanel>
        </Box>

        <Box width={colGap} />

        {}
        <Box flexDirection="column" width={rightColW}>
          <TitledPanel
            title="Activity"
            width={rightColW}
            paddingY={1}
            height={activityH}
            borderTint={color.accent2}
          >
            {}
            <Box>
              <Text color={color.muted} dimColor>
                ▒
              </Text>
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
            {}
            <XAxis days={ACTIVITY_DAYS} />
            {}
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
                  ? (projectById.get(visible[state.cursor]!.projectId!) ?? null)
                  : null
              }
              ownerName={identity?.userName}
              nowMs={nowMs}
              panelWidth={rightColW}
              panelHeight={todoInfoH}
            />
          </TitledPanel>
        </Box>
      </Box>

      {state.error && <ErrorAlert message={state.error} />}

      <Footer mode="normal" version={VERSION} hints={listHints} outerPadX={1} />
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
  const serverVersion = displayVersion(serverInfo?.version ?? "");
  const client = displayVersion(clientVersion);
  const rows: Array<[string, string, string | undefined]> = [
    ["user", userName ?? "—", color.accent2],
    ["server", server ? stripScheme(server) : "local", color.accent2],
    ["version", serverVersion || (serverInfo ? "local" : "—"), color.accent],
  ];
  if (client) rows.push(["client", client, color.accent]);
  rows.push([
    "config",
    configPath ? tildifyPath(configPath) : "—",
    color.muted,
  ]);
  const connTint = serverInfo
    ? color.success
    : server
      ? color.warn
      : color.muted;
  const connLabel = serverInfo ? "connected" : server ? "probing…" : "local";
  const showSyncing = useMinHold(syncing, 600);
  const spinnerFrame = useSpinnerFrame(showSyncing);
  return (
    <Box flexDirection="column">
      {rows.map(([label, value, tint]) => (
        <Box key={label}>
          <Box width={7}>
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
        {showSyncing && (
          <Text color={color.muted}>{`  ${spinnerFrame} syncing`}</Text>
        )}
      </Box>
    </Box>
  );
}

function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

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
  const markColor = todo.done
    ? color.success
    : highlighted
      ? color.accent
      : color.muted;
  const bar = highlighted ? icon.selectBar : " ";
  const age = relativeTime(nowMs, todo.updatedAt);
  const ageWidth = 4;
  const dueAt = todo.dueAt === undefined ? undefined : Number(todo.dueAt);
  const allDay = todo.dueAllDay ?? false;
  const overdue = dueAt !== undefined && isOverdue(dueAt, allDay, nowMs);
  const dueTint = overdue
    ? color.danger
    : dueAt !== undefined && dueAt - nowMs < 86_400_000
      ? color.warn
      : color.muted;
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
      <Box width={6} justifyContent="flex-end">
        <Text color={todo.done ? color.muted : dueTint} dimColor={todo.done}>
          {dueAt === undefined
            ? todo.remindAt !== undefined
              ? "⏰"
              : ""
            : dueLabel(dueAt, allDay, nowMs, todo.dueZone)}
        </Text>
      </Box>
      <Text> </Text>
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
  ["m", "manage"],
  ["/", "search"],
  ["n", "reminders"],
  ["h/l", "tab"],
  ["s", "settings"],
  ["?", "help"],
];

function activeProjectId(filter: Filter): string | undefined {
  if (typeof filter === "string") return undefined;
  return filter.id;
}

function filterToTabKey(filter: Filter): string {
  return filterKey(filter);
}

interface WindowSlice<T> {
  items: T[];
  start: number;
  moreAbove: number;
  moreBelow: number;
}
function sliceWindow<T>(
  items: T[],
  cursor: number,
  viewportH: number,
): WindowSlice<T> {
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

function sum(xs: number[]): number {
  let total = 0;
  for (const x of xs) total += x;
  return total;
}

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

function activityByDay(
  todos: Todo[],
  days: number,
  kind: "created" | "done",
): number[] {
  const today = startOfDay(Date.now());
  const buckets = new Array(days).fill(0);
  for (const t of todos) {
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
