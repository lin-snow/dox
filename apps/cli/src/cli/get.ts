import { withContext, type GlobalOpts } from "./context";

export const getCommand = (id: string, opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todo = await api.getTodo(id);
    output.todo(todo);
  });
