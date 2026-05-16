import { render } from "ink";

import { ApiClient, loadConfig } from "@dox/core";

import { App } from "./App";

export async function runTui(): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error("dox: not logged in. Run 'dox login --server <url>' first.");
    process.exit(1);
  }

  const api = new ApiClient(cfg);
  const app = render(<App api={api} />);
  await app.waitUntilExit();
}
