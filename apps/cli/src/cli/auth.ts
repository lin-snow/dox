import * as p from "@clack/prompts";

import {
  acceptInvite,
  buildFetcher,
  loadConfig,
  realIO,
  redeemPairingCode,
  register,
  saveConfig,
} from "@dox/core";

interface LoginOptions {
  server: string;
}

interface RegisterOptions {
  server: string;
  name?: string;
  device?: string;
  invite?: string;
}

interface AcceptOptions {
  server?: string;
}

function validUrlOrDie(input: string): URL {
  try {
    return new URL(input);
  } catch {
    console.error(`dox: invalid server URL: ${input}`);
    process.exit(1);
  }
}

async function promptText(message: string, placeholder?: string): Promise<string> {
  const v = await p.text({ message, placeholder });
  if (p.isCancel(v)) {
    p.cancel("Cancelled");
    process.exit(1);
  }
  return v;
}

// login adds *this device* to an existing user account by redeeming a pairing
// code generated on another already-logged-in device.
export async function login(opts: LoginOptions): Promise<void> {
  const url = validUrlOrDie(opts.server);
  p.intro(`Pair device with ${url.origin}`);
  const code = await promptText(
    "Pairing code (run `dox device pair --name <device>` on a logged-in device):",
    "ABCD-EFGH",
  );
  let result;
  try {
    result = await redeemPairingCode(url.origin, code);
  } catch (err) {
    p.cancel(`Pairing failed: ${(err as Error).message}`);
    process.exit(1);
  }
  await saveConfig({
    server: url.origin,
    token: result.token,
    userId: result.userId,
    userName: result.userName,
    role: "", // unknown until /me call; left blank locally
    deviceId: result.deviceId,
  });
  p.outro(`Paired device "${result.deviceName}" for user "${result.userName}".`);
}

// registerCmd creates a new user. First-ever caller becomes the server owner.
// Subsequent callers need either an invite or the server set to open registration.
export async function registerCmd(opts: RegisterOptions): Promise<void> {
  const url = validUrlOrDie(opts.server);
  p.intro(`Register with ${url.origin}`);
  const name = opts.name ?? (await promptText("Username:", "alice"));
  const device = opts.device ?? (await promptText("Device name:", "laptop"));
  let invite = opts.invite;
  if (!invite) {
    const ans = await p.text({ message: "Invite code (leave empty if server allows open registration):" });
    if (p.isCancel(ans)) {
      p.cancel("Cancelled");
      process.exit(1);
    }
    invite = ans || undefined;
  }
  let result;
  try {
    result = await register(url.origin, { userName: name, deviceName: device, inviteCode: invite });
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
    deviceId: result.deviceId,
  });
  p.outro(`Registered as ${result.userName} (role: ${result.role}). Config saved.`);
}

// accept redeems an invite code. If already logged in, just joins the project.
// Otherwise prompts for registration and uses the code there.
export async function acceptInviteCmd(codeArg: string, opts: AcceptOptions): Promise<void> {
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
  const server = opts.server ?? (await promptText("Server URL:", "http://localhost:8080"));
  await registerCmd({ server, invite: codeArg });
}
