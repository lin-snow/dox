import { withContext, type GlobalOpts } from "./context";
import { readDescription } from "./helpers";

interface TodoListOpts extends GlobalOpts {
  project?: string;
}

interface TodoAddOpts extends GlobalOpts {
  project?: string;
  description?: string;
  descriptionFile?: string;
}

interface TodoEditOpts extends GlobalOpts {
  title?: string;
  description?: string;
  descriptionFile?: string;
  clearDescription?: boolean;
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
    const todo = await api.createTodo(title, {
      projectId: project === "inbox" ? undefined : project,
      description,
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
    const description = opts.clearDescription
      ? ""
      : await readDescription(opts);
    if (opts.title === undefined && description === undefined) {
      throw new Error(
        "nothing to update — pass --title, --description, --description-file, or --clear-description",
      );
    }
    const todo = await api.updateTodo(id, {
      title: opts.title,
      description,
    });
    output.todo(todo);
  });

export const rm = (id: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    await api.deleteTodo(id);
    output.ok(`Deleted ${id}`, { deleted: id });
  });
