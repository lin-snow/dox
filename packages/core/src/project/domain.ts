export interface Project {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  color: string;
  archived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPatch {
  name?: string;
  description?: string;
  color?: string;
  archived?: boolean;
  sortOrder?: number;
}

export interface ProjectMember {
  userId: string;
  // Resolved by the server. Empty only in legacy responses or if the user row
  // was somehow deleted out from under the membership.
  userName: string;
  role: string; // "editor" | "viewer"
  addedAt: string;
}
