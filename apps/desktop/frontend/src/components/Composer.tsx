import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Project, Todo, TodoPatch } from "../api";
import {
  readChecklist,
  writeChecklist,
  type Bucket,
  type ChecklistItem,
} from "../board";
import { useDialog } from "../dialog";
import {
  chipDate,
  chipMeeting,
  clockInput,
  dateTimeInput,
  dayInput,
  dueFields,
  meetingFields,
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
import { Markdown } from "./Markdown";

export interface Draft {
  title: string;
  description: string;
  projectId?: string;
  dueAt?: number | null;
  dueAllDay?: boolean;
  dueZone?: string;
  remindAt?: number;
  /** Meeting window; both or neither, like the server's validation. */
  startsAt?: number;
  endsAt?: number;
}

/** Reminder offsets, offered as the lead time before the deadline. */
const REMIND: readonly { ms: number; label: string }[] = [
  { ms: 600_000, label: "10 minutes before" },
  { ms: 1_800_000, label: "30 minutes before" },
  { ms: 3_600_000, label: "1 hour before" },
  { ms: 86_400_000, label: "1 day before" },
];

const DAY = 86_400_000;

interface Props {
  /** null creates, a todo edits, undefined never reaches here. */
  todo: Todo | null;
  projects: Project[];
  defaultProjectId?: string;
  /** Which column the composer was opened from: it pre-fills that deadline. */
  preset?: Bucket;
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
  preset,
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
  const [previewNote, setPreviewNote] = useState(false);
  const [projectId, setProjectId] = useState(
    todo?.projectId ?? defaultProjectId ?? "",
  );
  const [date, setDate] = useState(() => {
    if (todo?.dueAt) return dayInput(ms(todo.dueAt), todo.dueZone);
    if (preset === "today") return dayInput(startOfToday());
    if (preset === "week") return dayInput(startOfToday() + 3 * DAY);
    return "";
  });
  const [time, setTime] = useState(() =>
    todo?.dueAt && !todo.dueAllDay ? clockInput(ms(todo.dueAt)) : "",
  );
  const [remind, setRemind] = useState(() => {
    const at = ms(todo?.remindAt);
    const due = ms(todo?.dueAt);
    if (!at || !due) return "default";
    const known = REMIND.find((option) => option.ms === due - at);
    return known ? String(known.ms) : "default";
  });
  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** True while `error` is ours (validation). Server failures are already
   * spoken by the app-wide alert region; only these announce from in here. */
  const [local, setLocal] = useState(false);
  /** Meeting window as datetime-local strings; empty = a plain task. */
  const [meetStart, setMeetStart] = useState(() =>
    todo?.startsAt ? dateTimeInput(ms(todo.startsAt)) : "",
  );
  const [meetEnd, setMeetEnd] = useState(() =>
    todo?.endsAt ? dateTimeInput(ms(todo.endsAt)) : "",
  );

  const titleRef = useRef<HTMLInputElement | null>(null);
  const { ref: dialogRef, onKeyDown: trapTab } = useDialog<HTMLFormElement>();

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const project = useMemo(
    () => projects.find((item) => item.id === projectId),
    [projectId, projects],
  );

  const due = useMemo(() => dueFields(date, time), [date, time]);

  /** "default" clears an explicit reminder, which is the only way back to
   * "fire at the deadline" once one was set. */
  const remindValue = useMemo(() => {
    if (remind === "default") return todo ? 0 : undefined;
    if (!due.dueAt) return undefined;
    return due.dueAt - Number(remind);
  }, [due.dueAt, remind, todo]);

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
    // A half window is not a fact anyone can act on, so it never leaves the
    // client: the server would reject it anyway, but with a worse message.
    if ((meetStart === "") !== (meetEnd === "")) {
      setError("A meeting needs both a start and an end.");
      setLocal(true);
      return;
    }
    const window = meetingFields(meetStart, meetEnd);
    if (
      window.startsAt !== null &&
      window.endsAt !== null &&
      window.endsAt <= window.startsAt
    ) {
      setError("The end time must come after the start time.");
      setLocal(true);
      return;
    }
    setBusy(true);
    setError("");
    setLocal(false);
    try {
      if (todo) {
        await onPatch(todo, {
          title: trimmed,
          description,
          ...due,
          ...window,
          ...(remindValue === undefined ? {} : { remindAt: remindValue }),
        });
      } else {
        await onCreate({
          title: trimmed,
          description,
          projectId: projectId || undefined,
          ...due,
          remindAt: remindValue ?? undefined,
          startsAt: window.startsAt ?? undefined,
          endsAt: window.endsAt ?? undefined,
        });
      }
      onClose();
    } catch (caught) {
      // Not "local": App's alert region already announces this same message,
      // and two live regions saying it would be a stutter.
      setError(caught instanceof Error ? caught.message : String(caught));
      setLocal(false);
      setBusy(false);
    }
  }, [
    busy,
    description,
    due,
    meetEnd,
    meetStart,
    onCreate,
    onClose,
    onPatch,
    projectId,
    remindValue,
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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-heading"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            if (panel !== "none") setPanel("none");
            else onClose();
            return;
          }
          trapTab(event);
        }}
      >
        {/* The card has no visible heading, so the dialog takes its name from
            this one rather than from an aria-label. */}
        <h2 id="composer-heading" className="sr-only">
          {todo ? "Edit todo" : "New todo"}
        </h2>
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
                  {item.done ? <IconCheck size={10} /> : null}
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
          previewNote ? (
            prose.trim() ? (
              <Markdown source={prose} className="composer-preview" />
            ) : (
              <p className="composer-preview empty">Nothing to preview yet.</p>
            )
          ) : (
            <textarea
              className="composer-note"
              value={prose}
              placeholder="Add notes — Markdown is supported"
              onChange={(event) => setProse(event.target.value)}
              rows={4}
              aria-label="notes"
            />
          )
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

          {noteOpen ? (
            <button
              type="button"
              className="note-preview-toggle"
              aria-pressed={previewNote}
              onClick={() => setPreviewNote((on) => !on)}
            >
              {previewNote ? "Edit notes" : "Preview notes"}
            </button>
          ) : null}

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
              <div className="pop-panel" role="group" aria-label="project">
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
              data-on={
                panel === "schedule" || date || meetStart ? true : undefined
              }
              title="deadline and meeting"
              aria-label="deadline and meeting"
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
                <label>
                  <span>Remind</span>
                  <select
                    value={remind}
                    disabled={!date}
                    onChange={(event) => setRemind(event.target.value)}
                    aria-label="reminder"
                  >
                    <option value="default">At deadline</option>
                    {REMIND.map((option) => (
                      <option key={option.ms} value={String(option.ms)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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

                {/* The window is independent of the deadline: a meeting can
                    be scheduled without anything being due. */}
                <label>
                  <span>Meet</span>
                  <input
                    type="datetime-local"
                    value={meetStart}
                    onChange={(event) => setMeetStart(event.target.value)}
                    aria-label="meeting start"
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="datetime-local"
                    value={meetEnd}
                    onChange={(event) => setMeetEnd(event.target.value)}
                    aria-label="meeting end"
                  />
                </label>
                {meetStart || meetEnd ? (
                  <div className="pop-row">
                    <button
                      type="button"
                      onClick={() => {
                        setMeetStart("");
                        setMeetEnd("");
                      }}
                    >
                      Clear meeting
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {meetStart && meetEnd ? (
            <span className="composer-due">
              {chipMeeting(
                new Date(meetStart).getTime(),
                new Date(meetEnd).getTime(),
              )}
            </span>
          ) : null}

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

        {error ? (
          <p className="composer-error" {...(local ? { role: "alert" } : {})}>
            {error}
          </p>
        ) : null}
      </form>
    </>
  );
}
