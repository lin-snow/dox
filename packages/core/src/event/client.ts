import type { Fetcher } from "../http";
import type { ActivityEvent, ActivityVerb } from "./domain";

export interface EventsApi {
  list(opts?: { limit?: number }): Promise<ActivityEvent[]>;
}

// grpc-gateway emits proto fields as snake_case JSON; the wire shape mirrors
// the EventService.Event message 1:1. We narrow into the camelCase domain type
// at the boundary so consumers don't have to think about it.
interface WireEvent {
  id: string;
  verb: string;
  actor_id: string;
  actor_name: string;
  project_id: string;
  project_name: string;
  project_color: string;
  target_type: string;
  target_id: string;
  target_label: string;
  created_at: string;
}

export class EventClient implements EventsApi {
  constructor(private readonly fetcher: Fetcher, private readonly base: string) {}

  async list(opts?: { limit?: number }): Promise<ActivityEvent[]> {
    const url = new URL(`${this.base}/v1/events`);
    if (opts?.limit !== undefined) {
      url.searchParams.set("limit", String(opts.limit));
    }
    const res = await this.fetcher(new Request(url.toString()));
    const json = (await res.json()) as { events?: WireEvent[] };
    return (json.events ?? []).map(adapt);
  }
}

function adapt(w: WireEvent): ActivityEvent {
  return {
    id: w.id,
    verb: w.verb as ActivityVerb,
    actorId: w.actor_id,
    actorName: w.actor_name,
    projectId: w.project_id,
    projectName: w.project_name,
    projectColor: w.project_color,
    targetType: w.target_type,
    targetId: w.target_id,
    targetLabel: w.target_label,
    createdAt: w.created_at,
  };
}
