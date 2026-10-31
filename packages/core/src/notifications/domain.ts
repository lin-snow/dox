export interface Reminder {
  id: string;
  todoId: string;
  /** Title snapshot taken when the reminder fired. */
  todoTitle: string;
  projectId?: string;
  kind: string;
  /** Trigger instant, UTC unix milliseconds (grpc-gateway: string). */
  scheduledFor: string;
  /** Unset = unread. */
  readAt?: string;
  createdAt: string;
}

export interface ReminderList {
  notifications: Reminder[];
  /** Total unread, independent of the requested limit/filter. */
  unreadCount: number;
}
