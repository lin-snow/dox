import type { Fetcher } from "../http";
import type { ActivityEvent } from "./domain";

export interface EventsApi {
  list(opts?: { limit?: number }): Promise<ActivityEvent[]>;
}

export class EventClient implements EventsApi {
  constructor(private readonly fetcher: Fetcher, private readonly base: string) {}

  async list(opts?: { limit?: number }): Promise<ActivityEvent[]> {
    const url = new URL(`${this.base}/v1/events`);
    if (opts?.limit !== undefined) {
      url.searchParams.set("limit", String(opts.limit));
    }
    const res = await this.fetcher(new Request(url.toString()));
    // grpc-gateway emits camelCase JSON (default `origName: false`), which
    // already matches the ActivityEvent domain shape — no snake→camel
    // adapter needed. createdAt stays a string because int64 is serialized
    // as a JSON string to survive JS Number precision.
    const json = (await res.json()) as { events?: ActivityEvent[] };
    return json.events ?? [];
  }
}
