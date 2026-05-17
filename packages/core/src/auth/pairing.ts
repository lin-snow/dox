import { ApiError, type Fetcher } from "../http";

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
