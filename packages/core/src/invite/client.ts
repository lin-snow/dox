import type { Fetcher } from "../http";

export interface Invite {
  code: string;
  issuedBy: string;
  projectId: string;
  role: string;
  createdAt: string;
  expiresAt: string;
}

// OutgoingInvite is what the server returns from /v1/invites/outgoing.
// `code` is unrecoverable post-creation, so listings carry `codeHash` as the
// revoke key instead.
export interface OutgoingInvite {
  codeHash: string;
  projectId: string;
  projectName: string;
  role: string;
  createdAt: string;
  expiresAt: string;
}

export interface AcceptInviteResult {
  projectId: string;
  role: string;
}

export class InviteClient {
  constructor(private readonly fetcher: Fetcher, private readonly base: string) {}

  // Creates either a server invite (projectId omitted, owner-only) or a project
  // invite (projectId + role, project-owner-only).
  async create(args: { projectId?: string; role?: "editor" | "viewer"; ttlMs?: number }): Promise<Invite> {
    const res = await this.fetcher(
      new Request(`${this.base}/v1/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: args.projectId,
          role: args.role,
          ttl_ms: args.ttlMs ?? 0,
        }),
      }),
    );
    return (await res.json()) as Invite;
  }

  async accept(code: string): Promise<AcceptInviteResult> {
    const res = await this.fetcher(
      new Request(`${this.base}/v1/invites/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }),
    );
    const body = (await res.json()) as Partial<AcceptInviteResult>;
    return { projectId: body.projectId ?? "", role: body.role ?? "" };
  }

  async listOutgoing(): Promise<OutgoingInvite[]> {
    const res = await this.fetcher(new Request(`${this.base}/v1/invites/outgoing`));
    const body = (await res.json()) as { invites?: OutgoingInvite[] };
    return body.invites ?? [];
  }

  async revoke(codeHash: string): Promise<void> {
    await this.fetcher(
      new Request(`${this.base}/v1/invites/${encodeURIComponent(codeHash)}`, { method: "DELETE" }),
    );
  }
}
