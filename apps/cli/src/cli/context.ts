import {
  HumanOutput,
  JsonOutput,
  type Output,
  TodoClient,
  buildFetcher,
  loadConfig,
  realIO,
} from "@dox/core";

export interface CliContext {
  api: TodoClient;
  output: Output;
}

export interface GlobalOpts {
  json?: boolean;
}

async function buildContext(opts: GlobalOpts): Promise<CliContext> {
  const io = realIO();
  const cfg = await loadConfig();
  if (!cfg) {
    io.stderr.write("dox: not logged in. Run 'dox login --server <url>' first.\n");
    process.exit(1);
  }
  const fetcher = buildFetcher(cfg, io);
  const api = new TodoClient(fetcher, cfg.server);
  const output = opts.json ? new JsonOutput(io) : new HumanOutput(io);
  return { api, output };
}

export async function withContext(
  opts: GlobalOpts,
  fn: (ctx: CliContext) => Promise<void>,
): Promise<void> {
  const ctx = await buildContext(opts);
  try {
    await fn(ctx);
  } catch (err) {
    ctx.output.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
