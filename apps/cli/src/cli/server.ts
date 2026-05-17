import { withContext, type GlobalOpts } from "./context";

interface InviteOpts extends GlobalOpts {
  ttlMs?: number;
}

export const me = (opts: GlobalOpts) =>
  withContext(opts, async ({ users, output }) => {
    const u = await users.me();
    output.ok(`${u.name} (${u.role})  id=${u.id}`, { user: u });
  });

export const listUsers = (opts: GlobalOpts) =>
  withContext(opts, async ({ users, output }) => {
    const rows = await users.list();
    output.ok(
      rows
        .map((u) => `${u.id.slice(0, 8)}  ${u.role.padEnd(7)}  ${u.name}`)
        .join("\n") || "(no users)",
      { users: rows },
    );
  });

export const inviteServer = (opts: InviteOpts) =>
  withContext(opts, async ({ invites, output }) => {
    const inv = await invites.create({ ttlMs: opts.ttlMs });
    output.ok(
      `Server invite: ${inv.code}\nExpires at:    ${new Date(Number(inv.expiresAt)).toISOString()}\nRedeem with:   dox accept ${inv.code}`,
      { invite: inv },
    );
  });

export const setRegistrationOpen = (value: string, opts: GlobalOpts) =>
  withContext(opts, async ({ users, output }) => {
    const open = value === "true" || value === "1";
    const s = await users.updateSettings({ registrationOpen: open });
    output.ok(`registration_open = ${s.registrationOpen}`, { settings: s });
  });

export const setServerName = (name: string, opts: GlobalOpts) =>
  withContext(opts, async ({ users, output }) => {
    const s = await users.updateSettings({ serverName: name });
    output.ok(`server_name = ${s.serverName || "(empty)"}`, { settings: s });
  });

export const setServerDescription = (desc: string, opts: GlobalOpts) =>
  withContext(opts, async ({ users, output }) => {
    const s = await users.updateSettings({ serverDescription: desc });
    output.ok(`server_description = ${s.serverDescription || "(empty)"}`, {
      settings: s,
    });
  });

// resetUserPassword resolves a username to its user_id then resets the
// password server-side. Owner-only. Returns a one-time temp password the
// owner must relay out-of-band; the user should ChangePassword on first login.
export const resetUserPassword = (userName: string, opts: GlobalOpts) =>
  withContext(opts, async ({ users, output }) => {
    const all = await users.list();
    const target = all.find((u) => u.name === userName);
    if (!target) {
      output.error(`user not found: ${userName}`);
      process.exit(1);
    }
    const { tempPassword } = await users.resetUserPassword(target.id);
    output.ok(
      `Reset password for ${userName}.\nTemp password: ${tempPassword}\nRelay this out-of-band; the user should run \`dox passwd\` after first login.`,
      { userName, tempPassword },
    );
  });
