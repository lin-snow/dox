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
    };
    const touched = Object.values(patch).some((v) => v !== undefined);
    if (!touched) {
      throw new Error(
        "nothing to update - pass --title, a description flag, --due/--clear-due, or --remind/--clear-remind",
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
