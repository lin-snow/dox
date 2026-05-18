import * as p from "@clack/prompts";

import {
  acceptInvite,
  buildFetcher,
  clearConfig,
  fetchServerInfo,
  getConfigPath,
  loadConfig,
  login,
  realIO,
  register,
  saveConfig,
  UserClient,
} from "@dox/core";

import type { GlobalOpts } from "./context";

interface LoginOptions {
  server: string;
  name?: string;
  password?: string;
}

interface RegisterOptions {
  server: string;
  name?: string;
  password?: string;
  invite?: string;
}

interface AcceptOptions {
  server?: string;
}

interface PasswdOptions extends GlobalOpts {
  old?: string;
  new?: string;
}

function validUrlOrDie(input: string): URL {
  try {
    return new URL(input);
  } catch {
    console.error(`dox: invalid server URL: ${input}`);
    process.exit(1);
  }
}

async function promptText(
  message: string,
  placeholder?: string,
): Promise<string> {
  const v = await p.text({ message, placeholder });
  if (p.isCancel(v)) {
    p.cancel("Cancelled");
    process.exit(1);
  }
  return v;
}

async function promptPassword(message: string): Promise<string> {
  const v = await p.password({ message });
  if (p.isCancel(v)) {
    p.cancel("Cancelled");
    process.exit(1);
  }
  return v;
}

// loginCmd authenticates an existing user with username + password and
// stores the returned JWT.
export async function loginCmd(opts: LoginOptions): Promise<void> {
  const url = validUrlOrDie(opts.server);
  p.intro(`Log in to ${url.origin}`);
  const userName = opts.name ?? (await promptText("Username:", "alice"));
  const password = opts.password ?? (await promptPassword("Password:"));
  let result;
  try {
    result = await login(url.origin, { userName, password });
  } catch (err) {
    p.cancel(`Login failed: ${(err as Error).message}`);
    process.exit(1);
  }
  await saveConfig({
    server: url.origin,
    token: result.token,
    userId: result.userId,
    userName: result.userName,
    role: result.role,
  });
  p.outro(`Logged in as ${result.userName} (${result.role}). Config saved.`);
}

// registerCmd creates a new user. First-ever caller becomes the server owner.
// Subsequent callers need either an invite or the server set to open registration.
export async function registerCmd(opts: RegisterOptions): Promise<void> {
  const url = validUrlOrDie(opts.server);
  p.intro(`Register with ${url.origin}`);
  const userName = opts.name ?? (await promptText("Username:", "alice"));
  const password =
    opts.password ?? (await promptPassword("Password (min 8 chars):"));
  let invite = opts.invite;
  if (!invite) {
    const ans = await p.text({
      message:
        "Invite code (leave empty if you're the first user or open registration is on):",
    });
    if (p.isCancel(ans)) {
      p.cancel("Cancelled");
      process.exit(1);
    }
    invite = ans || undefined;
  }
  let result;
  try {
    result = await register(url.origin, {
      userName,
      password,
      inviteCode: invite,
    });
  } catch (err) {
    p.cancel(`Register failed: ${(err as Error).message}`);
    process.exit(1);
  }
  await saveConfig({
    server: url.origin,
    token: result.token,
    userId: result.userId,
    userName: result.userName,
    role: result.role,
  });
  p.outro(`Registered as ${result.userName} (${result.role}). Config saved.`);
}

// acceptInviteCmd redeems an invite code. If already logged in, just joins
// the project. Otherwise prompts for registration and uses the code there.
export async function acceptInviteCmd(
  codeArg: string,
  opts: AcceptOptions,
): Promise<void> {
  const cfg = await loadConfig();
  if (cfg) {
    p.intro(`Accept invite as ${cfg.userName}`);
    const fetcher = buildFetcher(cfg, realIO());
    try {
      const res = await acceptInvite(fetcher, cfg.server, codeArg);
      p.outro(`Joined project ${res.projectId} as ${res.role}.`);
    } catch (err) {
      p.cancel(`Accept failed: ${(err as Error).message}`);
      process.exit(1);
    }
    return;
  }
  // No existing config — fall through to registration with the invite.
  const server =
    opts.server ?? (await promptText("Server URL:", "http://localhost:6278"));
  // Pre-probe so we can warn if registration is closed AND no invite was
  // given — but we DO have an invite here, so just go.
  try {
    await fetchServerInfo(server);
  } catch (err) {
    p.cancel(`Cannot reach server: ${(err as Error).message}`);
    process.exit(1);
  }
  await registerCmd({ server, invite: codeArg });
}

// logoutCmd wipes the local config. Server-side state is unaffected (JWT
// continues to be valid until its natural expiry).
export async function logoutCmd(): Promise<void> {
  const removed = await clearConfig();
  if (removed) {
    console.log(`logged out — ${getConfigPath()} removed.`);
  } else {
    console.log("no config to remove — already logged out.");
  }
}

// passwdCmd changes the current user's password.
export async function passwdCmd(opts: PasswdOptions): Promise<void> {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error("dox: not logged in. Run 'dox login --server <url>' first.");
    process.exit(1);
  }
  const oldPassword = opts.old ?? (await promptPassword("Current password:"));
  const newPassword =
    opts.new ?? (await promptPassword("New password (min 8 chars):"));
  const fetcher = buildFetcher(cfg, realIO());
  const users = new UserClient(fetcher, cfg.server);
  try {
    await users.changePassword(oldPassword, newPassword);
  } catch (err) {
    console.error(`dox: ${(err as Error).message}`);
    process.exit(1);
  }
  console.log("password changed.");
}
