import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import * as toml from "@iarna/toml";

export interface Config {
  server: string;
  token: string;
}

const configDir = () => join(homedir(), ".config", "dox");
const configPath = () => join(configDir(), "config.toml");

export async function loadConfig(): Promise<Config | null> {
  const path = configPath();
  if (!existsSync(path)) return null;

  const raw = await readFile(path, "utf-8");
  const parsed = toml.parse(raw) as Record<string, unknown>;
  if (typeof parsed.server !== "string" || typeof parsed.token !== "string") {
    throw new Error(`malformed config at ${path}: expected string fields 'server' and 'token'`);
  }
  return { server: parsed.server, token: parsed.token };
}

export async function saveConfig(cfg: Config): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const raw = toml.stringify({ server: cfg.server, token: cfg.token });
  const path = configPath();
  await writeFile(path, raw, { mode: 0o600 });
  // writeFile mode may be ignored if file already existed; explicit chmod ensures 600.
  await chmod(path, 0o600);
}

export function getConfigPath(): string {
  return configPath();
}
