import type { Fetcher } from "../http";
import type { ActivityEvent } from "./domain";

export interface EventsApi {
  list(opts?: { limit?: number }): Promise<ActivityEvent[]>;
  /**
   * Long-poll the server's change counter. Resolves with a version that
   * differs from `since` as soon as any /v1 write commits, or with `since`
   * itself when the timeout elapses — so a caller loops until it is cancelled.
   */
  watchChanges(
    since: number,
    opts?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<number>;
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

  async watchChanges(
    since: number,
    opts?: { timeoutMs?: number; signal?: AbortSignal },
  ): Promise<number> {
    const url = new URL(`${this.base}/v1/changes`);
    url.searchParams.set("since", String(since));
    if (opts?.timeoutMs !== undefined) {
      url.searchParams.set("timeout_ms", String(opts.timeoutMs));
    }
    const res = await this.fetcher(
      new Request(url.toString(), { signal: opts?.signal }),
    );
    // The gateway renders uint64 as a JSON string.
    const json = (await res.json()) as { version?: string | number };
    return Number(json.version ?? since);
  }
}
