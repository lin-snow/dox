import type { Config } from "../config";
import { ApiError, buildFetcher, type Fetcher } from "../http";
import type { IO } from "../io";

export type TokenStatus = "valid" | "revoked" | "unreachable";

// checkToken probes /v1/me with the saved token so the TUI can distinguish
// "config is stale, prompt for re-login" from "server is down, surface a
// transient error". A 401/403 means the token is expired or invalid; anything
// else (network failure, 5xx) is treated as transient.
export async function checkToken(cfg: Config, io: IO): Promise<TokenStatus> {
  const fetcher = buildFetcher(cfg, io);
  try {
    await fetcher(new Request(`${cfg.server}/v1/me`));
    return "valid";
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return "revoked";
    }
    return "unreachable";
  }
}

export interface ServerInfo {
  // Once true, Register requires an invite (or open registration). When false,
  // the next Register call promotes the caller to owner.
  hasUsers: boolean;
  registrationOpen: boolean;
  // Build identity from the server. Both empty for `go run`-style builds where
  // ldflags weren't injected and ReadBuildInfo had nothing to fall back on.
  version: string;
  commit: string;
  // Owner-set server identity. Empty until configured.
  serverName: string;
  serverDescription: string;
  // Display name of the server's owner. Empty until first Register completes.
  ownerName: string;
}

// fetchServerInfo probes a server before login so onboarding can pick the
// right branch and show server identity. Public endpoint, no auth header.
export async function fetchServerInfo(serverUrl: string): Promise<ServerInfo> {
  const base = serverUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/auth/server-info`);
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  const body = (await res.json()) as {
    hasUsers?: boolean;
    registrationOpen?: boolean;
    version?: string;
    commit?: string;
    serverName?: string;
    serverDescription?: string;
    ownerName?: string;
  };
  return {
    hasUsers: Boolean(body.hasUsers),
    registrationOpen: Boolean(body.registrationOpen),
    version: body.version ?? "",
    commit: body.commit ?? "",
    serverName: body.serverName ?? "",
    serverDescription: body.serverDescription ?? "",
    ownerName: body.ownerName ?? "",
  };
}

export interface AuthResult {
  token: string;
  userId: string;
  userName: string;
  role: string;
}

// Strips formatting (dashes, spaces) and uppercases — matches the server's
// authn.NormalizeCode so users can paste the displayed "ABCD-EFGH" form
// unchanged. Used for invite codes.
export function normalizeCode(input: string): string {
  return input.replace(/[-\s]/g, "").toUpperCase();
}

async function postJSON(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return res.json();
}

// register creates a new user. Public endpoint. First caller becomes owner
// and may inline-set server identity; subsequent callers need either an
// invite_code or registration_open=true.
export async function register(
  serverUrl: string,
  args: {
    userName: string;
    password: string;
    inviteCode?: string;
    serverName?: string;
    serverDescription?: string;
  },
): Promise<AuthResult> {
  const body = (await postJSON(`${serverUrl}/v1/auth/register`, {
    user_name: args.userName,
    password: args.password,
    invite_code: args.inviteCode ? normalizeCode(args.inviteCode) : undefined,
    server_name: args.serverName,
    server_description: args.serverDescription,
  })) as Partial<AuthResult>;
  if (!body.token || !body.userId) {
    throw new Error(`malformed register response: ${JSON.stringify(body)}`);
  }
  return {
    token: body.token,
    userId: body.userId,
    userName: body.userName ?? args.userName,
    role: body.role ?? "",
  };
}

// login authenticates an existing user. Public endpoint, no auth header.
export async function login(
  serverUrl: string,
  args: { userName: string; password: string },
): Promise<AuthResult> {
  const body = (await postJSON(`${serverUrl}/v1/auth/login`, {
    user_name: args.userName,
    password: args.password,
  })) as Partial<AuthResult>;
  if (!body.token || !body.userId) {
    throw new Error(`malformed login response: ${JSON.stringify(body)}`);
  }
  return {
    token: body.token,
    userId: body.userId,
    userName: body.userName ?? args.userName,
    role: body.role ?? "",
  };
}

// acceptInvite adds the authenticated caller to a project named by the invite.
// Requires the fetcher (carrying the auth token).
export async function acceptInvite(
  fetcher: Fetcher,
  base: string,
  code: string,
): Promise<{ projectId: string; role: string }> {
  const res = await fetcher(
    new Request(`${base}/v1/invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: normalizeCode(code) }),
    }),
  );
  const body = (await res.json()) as { projectId?: string; role?: string };
  return { projectId: body.projectId ?? "", role: body.role ?? "" };
}
