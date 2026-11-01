import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Project, Todo, TodoPatch } from "../api";
import { readChecklist, writeChecklist, type ChecklistItem } from "../board";
import {
  chipDate,
  clockInput,
  dayInput,
  dueFields,
  ms,
  startOfToday,
} from "../format";
import { projectTint } from "../tint";
import {
  IconCalendar,
  IconCheck,
  IconClock,
  IconClose,
  IconNote,
  IconSquare,
  IconTrash,
} from "./Icons";

export interface Draft {
  title: string;
  description: string;
  projectId?: string;
  dueAt?: number | null;
  dueAllDay?: boolean;
  dueZone?: string;
}

interface Props {
  /** null creates, a todo edits, undefined never reaches here. */
  todo: Todo | null;
  projects: Project[];
  defaultProjectId?: string;
  onClose: () => void;
  onCreate: (draft: Draft) => Promise<void>;
  onPatch: (todo: Todo, patch: TodoPatch) => Promise<unknown>;
  onDelete: (todo: Todo) => Promise<void>;
}

type Panel = "none" | "project" | "schedule";

/**
 * The floating card: create or edit without leaving the board. Subtasks are
 * GFM task lines in the description, so every line here is real data the CLI
 * and the web UI also see.
 */
export function Composer({
  todo,
  projects,
  defaultProjectId,
  onClose,
  onCreate,
  onPatch,
  onDelete,
}: Props) {
  const [title, setTitle] = useState(todo?.title ?? "");
  const [items, setItems] = useState<ChecklistItem[]>(
    () => readChecklist(todo?.description) ?? [],
  );
  const [prose, setProse] = useState(() => {
    if (!todo?.description || readChecklist(todo.description)) return "";
    return todo.description;
  });
  const [noteOpen, setNoteOpen] = useState(
    () => !!todo?.description && !readChecklist(todo.description),
  );
  const [projectId, setProjectId] = useState(
    todo?.projectId ?? defaultProjectId ?? "",
  );
  const [date, setDate] = useState(() =>
    todo?.dueAt ? dayInput(ms(todo.dueAt), todo.dueZone) : "",
  );
  const [time, setTime] = useState(() =>
    todo?.dueAt && !todo.dueAllDay ? clockInput(ms(todo.dueAt)) : "",
  );
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const project = useMemo(
    () => projects.find((item) => item.id === projectId),
    [projectId, projects],
  );

  const due = useMemo(() => dueFields(date, time), [date, time]);

  const description = useMemo(
    () =>
      [writeChecklist(items), noteOpen ? prose.trim() : ""]
        .filter(Boolean)
        .join("\n\n"),
    [items, noteOpen, prose],
  );

  const submit = useCallback(async () => {
    if (busy) return;
    const trimmed = title.trim();
    if (!trimmed) {
      titleRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (todo) {
        await onPatch(todo, { title: trimmed, description, ...due });
      } else {
        await onCreate({
          title: trimmed,
          description,
          projectId: projectId || undefined,
          ...due,
        });
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  }, [
    busy,
    description,
    due,
    onCreate,
    onClose,
    onPatch,
    projectId,
    title,
    todo,
  ]);

  const setItem = (index: number, patch: Partial<ChecklistItem>) =>
    setItems((list) =>
      list.map((item, at) => (at === index ? { ...item, ...patch } : item)),
    );

  return (
    <>
      <div className="composer-veil" onClick={onClose} />
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            if (panel !== "none") setPanel("none");
            else onClose();
          }
        }}
      >
        <input
          ref={titleRef}
          className="composer-title"
          value={title}
          placeholder={todo ? "Title" : "New todo"}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            }
          }}
          spellCheck={false}
          aria-label="title"
        />

        {items.length > 0 ? (
          <ul className="composer-subs">
            {items.map((item, index) => (
              <li key={index} data-done={item.done || undefined}>
                <button
                  type="button"
                  className="check mini"
                  role="checkbox"
                  aria-checked={item.done}
                  aria-label={`done: ${item.text}`}
                  onClick={() => setItem(index, { done: !item.done })}
                >
                  {item.done ? <IconCheck size={11} /> : null}
                </button>
                <input
                  value={item.text}
                  onChange={(event) =>
                    setItem(index, { text: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      setItems((list) => [
                        ...list.slice(0, index + 1),
                        { done: false, text: "" },
                        ...list.slice(index + 1),
                      ]);
                    }
                    if (
                      event.key === "Backspace" &&
                      item.text === "" &&
                      items.length > 1
                    ) {
                      event.preventDefault();
                      setItems((list) => list.filter((_, at) => at !== index));
                    }
                  }}
                  aria-label={`subtask ${index + 1}`}
                />
                <button
                  type="button"
                  className="sub-remove"
                  aria-label="remove subtask"
                  onClick={() =>
                    setItems((list) => list.filter((_, at) => at !== index))
                  }
                >
                  <IconClose size={12} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <input
          className="composer-sub-input"
          placeholder="Add subtask"
          onKeyDown={(event) => {
            const value = event.currentTarget.value;
            if (event.key === "Enter" && value.trim()) {
              event.preventDefault();
              setItems((list) => [
                ...list,
                { done: false, text: value.trim() },
              ]);
              event.currentTarget.value = "";
            }
          }}
          aria-label="add subtask"
        />

        {noteOpen ? (
          <textarea
            className="composer-note"
            value={prose}
            placeholder="Notes — markdown is kept as written"
            onChange={(event) => setProse(event.target.value)}
            rows={3}
            aria-label="notes"
          />
        ) : null}

        <div className="composer-foot">
          <button
            type="button"
            className="tool"
            data-on={noteOpen || undefined}
            title="note"
            aria-label="toggle note"
            onClick={() => setNoteOpen((open) => !open)}
          >
            <IconNote size={17} />
          </button>

          <div className="pop">
            <button
              type="button"
              className="tool chip-tool"
              data-on={panel === "project" || undefined}
              onClick={() =>
                setPanel((current) =>
                  current === "project" ? "none" : "project",
                )
              }
            >
              {project ? (
                <i className="ring" style={projectTint(project, projects)} />
              ) : null}
              {project ? project.name : "Inbox"}
            </button>
            {panel === "project" ? (
              <div className="pop-panel" role="listbox">
                <button
                  type="button"
                  data-on={!projectId || undefined}
                  onClick={() => {
                    setProjectId("");
                    setPanel("none");
                  }}
                >
                  Inbox
                </button>
                {projects.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-on={projectId === item.id || undefined}
                    onClick={() => {
                      setProjectId(item.id);
                      setPanel("none");
                    }}
                  >
                    <i className="ring" style={projectTint(item, projects)} />
                    {item.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="pop">
            <button
              type="button"
              className="tool"
              data-on={panel === "schedule" || date ? true : undefined}
              title="deadline"
              aria-label="deadline"
              onClick={() =>
                setPanel((current) =>
                  current === "schedule" ? "none" : "schedule",
                )
              }
            >
              {date ? <IconClock size={17} /> : <IconCalendar size={17} />}
            </button>
            {panel === "schedule" ? (
              <div className="pop-panel schedule">
                <label>
                  <span>Date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    aria-label="due date"
                  />
                </label>
                <label>
                  <span>Time</span>
                  <input
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    aria-label="due time"
                  />
                </label>
                <div className="pop-row">
                  <button
                    type="button"
                    onClick={() => {
                      setDate(dayInput(startOfToday()));
                      setTime("");
                    }}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDate("");
                      setTime("");
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {date ? (
            <span className="composer-due">
              {chipDate(due.dueAt ?? 0, !!due.dueAllDay, due.dueZone)}
            </span>
          ) : null}

          {todo ? (
            <button
              type="button"
              className="tool"
              data-on={todo.done || undefined}
              title={todo.done ? "reopen" : "complete"}
              aria-label={todo.done ? "reopen" : "complete"}
              onClick={() => void onPatch(todo, { done: !todo.done })}
            >
              <IconSquare size={17} />
            </button>
          ) : null}

          <span className="spacer" />

          {todo ? (
            <button
              type="button"
              className="tool danger"
              title="delete"
              aria-label="delete"
              onClick={() => void onDelete(todo)}
            >
              <IconTrash size={17} />
            </button>
          ) : null}

          <button className="create" type="submit" disabled={busy}>
            {todo ? "Save" : "Create"}
          </button>
        </div>

        {error ? <p className="composer-error">{error}</p> : null}
      </form>
    </>
  );
}
