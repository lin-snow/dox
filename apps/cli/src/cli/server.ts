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
      rows.map((u) => `${u.id.slice(0, 8)}  ${u.role.padEnd(7)}  ${u.name}`).join("\n") || "(no users)",
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
