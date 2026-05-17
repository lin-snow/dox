import { withContext, type GlobalOpts } from "./context";
import { FormatCodeOnNewline } from "./helpers";

interface PairOpts extends GlobalOpts {
  name: string;
  ttlMs?: number;
}

export const pair = (opts: PairOpts) =>
  withContext(opts, async ({ users, output }) => {
    const { code, expiresAt } = await users.createPairingCode({ deviceName: opts.name, ttlMs: opts.ttlMs });
    output.ok(
      `Pairing code for "${opts.name}":\n\n  ${FormatCodeOnNewline(code)}\n\nExpires at: ${new Date(Number(expiresAt)).toISOString()}`,
      { code, expiresAt },
    );
  });

export const list = (opts: GlobalOpts) =>
  withContext(opts, async ({ users, output }) => {
    const rows = await users.listMyDevices();
    output.ok(
      rows
        .map((d) => `${d.id.slice(0, 8)}  ${d.name.padEnd(20)}  last seen ${new Date(Number(d.lastSeenAt)).toISOString()}`)
        .join("\n") || "(no devices)",
      { devices: rows },
    );
  });

export const revoke = (id: string, opts: GlobalOpts) =>
  withContext(opts, async ({ users, output }) => {
    await users.revokeDevice(id);
    output.ok(`Revoked device ${id}`, { revoked: id });
  });
