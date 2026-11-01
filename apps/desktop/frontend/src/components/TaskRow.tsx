import type { Project, Todo } from "../api";
import { proseOf, readChecklist, writeChecklist } from "../board";
import { chipDate, chipMeeting, isOverdue, ms } from "../format";
import { projectTint } from "../tint";
import { IconCalendar, IconCheck, IconClock } from "./Icons";
import { Markdown } from "./Markdown";

interface Props {
  todo: Todo;
  projects: Project[];
  cursor: boolean;
  /** This row is the one being dragged. */
  dragging: boolean;
  /** The drop would land directly above this row. */
  dropBefore: boolean;
  onToggle: (todo: Todo) => void;
  onOpen: (todo: Todo) => void;
  onChecklist: (todo: Todo, index: number) => void;
  /** Drag is per-view: the board reorders, the Done list has no order to set. */
  onDragStart?: (todo: Todo) => void;
  onDragOver?: (todo: Todo) => void;
  onDrop?: (todo: Todo) => void;
  onDragEnd?: () => void;
}

/**
 * One task, referencing a GFM checklist in its description as nested rows.
 * The whole block is one hit target, like the reference: the box toggles, the
 * text opens the editor.
 *
 * Dragging is an enhancement, never the only way: the same reorder is on
 * Alt+↑/↓ (App) and on `dox todo move`, so a pointer is not required. The list
 * semantics and the described-by hint below exist so a screen reader says that
 * out loud: `sortable` plus one shared sentence, rather than the same hint
 * repeated in every row.
 */
export function TaskRow({
  todo,
  projects,
  cursor,
  dragging,
  dropBefore,
  onToggle,
  onOpen,
  onChecklist,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: Props) {
  const project = projects.find((item) => item.id === todo.projectId);
  const checklist = readChecklist(todo.description);
  const prose = checklist ? "" : proseOf(todo.description);
  const due = chipDate(ms(todo.dueAt), !!todo.dueAllDay, todo.dueZone);
  const meeting = chipMeeting(ms(todo.startsAt), ms(todo.endsAt));
  const late = isOverdue(todo);

  return (
    <div
      className="task"
      role="listitem"
      aria-roledescription="sortable"
      // One hint, rendered once in App: repeating it per row would make every
      // row's description a paragraph.
      aria-describedby="task-reorder-hint"
      aria-current={cursor ? "true" : undefined}
      data-done={todo.done || undefined}
      data-cursor={cursor || undefined}
      data-dragging={dragging || undefined}
      data-drop-before={dropBefore || undefined}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        // Some engines refuse to start a drag with an empty payload.
        event.dataTransfer.setData("text/plain", todo.id);
        onDragStart(todo);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOver(todo);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(todo);
      }}
      onDragEnd={onDragEnd}
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
          {todo.done ? <IconCheck size={13} /> : null}
        </button>

        <div
          className="task-body"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button, a")) return;
            onOpen(todo);
          }}
        >
          <button
            type="button"
            className="task-open"
            onClick={() => onOpen(todo)}
          >
            <span className="task-title">
              {todo.title}
              {/* The strikethrough is colour/line-only; this is the same fact
                  in words, and it joins the button's accessible name. */}
              {todo.done ? <span className="sr-only"> (done)</span> : null}
            </span>
          </button>
          {prose ? <Markdown source={prose} className="task-note" /> : null}

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
                    {item.done ? <IconCheck size={10} /> : null}
                  </button>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {meeting || due || project ? (
            <span className="task-meta">
              {meeting ? (
                <span className="chip">
                  <IconCalendar size={13} />
                  {meeting}
                </span>
              ) : null}
              {due ? (
                <span className="chip" data-late={late || undefined}>
                  <IconClock size={13} />
                  {due}
                  {/* `data-late` is a colour: the word is what AT can report. */}
                  {late ? <span className="sr-only"> (overdue)</span> : null}
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
        </div>
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
