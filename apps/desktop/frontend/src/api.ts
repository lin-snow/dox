import {
  EventClient,
  NotificationClient,
  ProjectClient,
  TodoClient,
  UserClient,
  compose,
  withErrorMap,
  withRetry,
  type Fetcher,
} from "@dox/core/browser";

/**
 * Every `/v1` call is same-origin: the Go backend proxies it to the configured
 * server and attaches the bearer token on the way out. That is why there is no
 * `withAuth` here — the JWT never enters JavaScript, so a compromised renderer
 * cannot exfiltrate the credential.
 */
const fetcher: Fetcher = compose(withRetry(2), withErrorMap)(fetch);

export const api = {
  todos: new TodoClient(fetcher, location.origin),
  projects: new ProjectClient(fetcher, location.origin),
  events: new EventClient(fetcher, location.origin),
  reminders: new NotificationClient(fetcher, location.origin),
  users: new UserClient(fetcher, location.origin),
};

export interface SessionUser {
  id: string;
  name: string;
  role: string;
}

export interface Session {
  /** Configured dox server, "" before onboarding. */
  server: string;
  signedIn: boolean;
  user: SessionUser | null;
  /** Desktop build version, injected at compile time. */
  version: string;
  unreadCount: number;
}

export interface Probe {
  hasUsers: boolean;
  registrationOpen: boolean;
  version: string;
  commit: string;
  serverName: string;
  serverDescription: string;
  ownerName: string;
}

export interface Prefs {
  lastView: string;
  notificationsEnabled: boolean;
  /** Keep finished rows on the board; off means the board is open work only. */
  showCompleted: boolean;
}

/** Saving a server also returns what it reported, so onboarding can branch. */
export interface ServerState {
  session: Session;
  probe: Probe;
}

export interface RegisterInput {
  userName: string;
  password: string;
  inviteCode?: string;
  serverName?: string;
  serverDescription?: string;
}

/** Thin JSON client for the desktop control surface under /__dox. */
async function call<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const error = (await res.json()) as { message?: string };
      if (error.message) message = error.message;
    } catch {
      /* plain-text error body; keep the status line */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const desktop = {
  session: () => call<Session>("/__dox/session", "GET"),

  setServer: (server: string) =>
    call<ServerState>("/__dox/server", "PUT", { server }),

  signIn: (userName: string, password: string) =>
    call<Session>("/__dox/session", "POST", { userName, password }),

  register: (input: RegisterInput) =>
    call<Session>("/__dox/register", "POST", input),

  signOut: () => call<Session>("/__dox/session", "DELETE"),

  prefs: () => call<Prefs>("/__dox/prefs", "GET"),

  savePrefs: (patch: Partial<Prefs>) =>
    call<Prefs>("/__dox/prefs", "PUT", patch),
};

export type {
  Todo,
  TodoPatch,
  Project,
  ActivityEvent,
} from "@dox/core/browser";
