import { withContext, type GlobalOpts } from "./context";

export const list = (opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todos = await api.listTodos();
    output.todos(todos);
  });

export const get = (id: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todo = await api.getTodo(id);
    output.todo(todo);
  });

export const add = (title: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todo = await api.createTodo(title);
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
