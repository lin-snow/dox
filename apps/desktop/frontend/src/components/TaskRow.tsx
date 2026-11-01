import type { Project, Todo } from "../api";
import { proseOf, readChecklist, writeChecklist } from "../board";
import { chipDate, isOverdue, ms } from "../format";
import { projectTint } from "../tint";
import { IconCheck, IconClock } from "./Icons";

interface Props {
  todo: Todo;
  projects: Project[];
  cursor: boolean;
  onToggle: (todo: Todo) => void;
  onOpen: (todo: Todo) => void;
  onChecklist: (todo: Todo, index: number) => void;
}

/**
 * One task, referencing a GFM checklist in its description as nested rows.
 * The whole block is one hit target, like the reference: the box toggles, the
 * text opens the editor.
 */
export function TaskRow({
  todo,
  projects,
  cursor,
  onToggle,
  onOpen,
  onChecklist,
}: Props) {
  const project = projects.find((item) => item.id === todo.projectId);
  const checklist = readChecklist(todo.description);
  const prose = checklist ? "" : proseOf(todo.description);
  const due = chipDate(ms(todo.dueAt), !!todo.dueAllDay, todo.dueZone);
  const late = isOverdue(todo);

  return (
    <div
      className="task"
      data-done={todo.done || undefined}
      data-cursor={cursor || undefined}
    >
      <div className="task-main">
        <button
          type="button"
          className="check"
          role="checkbox"
          aria-checked={todo.done}
          aria-label={`${todo.done ? "Mark open" : "Mark done"}: ${todo.title}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(todo);
          }}
        >
          {todo.done ? <IconCheck size={15} /> : null}
        </button>

        <button
          type="button"
          className="task-body"
          onClick={() => onOpen(todo)}
        >
          <span className="task-title">{todo.title}</span>
          {prose ? <span className="task-note">{prose}</span> : null}

          {checklist ? (
            <ul className="subs">
              {checklist.map((item, index) => (
                <li
                  key={`${item.text}-${index}`}
                  data-done={item.done || undefined}
                >
                  <button
                    type="button"
                    className="check mini"
                    role="checkbox"
                    aria-checked={item.done}
                    aria-label={`${item.done ? "Mark open" : "Mark done"}: ${item.text}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onChecklist(todo, index);
                    }}
                  >
                    {item.done ? <IconCheck size={11} /> : null}
                  </button>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {due || project ? (
            <span className="task-meta">
              {due ? (
                <span className="chip" data-late={late || undefined}>
                  <IconClock size={13} />
                  {due}
                </span>
              ) : null}
              {project ? (
                <span className="chip">
                  <i className="ring" style={projectTint(project, projects)} />
                  {project.name}
                </span>
              ) : null}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

export function toggleChecklistItem(todo: Todo, index: number): string {
  const items = readChecklist(todo.description) ?? [];
  const next = items.map((item, at) =>
    at === index ? { ...item, done: !item.done } : item,
  );
  return writeChecklist(next);
}
