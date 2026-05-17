import { render } from "ink";

import { TodoClient, buildFetcher, loadConfig, realIO } from "@dox/core";

import { App } from "./App";

export async function runTui(): Promise<void> {
  const io = realIO();
  const cfg = await loadConfig();
  if (!cfg) {
    io.stderr.write("dox: not logged in. Run 'dox login --server <url>' first.\n");
    process.exit(1);
  }

  const fetcher = buildFetcher(cfg, io);
  const api = new TodoClient(fetcher, cfg.server);
  const app = render(<App api={api} />);
  await app.waitUntilExit();
}
