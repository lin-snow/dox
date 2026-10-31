export type ActivityVerb = "todo_created" | "todo_completed" | "member_joined";

export interface ActivityEvent {
  id: string;
  verb: ActivityVerb;
  actorId: string;
  actorName: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  createdAt: string;
}
