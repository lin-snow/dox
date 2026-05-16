import { ApiClient, HumanOutput, JsonOutput, type Output, loadConfig } from "@dox/core";

export interface CliContext {
  api: ApiClient;
  output: Output;
}

export interface GlobalOpts {
  json?: boolean;
}

async function buildContext(opts: GlobalOpts): Promise<CliContext> {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error("dox: not logged in. Run 'dox login --server <url>' first.");
    process.exit(1);
  }
  const output = opts.json ? new JsonOutput() : new HumanOutput();
  return { api: new ApiClient(cfg), output };
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
