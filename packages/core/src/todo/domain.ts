export interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  createdBy: string;
  description?: string;
}

export interface TodoPatch {
  title?: string;
  done?: boolean;
  description?: string;
}

export type TodoFilter = string | "inbox" | undefined;
