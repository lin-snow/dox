import { useEffect, useMemo, useState } from "react";

import type { Project, Todo } from "../api";
import { IconSearch } from "./Icons";

interface Props {
  todos: Todo[];
  projects: Map<string, Project>;
  onOpen: (id: string) => void;
  onClose: () => void;
}

/**
 * Client-side search over the loaded list. The server has no query RPC, and
 * adding one would break the thin-client rule for a feature the list already
 * answers: titles of everything you can see.
 */
export function SearchOverlay({ todos, projects, onOpen, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return todos.slice(0, 8);
    return todos
      .filter((todo) => todo.title.toLowerCase().includes(needle))
      .slice(0, 20);
  }, [todos, query]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const active = results[Math.min(cursor, Math.max(0, results.length - 1))];

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="search-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="search"
      >
        <div className="search-field">
          <IconSearch size={16} />
          <input
            id="search"
            name="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search todos…"
            autoFocus
            spellCheck={false}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((index) => Math.min(index + 1, results.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter" && active) onOpen(active.id);
              if (event.key === "Escape") onClose();
            }}
          />
          <kbd>esc</kbd>
        </div>

        <div className="search-results">
          {results.length === 0 ? <p className="empty">no matches</p> : null}
          {results.map((todo, index) => (
            <button
              key={todo.id}
              type="button"
              className={
                todo.id === active?.id ? "search-row active" : "search-row"
              }
              onMouseEnter={() => setCursor(index)}
              onClick={() => onOpen(todo.id)}
            >
              <span
                className={todo.done ? "search-title done" : "search-title"}
              >
                {todo.title}
              </span>
              {todo.projectId ? (
                <span className="chip">
                  {projects.get(todo.projectId)?.name ?? "project"}
                </span>
              ) : (
                <span className="chip">Inbox</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
