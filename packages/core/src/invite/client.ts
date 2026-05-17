import type { Fetcher } from "../http";

export interface Invite {
  code: string;
  issuedBy: string;
  projectId: string;
  role: string;
  createdAt: string;
  expiresAt: string;
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
}
