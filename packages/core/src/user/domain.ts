export interface User {
  id: string;
  name: string;
  role: string;
  createdAt: string;
}

export interface ServerSettings {
  registrationOpen: boolean;
  serverName: string;
  serverDescription: string;
}
