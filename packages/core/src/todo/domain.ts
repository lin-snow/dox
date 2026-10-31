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
}

export interface TodoCreateOptions {
  projectId?: string;
  description?: string;
  dueAt?: number;
  dueAllDay?: boolean;
  dueZone?: string;
  remindAt?: number;
}

export type TodoFilter = string | "inbox" | undefined;
