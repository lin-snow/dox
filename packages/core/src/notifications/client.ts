import type { Fetcher } from "../http";
import type { ReminderList } from "./domain";

export interface NotificationsApi {
  list(opts?: { limit?: number; unreadOnly?: boolean }): Promise<ReminderList>;
  /** Marks the given reminders read; empty/omitted acks every unread row. */
  ack(ids?: string[]): Promise<number>;
}

export class NotificationClient implements NotificationsApi {
  constructor(
    private readonly fetcher: Fetcher,
    private readonly base: string,
  ) {}

  async list(opts?: {
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<ReminderList> {
    const url = new URL(`${this.base}/v1/notifications`);
    if (opts?.limit !== undefined) {
      url.searchParams.set("limit", String(opts.limit));
    }
    if (opts?.unreadOnly) {
      url.searchParams.set("unread_only", "true");
    }
    const res = await this.fetcher(new Request(url.toString()));
    const json = (await res.json()) as Partial<ReminderList>;
    return {
      notifications: json.notifications ?? [],
      unreadCount: json.unreadCount ?? 0,
    };
  }

  async ack(ids?: string[]): Promise<number> {
    const res = await this.fetcher(
      new Request(`${this.base}/v1/notifications/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids ?? [] }),
      }),
    );
    const json = (await res.json()) as { acked?: number };
    return json.acked ?? 0;
  }
}
