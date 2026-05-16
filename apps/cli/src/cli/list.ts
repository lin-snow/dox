import { withContext, type GlobalOpts } from "./context";

export const listCommand = (opts: GlobalOpts) =>
  withContext(opts, async ({ api, output }) => {
    const todos = await api.listTodos();
    output.todos(todos);
  });
