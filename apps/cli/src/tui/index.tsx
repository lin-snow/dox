import { useState } from "react";
import { render } from "ink";

import {
  type Config,
  ProjectClient,
  TodoClient,
  buildFetcher,
  checkToken,
  getConfigPath,
  loadConfig,
  realIO,
} from "@dox/core";

import { App } from "./App";
import { Onboarding, type OnboardingReason } from "./components/Onboarding";

interface RootProps {
  initialConfig: Config | null;
  initialReason: OnboardingReason;
}

// Root swaps between Onboarding and App in-place: once Onboarding writes a
// fresh config we re-render with App, no restart.
function Root({ initialConfig, initialReason }: RootProps) {
  const [config, setConfig] = useState<Config | null>(initialConfig);
  if (!config) {
    return <Onboarding reason={initialReason} onDone={setConfig} />;
  }
  const fetcher = buildFetcher(config, realIO());
  const api = new TodoClient(fetcher, config.server);
  const projects = new ProjectClient(fetcher, config.server);
  return (
    <App
      api={api}
      projects={projects}
      identity={{
        userName: config.userName,
        server: config.server,
        configPath: getConfigPath(),
      }}
    />
  );
}

export async function runTui(): Promise<void> {
  const cfg = await loadConfig();
  let initialConfig: Config | null = cfg;
  let initialReason: OnboardingReason = "fresh";

  if (cfg) {
    // Validate before mounting App so a revoked/stale token routes the user to
    // onboarding instead of dead-ending at a permanent "unauthorized" banner.
    // Transient failures (network, 5xx) fall through and let App surface them.
    const status = await checkToken(cfg, realIO());
    if (status === "revoked") {
      initialConfig = null;
      initialReason = "reauth";
    }
  }

  const app = render(<Root initialConfig={initialConfig} initialReason={initialReason} />);
  await app.waitUntilExit();
}
