import { withContext, type GlobalOpts } from "./context";

interface TodoOpts extends GlobalOpts {
  project?: string;
}

function resolveFilter(opts: TodoOpts, defaultProject?: string): string | undefined {
  const raw = opts.project ?? defaultProject;
  if (!raw || raw === "all") return undefined;
  return raw;
}

export const list = (opts: TodoOpts) =>
  withContext(opts, async ({ api, output, defaultProject }) => {
    const todos = await api.listTodos(resolveFilter(opts, defaultProject));
    output.todos(todos);
  });

export const get = (id: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todo = await api.getTodo(id);
    output.todo(todo);
  });

export const add = (title: string, opts: TodoOpts) =>
  withContext(opts, async ({ api, output, defaultProject }) => {
    const project = resolveFilter(opts, defaultProject);
    const todo = await api.createTodo(title, { projectId: project === "inbox" ? undefined : project });
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

export const edit = (id: string, title: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todo = await api.updateTodo(id, { title });
    output.todo(todo);
  });

export const rm = (id: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    await api.deleteTodo(id);
    output.ok(`Deleted ${id}`, { deleted: id });
  });
