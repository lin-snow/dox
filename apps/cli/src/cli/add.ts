import { withContext, type GlobalOpts } from "./context";

export const addCommand = (title: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todo = await api.createTodo(title);
    output.todo(todo);
  });
