import type { Todo } from "@dox/core";

export type Mode = "list" | "add" | "edit";

export interface State {
  mode: Mode;
  todos: Todo[];
  cursor: number;
  inputValue: string;
  editingId: string | null;
  loading: boolean;
  error: string | null;
}

export type Action =
  | { type: "TODOS_LOADED"; todos: Todo[] }
  | { type: "LOAD_ERROR"; error: string }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "CLEAR_ERROR" }
  | { type: "CURSOR_UP" }
  | { type: "CURSOR_DOWN" }
  | { type: "ENTER_ADD" }
  | { type: "ENTER_EDIT"; id: string; initialTitle: string }
  | { type: "EXIT_MODE" }
  | { type: "INPUT_CHANGE"; value: string }
  | { type: "TODO_ADDED"; todo: Todo }
  | { type: "TODO_UPDATED"; todo: Todo }
  | { type: "TODO_DELETED"; id: string };

export const initialState: State = {
  mode: "list",
  todos: [],
  cursor: 0,
  inputValue: "",
  editingId: null,
  loading: true,
  error: null,
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "TODOS_LOADED": {
      const maxCursor = Math.max(0, action.todos.length - 1);
      return {
        ...state,
        todos: action.todos,
        cursor: Math.min(state.cursor, maxCursor),
        loading: false,
        error: null,
      };
    }
    case "LOAD_ERROR":
      return { ...state, loading: false, error: action.error };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "CURSOR_UP":
      return { ...state, cursor: Math.max(0, state.cursor - 1) };
    case "CURSOR_DOWN":
      return { ...state, cursor: Math.min(state.todos.length - 1, state.cursor + 1) };
    case "ENTER_ADD":
      return { ...state, mode: "add", inputValue: "", error: null };
    case "ENTER_EDIT":
      return { ...state, mode: "edit", editingId: action.id, inputValue: action.initialTitle, error: null };
    case "EXIT_MODE":
      return { ...state, mode: "list", inputValue: "", editingId: null };
    case "INPUT_CHANGE":
      return { ...state, inputValue: action.value };
    case "TODO_ADDED":
      return {
        ...state,
        todos: [action.todo, ...state.todos],
        mode: "list",
        inputValue: "",
        cursor: 0,
      };
    case "TODO_UPDATED":
      return {
        ...state,
        todos: state.todos.map((t) => (t.id === action.todo.id ? action.todo : t)),
        mode: "list",
        inputValue: "",
        editingId: null,
      };
    case "TODO_DELETED": {
      const filtered = state.todos.filter((t) => t.id !== action.id);
      return {
        ...state,
        todos: filtered,
        cursor: Math.max(0, Math.min(state.cursor, filtered.length - 1)),
      };
    }
    default:
      return state;
  }
}
