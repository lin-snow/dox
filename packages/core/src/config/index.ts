import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import * as toml from "@iarna/toml";

export interface Config {
  server: string;
  token: string;
  userId: string;
  userName: string;
  role: string;
  defaultProject?: string;
}

const configDir = () => join(homedir(), ".config", "dox");
const configPath = () => join(configDir(), "config.toml");

function pickString(parsed: Record<string, unknown>, key: string): string {
  const v = parsed[key];
  return typeof v === "string" ? v : "";
}

export async function loadConfig(): Promise<Config | null> {
  const path = configPath();
  if (!existsSync(path)) return null;

  const raw = await readFile(path, "utf-8");
  const parsed = toml.parse(raw) as Record<string, unknown>;
  if (typeof parsed.server !== "string" || typeof parsed.token !== "string") {
    throw new Error(
      `malformed config at ${path}: 'server' and 'token' are required`,
    );
  }
  const ui = (parsed.ui as Record<string, unknown> | undefined) ?? {};
  return {
    server: parsed.server,
    token: parsed.token,
    userId: pickString(parsed, "user_id"),
    userName: pickString(parsed, "user_name"),
    role: pickString(parsed, "role"),
    defaultProject:
      typeof ui.default_project === "string" ? ui.default_project : undefined,
  };
}

export async function saveConfig(cfg: Config): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const body: Record<string, unknown> = {
    server: cfg.server,
    token: cfg.token,
    user_id: cfg.userId,
    user_name: cfg.userName,
    role: cfg.role,
  };
  if (cfg.defaultProject) {
    body.ui = { default_project: cfg.defaultProject };
  }
  const raw = toml.stringify(body as toml.JsonMap);
  const path = configPath();
  await writeFile(path, raw, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function clearConfig(): Promise<boolean> {
  const path = configPath();
  if (!existsSync(path)) return false;
  await rm(path, { force: true });
  return true;
}

export function getConfigPath(): string {
  return configPath();
}
