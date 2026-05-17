export interface User {
  id: string;
  name: string;
  role: string; // "owner" | "member"
  createdAt: string;
}

export interface Device {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface ServerSettings {
  registrationOpen: boolean;
}
