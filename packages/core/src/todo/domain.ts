export interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  createdBy: string;
  description?: string;
  /** Deadline, UTC unix milliseconds (grpc-gateway renders int64 as string). */
  dueAt?: string;
  /** dueAt is a calendar date rather than an instant. */
  dueAllDay?: boolean;
  /** IANA zone an all-day dueAt belongs to (display only). */
  dueZone?: string;
  /** Reminder instant; absent = remind at dueAt. */
  remindAt?: string;
  /**
   * Manual ordering key in the todo's list scope. Higher sorts first; the
   * server renumbers the scope densely on every move.
   */
  position?: string;
  /** Meeting window; both sides present or neither. */
  startsAt?: string;
  endsAt?: string;
}

/**
 * Patch semantics mirror the server: an absent field is "unchanged", `null`
 * clears it, a value sets it. That keeps clearing expressible without a
 * sentinel value in every call site.
 */
export interface TodoPatch {
  title?: string;
  done?: boolean;
  description?: string;
  dueAt?: number | null;
  dueAllDay?: boolean;
  dueZone?: string;
  remindAt?: number | null;
  /** Meeting window. 0 clears both sides; absent leaves them untouched. */
  startsAt?: number | null;
  endsAt?: number | null;
}

export interface TodoCreateOptions {
  projectId?: string;
  description?: string;
  dueAt?: number;
  dueAllDay?: boolean;
  dueZone?: string;
  remindAt?: number;
  /** Meeting window, UTC ms. Both or neither. */
  startsAt?: number;
  endsAt?: number;
}

export type TodoFilter = string | "inbox" | undefined;
