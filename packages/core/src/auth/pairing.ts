import { ApiError } from "../http";

export interface PairingResult {
  token: string;
  deviceId: string;
  deviceName: string;
}

// Strips formatting (dashes, spaces) and uppercases — matches the server's
// pair.NormalizeCode so users can paste the displayed "ABCD-EFGH" form unchanged.
export function normalizePairingCode(input: string): string {
  return input.replace(/[-\s]/g, "").toUpperCase();
}

// Trades a pairing code for a per-device bearer token. Does not require a
// config (the endpoint is public) and intentionally bypasses the Fetcher
// middleware chain — no token to inject, no telemetry to share.
export async function redeemPairingCode(
  serverUrl: string,
  code: string,
): Promise<PairingResult> {
  const res = await fetch(`${serverUrl}/v1/auth/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalizePairingCode(code) }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  const body = (await res.json()) as { token?: string; deviceId?: string; deviceName?: string };
  if (!body.token || !body.deviceId || !body.deviceName) {
    throw new Error(`malformed redeem response: ${JSON.stringify(body)}`);
  }
  return { token: body.token, deviceId: body.deviceId, deviceName: body.deviceName };
}
