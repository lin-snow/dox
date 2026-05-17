import type { Fetcher } from "../http";
import type { Device, ServerSettings, User } from "./domain";

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
    return (await res.json()) as ServerSettings;
  }

  async updateSettings(patch: { registrationOpen?: boolean }): Promise<ServerSettings> {
    const res = await this.fetcher(
      new Request(`${this.base}/v1/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration_open: patch.registrationOpen }),
      }),
    );
    return (await res.json()) as ServerSettings;
  }

  async listMyDevices(): Promise<Device[]> {
    const res = await this.fetcher(new Request(`${this.base}/v1/me/devices`));
    const body = (await res.json()) as { devices?: Device[] };
    return body.devices ?? [];
  }

  async createPairingCode(args: { deviceName: string; ttlMs?: number }): Promise<{ code: string; expiresAt: string }> {
    const res = await this.fetcher(
      new Request(`${this.base}/v1/me/devices/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_name: args.deviceName, ttl_ms: args.ttlMs ?? 0 }),
      }),
    );
    const body = (await res.json()) as { code?: string; expiresAt?: string };
    return { code: body.code ?? "", expiresAt: body.expiresAt ?? "" };
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.fetcher(
      new Request(`${this.base}/v1/me/devices/${encodeURIComponent(deviceId)}`, { method: "DELETE" }),
    );
  }
}
