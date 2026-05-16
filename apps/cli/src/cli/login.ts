import * as p from "@clack/prompts";

import { saveConfig } from "@dox/core/config";

interface LoginOptions {
  server: string;
}

export async function loginCommand(opts: LoginOptions): Promise<void> {
  let serverUrl: URL;
  try {
    serverUrl = new URL(opts.server);
  } catch {
    console.error(`dox: invalid server URL: ${opts.server}`);
    process.exit(1);
  }

  p.intro(`Login to ${serverUrl.origin}`);

  const token = await p.password({
    message: "Paste your bootstrap token:",
    validate: (v) => (v.length < 16 ? "Token looks too short (expected 32+ hex chars)" : undefined),
  });

  if (p.isCancel(token)) {
    p.cancel("Login cancelled");
    process.exit(1);
  }

  await saveConfig({ server: serverUrl.origin, token });
  p.outro(`Logged in. Config saved to ~/.config/dox/config.toml`);
}
