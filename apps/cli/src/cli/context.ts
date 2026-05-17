import {
  HumanOutput,
  InviteClient,
  JsonOutput,
  type Output,
  ProjectClient,
  TodoClient,
  UserClient,
  buildFetcher,
  loadConfig,
  realIO,
} from "@dox/core";

export interface CliContext {
  api: TodoClient;
  projects: ProjectClient;
  users: UserClient;
  invites: InviteClient;
  output: Output;
  server: string;
  userName: string;
  role: string;
  defaultProject?: string;
}

export interface GlobalOpts {
  json?: boolean;
}

async function buildContext(opts: GlobalOpts): Promise<CliContext> {
  const io = realIO();
  const cfg = await loadConfig();
  if (!cfg) {
    io.stderr.write("dox: not logged in. Run 'dox register --server <url>' first.\n");
    process.exit(1);
  }
  const fetcher = buildFetcher(cfg, io);
  return {
    api: new TodoClient(fetcher, cfg.server),
    projects: new ProjectClient(fetcher, cfg.server),
    users: new UserClient(fetcher, cfg.server),
    invites: new InviteClient(fetcher, cfg.server),
    output: opts.json ? new JsonOutput(io) : new HumanOutput(io),
    server: cfg.server,
    userName: cfg.userName,
    role: cfg.role,
    defaultProject: cfg.defaultProject,
  };
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
