import type { ActivityEvent, OutgoingInvite, Project, ProjectMember, ServerSettings, Todo } from "@dox/core";

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
  | "searchDetail";

// Sub-state for the project manage screen. Mutually exclusive with the main
// member-list view of that screen — exactly one is up at a time.
export type ManageEditing =
  | { kind: "invitePicker" }
  | { kind: "codeReveal"; code: string; expiresAt: string; role: string };
export type Focus = "list" | "sidebar";

export type SettingsTabKey = "server" | "account" | "invites";

// Exactly one modal is up at a time on the settings screen. The discriminator
// drives which modal renders + which keys are handled.
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
  // Seed values for the TodoEditorView form. The editor owns its own working
  // state once mounted; these only matter for the initial render.
  editingTitle: string;
  editingDescription: string;
  editingId: string | null;
  loading: boolean;
  error: string | null;
  helpOpen: boolean;
  syncing: boolean;
  // Settings view sub-state. Persists across open/close so the user lands back
  // on the same tab + row when they reopen the screen mid-session.
  settingsTab: SettingsTabKey;
  settingsCursor: number;
  // Settings data caches. null/empty = not yet fetched OR not visible to this
  // user (e.g., a non-owner won't have settingsServer). The *Loaded flags
  // distinguish "still loading" from "intentionally empty."
  settingsServer: ServerSettings | null;
  settingsServerLoaded: boolean;
  settingsOutgoing: OutgoingInvite[];
  settingsOutgoingLoaded: boolean;
  // Active modal on the settings screen, or null. Mutually exclusive — only
  // one can be open at a time.
  settingsEditing: SettingsEditing | null;
  // True while an async settings action (save / revoke / sign-out) is in
  // flight. Modals read this to disable submit while waiting.
  settingsBusy: boolean;
  // Last error message produced by a settings action. Rendered inline in the
  // active modal. Cleared on dispatch of SETTINGS_EDIT.
  settingsError: string | null;
  // Project manage view sub-state. Active only when mode === "projectManage".
  manageProjectId: string | null;
  manageMembers: ProjectMember[];
  manageMembersLoaded: boolean;
  manageEditing: ManageEditing | null;
  manageBusy: boolean;
  manageError: string | null;
  // Project pending y/n confirmation. Cleared whenever the prompt is dismissed.
  deletingProjectId: string | null;
  // Search view sub-state. Persists across enter→detail→back so the user lands
  // back on the same query + cursor row when they bounce out of a result.
  searchQuery: string;
  searchCursor: number;
  // Todo opened via the search result list. Lets `todoDetail`/`searchDetail`
  // look up the row by id rather than relying on the list-page cursor.
  searchDetailTodoId: string | null;
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
  | { type: "ENTER_EDIT"; id: string; initialTitle: string; initialDescription: string }
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
  | { type: "TODO_DELETED"; id: string };

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
};

// Private (filter key "inbox") = todos with no project; project filter = todos
// matching projectId. There is no "all" filter — cycling moves only across
// Private and per-project tabs.
export function visibleTodos(state: State): Todo[] {
  const f = state.filter;
  if (f === "inbox") return state.todos.filter((t) => !t.projectId);
  return state.todos.filter((t) => t.projectId === f.id);
}

export function filterList(projects: Project[]): Filter[] {
  return ["inbox", ...projects.map((p) => ({ type: "project" as const, id: p.id }))];
}

function clampCursor(cursor: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(cursor, length - 1));
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "TODOS_LOADED": {
      const next = { ...state, todos: action.todos, loading: false, error: null };
      return { ...next, cursor: clampCursor(state.cursor, visibleTodos(next).length) };
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
        return { ...state, sidebarCursor: Math.max(0, state.sidebarCursor - 1) };
      }
      return { ...state, cursor: Math.max(0, state.cursor - 1) };
    case "CURSOR_DOWN": {
      if (state.focus === "sidebar") {
        const max = Math.max(0, filterList(state.projects).length - 1);
        return { ...state, sidebarCursor: Math.min(max, state.sidebarCursor + 1) };
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
      // Snap sidebar cursor to the currently selected filter so j/k moves
      // relative to "where I am" rather than back to the top.
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
      // Land on the new project so the user sees it immediately. Tabs auto-sync
      // because they read from state.projects + state.filter.
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
      // Server cascades todos.project_id → drop them locally too so we don't
      // flash dangling rows before the next poll catches up.
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
        // Force a fresh fetch on every open so edits made elsewhere (a second
        // client, an API call) are reflected. App.tsx kicks the fetch off when
        // it sees these flags flip back to false.
        settingsServerLoaded: false,
        settingsOutgoingLoaded: false,
        settingsEditing: null,
        settingsError: null,
        settingsBusy: false,
      };
    case "CLOSE_SETTINGS":
      return { ...state, mode: "list", settingsEditing: null, settingsError: null };
    case "SETTINGS_TAB":
      // Resetting the cursor on tab change matches the image: the new tab's
      // first item is always pre-selected.
      return { ...state, settingsTab: action.tab, settingsCursor: 0, settingsError: null };
    case "SETTINGS_CURSOR":
      return { ...state, settingsCursor: action.index };
    case "SETTINGS_SERVER_SET":
      return { ...state, settingsServer: action.settings, settingsServerLoaded: true };
    case "SETTINGS_OUTGOING_SET":
      return { ...state, settingsOutgoing: action.invites, settingsOutgoingLoaded: true };
    case "SETTINGS_EDIT":
      return { ...state, settingsEditing: action.editing, settingsError: null };
    case "SETTINGS_BUSY":
      return { ...state, settingsBusy: action.busy };
    case "SETTINGS_ERROR":
      return { ...state, settingsError: action.error, settingsBusy: false };
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
      return { ...state, manageMembers: action.members, manageMembersLoaded: true };
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
      // Reset cursor whenever the query changes: the result list re-derives, so
      // any prior index is meaningless.
      return { ...state, searchQuery: action.query, searchCursor: 0 };
    case "SEARCH_CURSOR_UP":
      return { ...state, searchCursor: Math.max(0, state.searchCursor - 1) };
    case "SEARCH_CURSOR_DOWN":
      // Cap is enforced by the view: it dispatches SEARCH_CURSOR_SET when the
      // result list shrinks under the cursor. Here we just bump by one.
      return { ...state, searchCursor: state.searchCursor + 1 };
    case "SEARCH_CURSOR_SET":
      return { ...state, searchCursor: Math.max(0, action.index) };
    case "SEARCH_RESULT_COUNT": {
      // Clamp the cursor any time the visible result count changes (typing
      // narrows the list). Keeps the highlight on a real row.
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
      // Returns to the search page with prior query + cursor intact.
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
    case "TODO_UPDATED":
      // Pure data merge — callers control mode transitions. Previously this
      // forced mode back to "list", which fought with async hydration: pressing
      // Enter opened the detail view, then the GetTodo response landed and
      // kicked the user back to the list (visible as a flash).
      return {
        ...state,
        // Merge rather than replace: the next ListTodos refresh strips
        // description, but we still want the just-edited row to keep its
        // updated fields in cache without clobbering a description fetched
        // by an in-progress GetTodo.
        todos: state.todos.map((t) =>
          t.id === action.todo.id ? { ...t, ...action.todo } : t,
        ),
      };
    case "TODO_DELETED": {
      const todos = state.todos.filter((t) => t.id !== action.id);
      const next = { ...state, todos };
      return { ...next, cursor: clampCursor(state.cursor, visibleTodos(next).length) };
    }
    default:
      return state;
  }
}
