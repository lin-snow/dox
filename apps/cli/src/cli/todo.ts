import { writeFile } from "node:fs/promises";

import { todosToICS } from "@dox/core";

import { withContext, type GlobalOpts } from "./context";
import { dueFields, parseFlagWhen, readDescription } from "./helpers";

interface TodoListOpts extends GlobalOpts {
  project?: string;
}

interface TodoAddOpts extends GlobalOpts {
  project?: string;
  description?: string;
  descriptionFile?: string;
  due?: string;
  remind?: string;
  start?: string;
  end?: string;
}

interface TodoEditOpts extends GlobalOpts {
  title?: string;
  description?: string;
  descriptionFile?: string;
  clearDescription?: boolean;
  due?: string;
  clearDue?: boolean;
  remind?: string;
  clearRemind?: boolean;
  start?: string;
  end?: string;
  clearMeeting?: boolean;
}

interface TodoMoveOpts extends GlobalOpts {
  after?: string;
}

interface TodoICSOpts extends TodoListOpts {
  out?: string;
}

/**
 * Meeting window from flags. Both or neither: a start without an end is not a
 * fact anyone can put on a calendar, so it is rejected at the edge instead of
 * by the server.
 */
function meetingFields(
  start?: string,
  end?: string,
): { startsAt: number; endsAt: number } | Record<string, never> {
  if (start === undefined && end === undefined) return {};
  if (start === undefined || end === undefined) {
    throw new Error("--start and --end must be used together");
  }
  const startsAt = parseFlagWhen(start, "--start").at;
  const endsAt = parseFlagWhen(end, "--end").at;
  if (endsAt <= startsAt) {
    throw new Error("--end must be after --start");
  }
  return { startsAt, endsAt };
}

function resolveFilter(
  opts: { project?: string },
  defaultProject?: string,
): string | undefined {
  const raw = opts.project ?? defaultProject;
  if (!raw || raw === "all") return undefined;
  return raw;
}

export const list = (opts: TodoListOpts) =>
  withContext(opts, async ({ api, output, defaultProject }) => {
    const todos = await api.listTodos(resolveFilter(opts, defaultProject));
    output.todos(todos);
  });

export const get = (id: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todo = await api.getTodo(id);
    output.todo(todo);
  });

export const add = (title: string, opts: TodoAddOpts) =>
  withContext(opts, async ({ api, output, defaultProject }) => {
    const project = resolveFilter(opts, defaultProject);
    const description = await readDescription(opts);
    const due =
      opts.due === undefined
        ? undefined
        : dueFields(parseFlagWhen(opts.due, "--due"));
    const todo = await api.createTodo(title, {
      projectId: project === "inbox" ? undefined : project,
      description,
      ...(due ?? {}),
      ...meetingFields(opts.start, opts.end),
      ...(opts.remind === undefined
        ? {}
        : { remindAt: parseFlagWhen(opts.remind, "--remind").at }),
    });
    output.todo(todo);
  });

export const done = (id: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todo = await api.updateTodo(id, { done: true });
    output.todo(todo);
  });

export const undone = (id: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todo = await api.updateTodo(id, { done: false });
    output.todo(todo);
  });

export const edit = (id: string, opts: TodoEditOpts) =>
  withContext(opts, async ({ api, output }) => {
    if (opts.clearDescription) {
      if (
        opts.description !== undefined ||
        opts.descriptionFile !== undefined
      ) {
        throw new Error(
          "--clear-description cannot be combined with --description / --description-file",
        );
      }
    }
    if (opts.clearDue && opts.due !== undefined) {
      throw new Error("--clear-due cannot be combined with --due");
    }
    if (opts.clearRemind && opts.remind !== undefined) {
      throw new Error("--clear-remind cannot be combined with --remind");
    }
    if (
      opts.clearMeeting &&
      (opts.start !== undefined || opts.end !== undefined)
    ) {
      throw new Error(
        "--clear-meeting cannot be combined with --start / --end",
      );
    }

    const description = opts.clearDescription
      ? ""
      : await readDescription(opts);
    const patch = {
      title: opts.title,
      description,
      // null clears; a parsed value sets. Absent leaves the field untouched.
      ...(opts.due !== undefined
        ? dueFields(parseFlagWhen(opts.due, "--due"))
        : opts.clearDue
          ? { dueAt: null }
          : {}),
      ...(opts.remind !== undefined
        ? { remindAt: parseFlagWhen(opts.remind, "--remind").at }
        : opts.clearRemind
          ? { remindAt: null }
          : {}),
      ...(opts.clearMeeting
        ? { startsAt: null, endsAt: null }
        : meetingFields(opts.start, opts.end)),
    };
    const touched = Object.values(patch).some((v) => v !== undefined);
    if (!touched) {
      throw new Error(
        "nothing to update - pass --title, a description flag, --due/--clear-due, --remind/--clear-remind, or --start/--end/--clear-meeting",
      );
    }
    const todo = await api.updateTodo(id, patch);
    output.todo(todo);
  });

export const rm = (id: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    await api.deleteTodo(id);
    output.ok(`Deleted ${id}`, { deleted: id });
  });

/**
 * Reorder within the todo's own list. The anchor is the row it should sit
 * under -- the same thing a drag says, and something both the CLI and the
 * desktop board can express without agreeing on indices.
 */
export const move = (id: string, opts: TodoMoveOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todo = await api.moveTodo(id, opts.after);
    output.todo(todo);
  });

/**
 * Meetings as an iCalendar file, ready to import into any calendar app.
 *
 * Inside the thin-client rule: the file is rendered from the list the server
 * already returned, so no calendar account or extra RPC is involved.
 */
export const ics = (opts: TodoICSOpts) =>
  withContext(opts, async ({ api, defaultProject }) => {
    const todos = await api.listTodos(resolveFilter(opts, defaultProject));
    const body = todosToICS(todos);
    if (opts.out === undefined) {
      process.stdout.write(body);
      return;
    }
    await writeFile(opts.out, body, "utf-8");
    process.stderr.write(`wrote ${opts.out}\n`);
  });
