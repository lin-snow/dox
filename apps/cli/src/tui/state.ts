import type {
  ActivityEvent,
  OutgoingInvite,
  Project,
  ProjectMember,
  ServerSettings,
  Todo,
} from "@dox/core";

import type { Filter } from "./components/layout/Sidebar";
import { filterKey } from "./components/layout/Sidebar";

export type Mode =
  | "list"
  | "add"
  | "edit"
  | "settings"
  | "projectAdd"
  | "projectManage"
  | "projectConfirmDelete"
  | "todoDetail"
  | "search"
  | "searchDetail"
  | "about";

export type ManageEditing =
  | { kind: "invitePicker" }
  | { kind: "codeReveal"; code: string; expiresAt: string; role: string };
export type Focus = "list" | "sidebar";

export type Toast = {
  kind: "doneToggled";
  todoId: string;
  title: string;
  prevDone: boolean;
  expiresAt: number;
};

export type SettingsTabKey = "server" | "account" | "invites";

export type SettingsEditing =
  | { kind: "changePassword" }
  | { kind: "serverName" }
  | { kind: "serverDescription" }
  | { kind: "registrationToggle"; next: boolean }
  | { kind: "signOut" }
  | { kind: "redeemCode" }
  | { kind: "revokeInvite"; codeHash: string };

export interface State {
  mode: Mode;
  focus: Focus;
  todos: Todo[];
  projects: Project[];
  events: ActivityEvent[];
  filter: Filter;
  cursor: number;
  sidebarCursor: number;
  editingTitle: string;
  editingDescription: string;
  editingId: string | null;
  loading: boolean;
  error: string | null;
  helpOpen: boolean;
  syncing: boolean;
  settingsTab: SettingsTabKey;
  settingsCursor: number;
  settingsServer: ServerSettings | null;
  settingsServerLoaded: boolean;
  settingsOutgoing: OutgoingInvite[];
  settingsOutgoingLoaded: boolean;
  settingsEditing: SettingsEditing | null;
  settingsBusy: boolean;
  settingsError: string | null;
  settingsNotice: string | null;
  manageProjectId: string | null;
  manageMembers: ProjectMember[];
  manageMembersLoaded: boolean;
  manageEditing: ManageEditing | null;
  manageBusy: boolean;
  manageError: string | null;
  deletingProjectId: string | null;
  searchQuery: string;
  searchCursor: number;
  searchDetailTodoId: string | null;
  toast: Toast | null;
}

export type Action =
  | { type: "TODOS_LOADED"; todos: Todo[] }
  | { type: "PROJECTS_LOADED"; projects: Project[] }
  | { type: "EVENTS_LOADED"; events: ActivityEvent[] }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "SYNC_START" }
  | { type: "SYNC_END" }
  | { type: "CLEAR_ERROR" }
  | { type: "CURSOR_UP" }
  | { type: "CURSOR_DOWN" }
  | { type: "CURSOR_FIRST" }
  | { type: "CURSOR_LAST" }
  | { type: "FOCUS_TOGGLE" }
  | { type: "FILTER_SET"; filter: Filter }
  | { type: "FILTER_CYCLE"; direction: 1 | -1 }
  | { type: "ENTER_ADD" }
  | {
      type: "ENTER_EDIT";
      id: string;
      initialTitle: string;
      initialDescription: string;
    }
  | { type: "ENTER_PROJECT_ADD" }
  | { type: "PROJECT_ADDED"; project: Project }
  | { type: "ENTER_PROJECT_DELETE_CONFIRM"; id: string }
  | { type: "PROJECT_DELETED"; id: string }
  | { type: "EXIT_MODE" }
  | { type: "TOGGLE_HELP" }
  | { type: "CLOSE_HELP" }
  | { type: "OPEN_SETTINGS" }
  | { type: "CLOSE_SETTINGS" }
  | { type: "SETTINGS_TAB"; tab: SettingsTabKey }
  | { type: "SETTINGS_CURSOR"; index: number }
  | { type: "SETTINGS_SERVER_SET"; settings: ServerSettings | null }
  | { type: "SETTINGS_OUTGOING_SET"; invites: OutgoingInvite[] }
  | { type: "SETTINGS_EDIT"; editing: SettingsEditing | null }
  | { type: "SETTINGS_BUSY"; busy: boolean }
  | { type: "SETTINGS_ERROR"; error: string | null }
  | { type: "SETTINGS_NOTICE"; notice: string | null }
  | { type: "ENTER_PROJECT_MANAGE"; projectId: string }
  | { type: "EXIT_PROJECT_MANAGE" }
  | { type: "MANAGE_MEMBERS_SET"; members: ProjectMember[] }
  | { type: "MANAGE_EDIT"; editing: ManageEditing | null }
  | { type: "MANAGE_BUSY"; busy: boolean }
  | { type: "MANAGE_ERROR"; error: string | null }
  | { type: "OPEN_TODO_DETAIL" }
  | { type: "CLOSE_TODO_DETAIL" }
  | { type: "OPEN_SEARCH" }
  | { type: "CLOSE_SEARCH" }
  | { type: "SEARCH_SET_QUERY"; query: string }
  | { type: "SEARCH_CURSOR_UP" }
  | { type: "SEARCH_CURSOR_DOWN" }
  | { type: "SEARCH_CURSOR_SET"; index: number }
  | { type: "SEARCH_RESULT_COUNT"; count: number }
  | { type: "SEARCH_OPEN_DETAIL"; id: string }
  | { type: "SEARCH_CLOSE_DETAIL" }
  | { type: "TODO_ADDED"; todo: Todo }
  | { type: "TODO_UPDATED"; todo: Todo }
  | { type: "TODO_DELETED"; id: string }
  | { type: "OPEN_ABOUT" }
  | { type: "CLOSE_ABOUT" }
  | { type: "TOAST_SET"; toast: Toast }
  | { type: "TOAST_CLEAR" };

export const initialState: State = {
  mode: "list",
  focus: "list",
  todos: [],
  projects: [],
  events: [],
  filter: "inbox",
  cursor: 0,
  sidebarCursor: 0,
  editingTitle: "",
  editingDescription: "",
  editingId: null,
  loading: true,
  error: null,
  helpOpen: false,
  syncing: false,
  settingsTab: "server",
  settingsCursor: 0,
  settingsServer: null,
  settingsServerLoaded: false,
  settingsOutgoing: [],
  settingsOutgoingLoaded: false,
  settingsEditing: null,
  settingsBusy: false,
  settingsError: null,
  settingsNotice: null,
  manageProjectId: null,
  manageMembers: [],
  manageMembersLoaded: false,
  manageEditing: null,
  manageBusy: false,
  manageError: null,
  deletingProjectId: null,
  searchQuery: "",
  searchCursor: 0,
  searchDetailTodoId: null,
  toast: null,
};

export function visibleTodos(state: State): Todo[] {
  const f = state.filter;
  if (f === "done") {
    return state.todos
      .filter((t) => t.done)
      .slice()
      .sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
  }
  const base = state.todos.filter((t) => !t.done);
  if (f === "inbox") return base.filter((t) => !t.projectId);
  return base.filter((t) => t.projectId === f.id);
}

export function filterList(projects: Project[]): Filter[] {
  return [
    "inbox",
    "done",
    ...projects.map((p) => ({ type: "project" as const, id: p.id })),
  ];
}

function clampCursor(cursor: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(cursor, length - 1));
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "TODOS_LOADED": {
      const prevById = new Map(state.todos.map((t) => [t.id, t]));
      const todos = action.todos.map((t) => {
        if (t.description !== undefined) return t;
        const prev = prevById.get(t.id);
        return prev?.description !== undefined
          ? { ...t, description: prev.description }
          : t;
      });
      const next = { ...state, todos, loading: false, error: null };
      return {
        ...next,
        cursor: clampCursor(state.cursor, visibleTodos(next).length),
      };
    }
    case "PROJECTS_LOADED":
      return { ...state, projects: action.projects };
    case "EVENTS_LOADED":
      return { ...state, events: action.events };
    case "LOAD_ERROR":
      return { ...state, loading: false, syncing: false, error: action.error };
    case "SYNC_START":
      return { ...state, syncing: true };
    case "SYNC_END":
      return { ...state, syncing: false };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "CURSOR_UP":
      if (state.focus === "sidebar") {
        return {
          ...state,
          sidebarCursor: Math.max(0, state.sidebarCursor - 1),
        };
      }
      return { ...state, cursor: Math.max(0, state.cursor - 1) };
    case "CURSOR_DOWN": {
      if (state.focus === "sidebar") {
        const max = Math.max(0, filterList(state.projects).length - 1);
        return {
          ...state,
          sidebarCursor: Math.min(max, state.sidebarCursor + 1),
        };
      }
      const max = Math.max(0, visibleTodos(state).length - 1);
      return { ...state, cursor: Math.min(max, state.cursor + 1) };
    }
    case "CURSOR_FIRST":
      return state.focus === "sidebar"
        ? { ...state, sidebarCursor: 0 }
        : { ...state, cursor: 0 };
    case "CURSOR_LAST": {
      if (state.focus === "sidebar") {
        const max = Math.max(0, filterList(state.projects).length - 1);
        return { ...state, sidebarCursor: max };
      }
      const max = Math.max(0, visibleTodos(state).length - 1);
      return { ...state, cursor: max };
    }
    case "FOCUS_TOGGLE": {
      const nextFocus: Focus = state.focus === "list" ? "sidebar" : "list";
      if (nextFocus !== "sidebar") return { ...state, focus: nextFocus };
      const list = filterList(state.projects);
      const currentKey = filterKey(state.filter);
      const idx = list.findIndex((f) => filterKey(f) === currentKey);
      return { ...state, focus: nextFocus, sidebarCursor: idx >= 0 ? idx : 0 };
    }
    case "FILTER_SET": {
      const next = { ...state, filter: action.filter, focus: "list" as Focus };
      return { ...next, cursor: clampCursor(0, visibleTodos(next).length) };
    }
    case "FILTER_CYCLE": {
      const list = filterList(state.projects);
      const currentKey = filterKey(state.filter);
      const idx = list.findIndex((f) => filterKey(f) === currentKey);
      const nextIdx = (idx + action.direction + list.length) % list.length;
      const nextFilter = list[nextIdx] ?? state.filter;
      const next = { ...state, filter: nextFilter, sidebarCursor: nextIdx };
      return { ...next, cursor: clampCursor(0, visibleTodos(next).length) };
    }
    case "ENTER_ADD":
      return {
        ...state,
        mode: "add",
        editingTitle: "",
        editingDescription: "",
        error: null,
        helpOpen: false,
      };
    case "ENTER_EDIT":
      return {
        ...state,
        mode: "edit",
        editingId: action.id,
        editingTitle: action.initialTitle,
        editingDescription: action.initialDescription,
        error: null,
        helpOpen: false,
      };
    case "ENTER_PROJECT_ADD":
      return { ...state, mode: "projectAdd", error: null, helpOpen: false };
    case "PROJECT_ADDED": {
      const projects = [...state.projects, action.project];
      const filter: Filter = { type: "project", id: action.project.id };
      const next = { ...state, projects, filter, mode: "list" as Mode };
      return { ...next, cursor: clampCursor(0, visibleTodos(next).length) };
    }
    case "ENTER_PROJECT_DELETE_CONFIRM":
      return {
        ...state,
        mode: "projectConfirmDelete",
        deletingProjectId: action.id,
        error: null,
        helpOpen: false,
      };
    case "PROJECT_DELETED": {
      const projects = state.projects.filter((p) => p.id !== action.id);
      const todos = state.todos.filter((t) => t.projectId !== action.id);
      const wasActiveFilter =
        typeof state.filter !== "string" &&
        state.filter.type === "project" &&
        state.filter.id === action.id;
      const filter: Filter = wasActiveFilter ? "inbox" : state.filter;
      const next = {
        ...state,
        projects,
        todos,
        filter,
        mode: "list" as Mode,
        deletingProjectId: null,
      };
      return { ...next, cursor: clampCursor(0, visibleTodos(next).length) };
    }
    case "EXIT_MODE":
      return {
        ...state,
        mode: "list",
        editingTitle: "",
        editingDescription: "",
        editingId: null,
        deletingProjectId: null,
      };
    case "TOGGLE_HELP":
      return { ...state, helpOpen: !state.helpOpen };
    case "CLOSE_HELP":
      return { ...state, helpOpen: false };
    case "OPEN_SETTINGS":
      return {
        ...state,
        mode: "settings",
        helpOpen: false,
        settingsServerLoaded: false,
        settingsOutgoingLoaded: false,
        settingsEditing: null,
        settingsError: null,
        settingsNotice: null,
        settingsBusy: false,
      };
    case "CLOSE_SETTINGS":
      return {
        ...state,
        mode: "list",
        settingsEditing: null,
        settingsError: null,
        settingsNotice: null,
      };
    case "SETTINGS_TAB":
      return {
        ...state,
        settingsTab: action.tab,
        settingsCursor: 0,
        settingsError: null,
        settingsNotice: null,
      };
    case "SETTINGS_CURSOR":
      return { ...state, settingsCursor: action.index };
    case "SETTINGS_SERVER_SET":
      return {
        ...state,
        settingsServer: action.settings,
        settingsServerLoaded: true,
      };
    case "SETTINGS_OUTGOING_SET":
      return {
        ...state,
        settingsOutgoing: action.invites,
        settingsOutgoingLoaded: true,
      };
    case "SETTINGS_EDIT":
      return { ...state, settingsEditing: action.editing, settingsError: null };
    case "SETTINGS_BUSY":
      return { ...state, settingsBusy: action.busy };
    case "SETTINGS_ERROR":
      return { ...state, settingsError: action.error, settingsBusy: false };
    case "SETTINGS_NOTICE":
      return { ...state, settingsNotice: action.notice };
    case "ENTER_PROJECT_MANAGE":
      return {
        ...state,
        mode: "projectManage",
        manageProjectId: action.projectId,
        manageMembers: [],
        manageMembersLoaded: false,
        manageEditing: null,
        manageBusy: false,
        manageError: null,
        helpOpen: false,
      };
    case "EXIT_PROJECT_MANAGE":
      return {
        ...state,
        mode: "list",
        manageProjectId: null,
        manageEditing: null,
        manageError: null,
      };
    case "MANAGE_MEMBERS_SET":
      return {
        ...state,
        manageMembers: action.members,
        manageMembersLoaded: true,
      };
    case "MANAGE_EDIT":
      return { ...state, manageEditing: action.editing, manageError: null };
    case "MANAGE_BUSY":
      return { ...state, manageBusy: action.busy };
    case "MANAGE_ERROR":
      return { ...state, manageError: action.error, manageBusy: false };
    case "OPEN_TODO_DETAIL":
      return { ...state, mode: "todoDetail", helpOpen: false };
    case "CLOSE_TODO_DETAIL":
      return { ...state, mode: "list" };
    case "OPEN_SEARCH":
      return {
        ...state,
        mode: "search",
        searchQuery: "",
        searchCursor: 0,
        helpOpen: false,
        error: null,
      };
    case "CLOSE_SEARCH":
      return { ...state, mode: "list", searchDetailTodoId: null };
    case "SEARCH_SET_QUERY":
      return { ...state, searchQuery: action.query, searchCursor: 0 };
    case "SEARCH_CURSOR_UP":
      return { ...state, searchCursor: Math.max(0, state.searchCursor - 1) };
    case "SEARCH_CURSOR_DOWN":
      return { ...state, searchCursor: state.searchCursor + 1 };
    case "SEARCH_CURSOR_SET":
      return { ...state, searchCursor: Math.max(0, action.index) };
    case "SEARCH_RESULT_COUNT": {
      const max = Math.max(0, action.count - 1);
      if (state.searchCursor <= max) return state;
      return { ...state, searchCursor: max };
    }
    case "SEARCH_OPEN_DETAIL":
      return {
        ...state,
        mode: "searchDetail",
        searchDetailTodoId: action.id,
        helpOpen: false,
      };
    case "SEARCH_CLOSE_DETAIL":
      return { ...state, mode: "search", searchDetailTodoId: null };
    case "TODO_ADDED": {
      const next = {
        ...state,
        todos: [action.todo, ...state.todos],
        mode: "list" as Mode,
        editingTitle: "",
        editingDescription: "",
      };
      return { ...next, cursor: 0 };
    }
    case "TODO_UPDATED": {
      const next = {
        ...state,
        todos: state.todos.map((t) =>
          t.id === action.todo.id ? { ...t, ...action.todo } : t,
        ),
      };
      return {
        ...next,
        cursor: clampCursor(state.cursor, visibleTodos(next).length),
      };
    }
    case "TODO_DELETED": {
      const todos = state.todos.filter((t) => t.id !== action.id);
      const next = { ...state, todos };
      return {
        ...next,
        cursor: clampCursor(state.cursor, visibleTodos(next).length),
      };
    }
    case "OPEN_ABOUT":
      return { ...state, mode: "about", helpOpen: false, error: null };
    case "CLOSE_ABOUT":
      return { ...state, mode: "list" };
    case "TOAST_SET":
      return { ...state, toast: action.toast };
    case "TOAST_CLEAR":
      return { ...state, toast: null };
    default:
      return state;
  }
}
