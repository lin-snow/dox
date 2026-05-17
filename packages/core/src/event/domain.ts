// grpc-gateway serializes int64 as a JSON string; keep `createdAt` as the raw
// string and let the renderer parse it via the shared relativeTime helper.

export type ActivityVerb = "todo_created" | "todo_completed" | "member_joined";

export interface ActivityEvent {
  id: string;
  verb: ActivityVerb;
  actorId: string;
  actorName: string;
  projectId: string;
  projectName: string;
  // Free-form color string (mirrors Project.color). May be empty when the
  // project was created without one.
  projectColor: string;
  // "todo" | "project" — discriminates what target_id points at.
  targetType: string;
  targetId: string;
  targetLabel: string;
  createdAt: string;
}
