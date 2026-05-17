import { useState } from "react";
import { render } from "ink";

import {
  type Config,
  EventClient,
  InviteClient,
  ProjectClient,
  TodoClient,
  UserClient,
  buildFetcher,
  checkToken,
  getConfigPath,
  loadConfig,
  realIO,
} from "@dox/core";

import { App } from "./App";
import { Onboarding, type OnboardingReason } from "./components/views/onboarding/Onboarding";

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
  const events = new EventClient(fetcher, config.server);
  const users = new UserClient(fetcher, config.server);
  const invites = new InviteClient(fetcher, config.server);
  return (
    <App
      api={api}
      projects={projects}
      events={events}
      users={users}
      invites={invites}
      identity={{
        userId: config.userId,
        userName: config.userName,
        role: config.role,
        server: config.server,
        configPath: getConfigPath(),
      }}
      onSignedOut={() => setConfig(null)}
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
