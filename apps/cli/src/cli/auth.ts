import * as p from "@clack/prompts";

import { redeemPairingCode, saveConfig } from "@dox/core";

interface LoginOptions {
  server: string;
}

export async function login(opts: LoginOptions): Promise<void> {
  let serverUrl: URL;
  try {
    serverUrl = new URL(opts.server);
  } catch {
    console.error(`dox: invalid server URL: ${opts.server}`);
    process.exit(1);
  }

  p.intro(`Login to ${serverUrl.origin}`);

  const code = await p.text({
    message: "Enter pairing code (run `dox-server pair --name <device>` on the server):",
    placeholder: "ABCD-EFGH",
    validate: (v) => (v.replace(/[-\s]/g, "").length < 6 ? "Pairing code looks too short" : undefined),
  });

  if (p.isCancel(code)) {
    p.cancel("Login cancelled");
    process.exit(1);
  }

  let result;
  try {
    result = await redeemPairingCode(serverUrl.origin, code);
  } catch (err) {
    p.cancel(`Login failed: ${(err as Error).message}`);
    process.exit(1);
  }

  await saveConfig({ server: serverUrl.origin, token: result.token });
  p.outro(`Logged in as "${result.deviceName}". Config saved to ~/.config/dox/config.toml`);
}
