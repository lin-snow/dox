import type { Config } from "../config";
import { ApiError, buildFetcher, type Fetcher } from "../http";
import type { IO } from "../io";

export type TokenStatus = "valid" | "revoked" | "unreachable";

// checkToken probes /v1/me with the saved token so the TUI can distinguish
// "config is stale, prompt for re-login" from "server is down, surface a
// transient error". A 401/403 means the device record was revoked or the DB
// rotated; anything else (network failure, 5xx) is treated as transient.
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
}

// fetchServerInfo probes a server before login so the onboarding flow can pick
// the right branch (first-user / open / invite-required) without asking the
// user to understand those concepts. Public endpoint, no auth header.
export async function fetchServerInfo(serverUrl: string): Promise<ServerInfo> {
  const res = await fetch(`${serverUrl}/v1/auth/server-info`);
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  const body = (await res.json()) as { hasUsers?: boolean; registrationOpen?: boolean };
  return {
    hasUsers: Boolean(body.hasUsers),
    registrationOpen: Boolean(body.registrationOpen),
  };
}

export interface PairingResult {
  token: string;
  deviceId: string;
  deviceName: string;
  userId: string;
  userName: string;
}

export interface RegisterResult {
  token: string;
  userId: string;
  userName: string;
  role: string;
  deviceId: string;
  deviceName: string;
}

// Strips formatting (dashes, spaces) and uppercases — matches the server's
// auth.NormalizeCode so users can paste the displayed "ABCD-EFGH" form unchanged.
export function normalizeCode(input: string): string {
  return input.replace(/[-\s]/g, "").toUpperCase();
}

// Backwards-compatible alias.
export const normalizePairingCode = normalizeCode;

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

// redeemPairingCode adds the calling device to an existing user account.
// Public endpoint; does not require an auth header.
export async function redeemPairingCode(serverUrl: string, code: string): Promise<PairingResult> {
  const body = (await postJSON(`${serverUrl}/v1/auth/redeem`, {
    code: normalizeCode(code),
  })) as Partial<PairingResult>;
  if (!body.token || !body.userId || !body.deviceId) {
    throw new Error(`malformed redeem response: ${JSON.stringify(body)}`);
  }
  return {
    token: body.token,
    deviceId: body.deviceId,
    deviceName: body.deviceName ?? "",
    userId: body.userId,
    userName: body.userName ?? "",
  };
}

// register creates a new user. Public endpoint. First caller becomes owner;
// subsequent callers need either an invite_code or registration_open=true.
export async function register(
  serverUrl: string,
  args: { userName: string; deviceName: string; inviteCode?: string },
): Promise<RegisterResult> {
  const body = (await postJSON(`${serverUrl}/v1/auth/register`, {
    user_name: args.userName,
    device_name: args.deviceName,
    invite_code: args.inviteCode ? normalizeCode(args.inviteCode) : undefined,
  })) as Partial<RegisterResult>;
  if (!body.token || !body.userId) {
    throw new Error(`malformed register response: ${JSON.stringify(body)}`);
  }
  return {
    token: body.token,
    userId: body.userId,
    userName: body.userName ?? args.userName,
    role: body.role ?? "",
    deviceId: body.deviceId ?? "",
    deviceName: body.deviceName ?? args.deviceName,
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
