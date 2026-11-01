import { useState } from "react";

import type { Project, Todo } from "../api";
import type { Bucket } from "../board";
import { projectTint } from "../tint";
import { IconGrid, IconInbox, IconPlus } from "./Icons";
import { TaskRow } from "./TaskRow";

interface Props {
  bucket: Bucket;
  label: string;
  count: number;
  todos: Todo[];
  projects: Project[];
  filter: string;
  cursorId: string | null;
  showFilters: boolean;
  empty: string;
  addLabel: string;
  /** The row being dragged, if any. */
  dragId: string | null;
  /** Where the drop would land: a row id, or null for "end of this column". */
  dropOver: { id: string | null; bucket: Bucket } | null;
  onFilter: (id: string) => void;
  onCreateProject: (name: string) => void;
  onAdd: () => void;
  onToggle: (todo: Todo) => void;
  onOpen: (todo: Todo) => void;
  onChecklist: (todo: Todo, index: number) => void;
  onDragStart: (todo: Todo) => void;
  onDragOverRow: (todo: Todo) => void;
  onDragOverColumn: () => void;
  onDropRow: (todo: Todo) => void;
  onDropColumn: () => void;
  onDragEnd: () => void;
}

/** One deadline bucket. Only the first column carries the filter row, which
 * is what keeps the other two headers down to a name and a count. */
export function Column({
  bucket,
  label,
  count,
  todos,
  projects,
  filter,
  cursorId,
  showFilters,
  empty,
  addLabel,
  dragId,
  dropOver,
  onFilter,
  onCreateProject,
  onAdd,
  onToggle,
  onOpen,
  onChecklist,
  onDragStart,
  onDragOverRow,
  onDragOverColumn,
  onDropRow,
  onDropColumn,
  onDragEnd,
}: Props) {
  /** Non-null while the "+" is an input: naming a new project inline beats a
   * dialog for the one-field case. */
  const [naming, setNaming] = useState<string | null>(null);

  return (
    <section className="column" aria-label={`${label} column`}>
      <header className="col-head">
        <h2 className="col-title">
          {label}
          <span className="col-count">{count}</span>
        </h2>

        {showFilters ? (
          <div className="filters" role="group" aria-label="filter the board">
            <button
              type="button"
              className="pill"
              aria-pressed={filter === "all"}
              data-on={filter === "all" || undefined}
              onClick={() => onFilter("all")}
            >
              <IconGrid size={13} />
              All
            </button>
            <button
              type="button"
              className="pill"
              aria-pressed={filter === "inbox"}
              data-on={filter === "inbox" || undefined}
              title="Todos without a project"
              onClick={() => onFilter("inbox")}
            >
              <IconInbox size={13} />
              Inbox
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="pill project"
                aria-pressed={filter === project.id}
                data-on={filter === project.id || undefined}
                title={project.name}
                aria-label={`filter: ${project.name}`}
                onClick={() => onFilter(project.id)}
              >
                <i className="ring" style={projectTint(project, projects)} />
                <span className="pill-name">{project.name}</span>
              </button>
            ))}
            {naming === null ? (
              <button
                type="button"
                className="add-btn"
                title="New project"
                aria-label="new project"
                onClick={() => setNaming("")}
              >
                <IconPlus size={15} />
              </button>
            ) : (
              <input
                className="pill-input"
                value={naming}
                placeholder="Project name"
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

      <div
        className="col-body"
        onDragOver={(event) => {
          event.preventDefault();
          onDragOverColumn();
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDropColumn();
        }}
      >
        {todos.length === 0 ? <p className="col-empty">{empty}</p> : null}

        {/* A list, not a pile of divs: the rows are its items and the column
            header is its label. The empty note and the add affordance stay
            outside so the list only ever contains items. No styles: the
            wrapper is a plain block, so the layout is unchanged. */}
        <div className="col-list" role="list" aria-label={`${label} tasks`}>
          {todos.map((todo) => (
            <TaskRow
              key={todo.id}
              todo={todo}
              projects={projects}
              cursor={todo.id === cursorId}
              dragging={dragId === todo.id}
              dropBefore={
                dropOver !== null &&
                dropOver.bucket === bucket &&
                dropOver.id === todo.id &&
                dragId !== todo.id
              }
              onToggle={onToggle}
              onOpen={onOpen}
              onChecklist={onChecklist}
              onDragStart={onDragStart}
              onDragOver={onDragOverRow}
              onDrop={onDropRow}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>

        {/* Always present: the only way to create used to be a keystroke,
            which is invisible. */}
        <button type="button" className="add-row" onClick={onAdd}>
          <IconPlus size={14} />
          <span>{addLabel}</span>
        </button>
      </div>
    </section>
  );
}
