import { withContext, type GlobalOpts } from "./context";

export const list = (opts: GlobalOpts) =>
  withContext(opts, async ({ invites, output }) => {
    const rows = await invites.listOutgoing();
    if (rows.length === 0) {
      output.ok("(no outgoing invites)", { invites: rows });
      return;
    }
    const lines = rows.map((r) => {
      const hash = r.codeHash.slice(0, 12);
      const expires = new Date(Number(r.expiresAt)).toISOString();
      const target = r.projectId ? `project=${r.projectName}` : "server-level";
      return `${hash}…  ${r.role.padEnd(7)}  ${target.padEnd(28)}  expires ${expires}`;
    });
    output.ok(lines.join("\n"), { invites: rows });
  });

export const revoke = (codeHash: string, opts: GlobalOpts) =>
  withContext(opts, async ({ invites, output }) => {
    await invites.revoke(codeHash);
    output.ok(`revoked ${codeHash}`, { revoked: codeHash });
  });
