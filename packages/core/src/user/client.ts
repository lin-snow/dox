import type { Fetcher } from "../http";
import type { ServerSettings, User } from "./domain";

export class UserClient {
  constructor(private readonly fetcher: Fetcher, private readonly base: string) {}

  async me(): Promise<User> {
    const res = await this.fetcher(new Request(`${this.base}/v1/me`));
    return (await res.json()) as User;
  }

  async list(): Promise<User[]> {
    const res = await this.fetcher(new Request(`${this.base}/v1/users`));
    const body = (await res.json()) as { users?: User[] };
    return body.users ?? [];
  }

  async remove(id: string): Promise<void> {
    await this.fetcher(new Request(`${this.base}/v1/users/${encodeURIComponent(id)}`, { method: "DELETE" }));
  }

  async getSettings(): Promise<ServerSettings> {
    const res = await this.fetcher(new Request(`${this.base}/v1/settings`));
    const body = (await res.json()) as Partial<ServerSettings>;
    return {
      registrationOpen: Boolean(body.registrationOpen),
      serverName: body.serverName ?? "",
      serverDescription: body.serverDescription ?? "",
    };
  }

  async updateSettings(patch: {
    registrationOpen?: boolean;
    serverName?: string;
    serverDescription?: string;
  }): Promise<ServerSettings> {
    const res = await this.fetcher(
      new Request(`${this.base}/v1/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration_open: patch.registrationOpen,
          server_name: patch.serverName,
          server_description: patch.serverDescription,
        }),
      }),
    );
    const body = (await res.json()) as Partial<ServerSettings>;
    return {
      registrationOpen: Boolean(body.registrationOpen),
      serverName: body.serverName ?? "",
      serverDescription: body.serverDescription ?? "",
    };
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.fetcher(
      new Request(`${this.base}/v1/me/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      }),
    );
  }

  // Owner-only. Returns a plaintext one-time temp password; relay out-of-band
  // and have the user ChangePassword on first login.
  async resetUserPassword(userId: string): Promise<{ tempPassword: string }> {
    const res = await this.fetcher(
      new Request(`${this.base}/v1/users/${encodeURIComponent(userId)}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    const body = (await res.json()) as { tempPassword?: string };
    return { tempPassword: body.tempPassword ?? "" };
  }
}
