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
  role: string; // "editor" | "viewer"
  addedAt: string;
}
