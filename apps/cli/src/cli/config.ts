import { getConfigPath, loadConfig, saveConfig, type Config } from "@dox/core";

import type { GlobalOpts } from "./context";

function loadOrExit(): Promise<Config> {
  return loadConfig().then((cfg) => {
    if (!cfg) {
      console.error(
        "dox: not logged in. Run 'dox register --server <url>' first.",
      );
      process.exit(1);
    }
    return cfg;
  });
}

// setDefaultProject writes [ui] default_project in ~/.config/dox/config.toml.
// Pass "none" / "clear" / "" to remove the setting (CLI/TUI then shows "All").
// Pass "inbox" or a project id to lock the default to that filter.
export async function setDefaultProject(
  value: string,
  _opts: GlobalOpts,
): Promise<void> {
  const cfg = await loadOrExit();
  const clear = value === "" || value === "none" || value === "clear";
  cfg.defaultProject = clear ? undefined : value;
  await saveConfig(cfg);
  if (clear) {
    console.log(`default project cleared (${getConfigPath()}).`);
  } else {
    console.log(`default project = ${value} (${getConfigPath()}).`);
  }
}
