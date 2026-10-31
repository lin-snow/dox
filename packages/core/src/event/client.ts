import type { Fetcher } from "../http";
import type { ActivityEvent } from "./domain";

export interface EventsApi {
  list(opts?: { limit?: number }): Promise<ActivityEvent[]>;
}

export class EventClient implements EventsApi {
  constructor(
    private readonly fetcher: Fetcher,
    private readonly base: string,
  ) {}

  async list(opts?: { limit?: number }): Promise<ActivityEvent[]> {
    const url = new URL(`${this.base}/v1/events`);
    if (opts?.limit !== undefined) {
      url.searchParams.set("limit", String(opts.limit));
    }
    const res = await this.fetcher(new Request(url.toString()));
    const json = (await res.json()) as { events?: ActivityEvent[] };
    return json.events ?? [];
  }
}
