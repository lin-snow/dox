// grpc-gateway serializes int64 as JSON string; JS Number can't hold the full
// range so we keep timestamps as strings until display.
//
// Kept hand-written rather than re-using @dox/proto-gen's Todo_pb — the
// generated message type carries $typeName / $unknown buf-runtime fields that
// would leak into UI props. proto-gen stays the wire-level source of truth.
export interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  // Optional project the todo lives in. Absent (server returns no field for
  // the proto `optional` when unset) means the Inbox.
  projectId?: string;
  createdBy: string;
}

export interface TodoPatch {
  title?: string;
  done?: boolean;
}

export type TodoFilter = string | "inbox" | undefined;
