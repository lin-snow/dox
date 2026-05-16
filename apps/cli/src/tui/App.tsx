import { Box, Text, useApp, useInput } from "ink";
import { Spinner, TextInput } from "@inkjs/ui";
import { useCallback, useEffect, useReducer } from "react";

import type { TodoApi } from "@dox/core";

import { ErrorAlert } from "./components/ErrorAlert";
import { HelpBar } from "./components/HelpBar";
import { TodoList } from "./components/TodoList";
import { initialState, reducer } from "./state";

const POLL_INTERVAL_MS = 30_000;

export function App({ api }: { api: TodoApi }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { exit } = useApp();

  const refresh = useCallback(async () => {
    try {
      const todos = await api.listTodos();
      dispatch({ type: "TODOS_LOADED", todos });
    } catch (err) {
      dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
    }
  }, [api]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Deactivate in add/edit modes so TextInput owns the keystrokes.
  useInput(
    (input, key) => {
      if (input === "q" || (key.ctrl && input === "c")) {
        exit();
        return;
      }
      if (input === "j" || key.downArrow) dispatch({ type: "CURSOR_DOWN" });
      else if (input === "k" || key.upArrow) dispatch({ type: "CURSOR_UP" });
      else if (input === "i" || input === "a") dispatch({ type: "ENTER_ADD" });
      else if (input === "r") void refresh();
      else if (state.error) dispatch({ type: "CLEAR_ERROR" });

      const current = state.todos[state.cursor];
      if (!current) return;

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
        dispatch({ type: "ENTER_EDIT", id: current.id, initialTitle: current.title });
      }
    },
    { isActive: state.mode === "list" },
  );

  const handleSubmit = (value: string) => {
    const title = value.trim();
    if (!title) {
      dispatch({ type: "EXIT_MODE" });
      return;
    }
    if (state.mode === "add") {
      void (async () => {
        try {
          const todo = await api.createTodo(title);
          dispatch({ type: "TODO_ADDED", todo });
        } catch (err) {
          dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
        }
      })();
    } else if (state.mode === "edit" && state.editingId) {
      const id = state.editingId;
      void (async () => {
        try {
          const updated = await api.updateTodo(id, { title });
          dispatch({ type: "TODO_UPDATED", todo: updated });
        } catch (err) {
          dispatch({ type: "LOAD_ERROR", error: (err as Error).message });
        }
      })();
    }
  };

  const showSpinner = state.loading && state.todos.length === 0;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        dox
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {showSpinner ? <Spinner label="Loading todos…" /> : <TodoList todos={state.todos} cursor={state.cursor} />}
      </Box>
      {state.error && <ErrorAlert message={state.error} />}
      {(state.mode === "add" || state.mode === "edit") && (
        <Box marginTop={1}>
          <Text color="green">{state.mode === "add" ? "+ " : "✎ "}</Text>
          <TextInput
            defaultValue={state.inputValue}
            placeholder={state.mode === "add" ? "new todo title…" : ""}
            onSubmit={handleSubmit}
          />
        </Box>
      )}
      <HelpBar mode={state.mode} />
    </Box>
  );
}
