import { withContext, type GlobalOpts } from "./context";

export const editCommand = (id: string, title: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todo = await api.updateTodo(id, { title });
    output.todo(todo);
  });
