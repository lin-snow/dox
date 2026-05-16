import { ApiClient, ApiError, loadConfig } from "@dox/core";

export async function listCommand(): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error("dox: not logged in. Run 'dox login --server <url>' first.");
    process.exit(1);
  }

  const api = new ApiClient(cfg);

  let todos;
  try {
    todos = await api.listTodos();
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(`dox: ${err.message}`);
    } else {
      console.error(`dox: ${(err as Error).message}`);
    }
    process.exit(1);
  }

  if (todos.length === 0) {
    console.log("(no todos)");
    return;
  }

  for (const t of todos) {
    const mark = t.done ? "[x]" : "[ ]";
    const id = t.id.slice(0, 6);
    console.log(`${mark} ${id}…  ${t.title}`);
  }
}
