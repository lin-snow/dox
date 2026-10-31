import type { Config } from "../config";
import { ApiError, buildFetcher, type Fetcher } from "../http";
import type { IO } from "../io";

export type TokenStatus = "valid" | "revoked" | "unreachable";

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
  hasUsers: boolean;
  registrationOpen: boolean;
  version: string;
  commit: string;
  serverName: string;
  serverDescription: string;
  ownerName: string;
}

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
