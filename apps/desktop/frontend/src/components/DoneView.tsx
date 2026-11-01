import type { Project, Todo } from "../api";
import { TaskRow } from "./TaskRow";

interface Props {
  todos: Todo[];
  projects: Project[];
  cursorId: string | null;
  onToggle: (todo: Todo) => void;
  onOpen: (todo: Todo) => void;
  onChecklist: (todo: Todo, index: number) => void;
}

/**
 * Finished work in one place. The board is open work only, so a ticked todo
 * leaves it and lands here, where it can still be read, edited or reopened.
 *
 * No drag, no deadlines: the order is recency (the caller sorts by updatedAt),
 * which is the only ordering a completed list can honestly claim.
 */
export function DoneView({
  todos,
  projects,
  cursorId,
  onToggle,
  onOpen,
  onChecklist,
}: Props) {
  return (
    <section className="done" aria-label="done">
      <div className="done-inner">
        <header className="col-head">
          <h2 className="col-title">
            Done
            <span className="col-count">{todos.length}</span>
          </h2>
        </header>

        <div className="done-body">
          {todos.length === 0 ? (
            <p className="col-empty">Nothing completed yet</p>
          ) : null}

          <div className="col-list" role="list" aria-label="completed todos">
            {todos.map((todo) => (
              <TaskRow
                key={todo.id}
                todo={todo}
                projects={projects}
                cursor={todo.id === cursorId}
                dragging={false}
                dropBefore={false}
                onToggle={onToggle}
                onOpen={onOpen}
                onChecklist={onChecklist}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
