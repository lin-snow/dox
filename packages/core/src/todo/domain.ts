// grpc-gateway serializes int64 as JSON string; JS Number can't hold the full
// range so we keep them as strings until display.
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
}

export interface TodoPatch {
  title?: string;
  done?: boolean;
}
