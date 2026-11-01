import { useState } from "react";

import type { Project, Todo } from "../api";
import { projectTint } from "../tint";
import { IconGrid, IconPlus } from "./Icons";
import { TaskRow } from "./TaskRow";

interface Props {
  label: string;
  count: number;
  todos: Todo[];
  projects: Project[];
  filter: string;
  cursorId: string | null;
  showFilters: boolean;
  empty: string;
  onFilter: (id: string) => void;
  onCreateProject: (name: string) => void;
  onToggle: (todo: Todo) => void;
  onOpen: (todo: Todo) => void;
  onChecklist: (todo: Todo, index: number) => void;
}

/** One deadline bucket. Only the first column carries the filter row, which
 * is what keeps the other two headers down to a name and a count. */
export function Column({
  label,
  count,
  todos,
  projects,
  filter,
  cursorId,
  showFilters,
  empty,
  onFilter,
  onCreateProject,
  onToggle,
  onOpen,
  onChecklist,
}: Props) {
  /** Non-null while the "+" is an input: naming a new project inline beats a
   * dialog for the one-field case. */
  const [naming, setNaming] = useState<string | null>(null);

  return (
    <section className="column">
      <header className="col-head">
        <h2 className="col-title">
          {label}
          <span className="col-count">{count}</span>
        </h2>

        {showFilters ? (
          <div className="filters">
            <button
              type="button"
              className="pill"
              data-on={filter === "all" || undefined}
              onClick={() => onFilter("all")}
            >
              <IconGrid size={13} />
              All
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="dot-btn"
                data-on={filter === project.id || undefined}
                title={project.name}
                aria-label={`filter: ${project.name}`}
                onClick={() => onFilter(project.id)}
              >
                <i className="ring" style={projectTint(project, projects)} />
              </button>
            ))}
            {naming === null ? (
              <button
                type="button"
                className="add-btn"
                title="new project"
                aria-label="new project"
                onClick={() => setNaming("")}
              >
                <IconPlus size={15} />
              </button>
            ) : (
              <input
                className="pill-input"
                value={naming}
                placeholder="project name"
                aria-label="new project name"
                autoFocus
                onChange={(event) => setNaming(event.target.value)}
                onBlur={() => setNaming(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && naming.trim()) {
                    onCreateProject(naming.trim());
                    setNaming(null);
                  }
                  if (event.key === "Escape") setNaming(null);
                }}
              />
            )}
          </div>
        ) : null}
      </header>

      <div className="col-body">
        {todos.length === 0 ? (
          <p className="col-empty">{empty}</p>
        ) : (
          todos.map((todo) => (
            <TaskRow
              key={todo.id}
              todo={todo}
              projects={projects}
              cursor={todo.id === cursorId}
              onToggle={onToggle}
              onOpen={onOpen}
              onChecklist={onChecklist}
            />
          ))
        )}
      </div>
    </section>
  );
}
