import { useState, type FormEvent } from "react";

import { desktop, type Probe, type Session } from "../api";

interface Props {
  initialServer: string;
  notice?: string;
  onDone: (session: Session) => void;
}

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Onboarding mirrors docs/onboarding.md: the server is probed first, and the
 * branch picker is always shown once it has users. `registrationOpen` decides
 * whether *registering* needs an invite — never whether the user is signing in.
 * Auto-routing a returning user into register silently creates duplicates.
 */
export function Onboarding({ initialServer, notice, onDone }: Props) {
  const [server, setServer] = useState(
    initialServer || "http://localhost:6278",
  );
  const [probe, setProbe] = useState<Probe | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [invite, setInvite] = useState("");
  const [serverName, setServerName] = useState("");
  const [error, setError] = useState(notice ?? "");
  const [busy, setBusy] = useState(false);

  const firstRun = probe !== null && !probe.hasUsers;
  const registering = firstRun || mode === "register";
  const needsInvite =
    registering && probe !== null && probe.hasUsers && !probe.registrationOpen;

  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const state = await desktop.setServer(server.trim());
      setProbe(state.probe);
      setMode(state.probe.hasUsers ? "login" : "register");
      // A token imported from the CLI's config.toml lands here.
      if (state.session.signedIn) onDone(state.session);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (registering) {
      if (password.length < 8) {
        setError("password must be at least 8 characters");
        return;
      }
      if (password !== confirm) {
        setError("passwords do not match");
        return;
      }
    }
    setBusy(true);
    try {
      const session = registering
        ? await desktop.register({
            userName: userName.trim(),
            password,
            inviteCode: needsInvite ? invite.trim().toUpperCase() : undefined,
            serverName:
              firstRun && serverName.trim() ? serverName.trim() : undefined,
          })
        : await desktop.signIn(userName.trim(), password);
      onDone(session);
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="drag" />
      <div className="onboarding">
        <div className="card">
          <div className="brand-line">
            <span className="mark">◆</span> dox
          </div>

          <h1>{probe ? probe.serverName || "dox" : "Connect a server"}</h1>
          <p className="sub">
            {probe
              ? [
                  probe.ownerName ? `by ${probe.ownerName}` : "self-hosted",
                  probe.registrationOpen ? "registration open" : "invite only",
                  probe.version.startsWith("(")
                    ? probe.version
                    : `v${probe.version}`,
                ].join(" · ")
              : "point this app at the dox server you run"}
          </p>

          <div className="chips">
            {server ? (
              <span className="chip">server: {server.trim()}</span>
            ) : null}
            {probe ? (
              <span className="chip">
                {probe.hasUsers
                  ? "existing server"
                  : "first user becomes owner"}
              </span>
            ) : null}
          </div>

          {probe === null ? (
            <form onSubmit={connect} className="stack">
              <label className="field">
                <span>Server URL</span>
                <input
                  id="server-url"
                  name="server"
                  value={server}
                  onChange={(event) => setServer(event.target.value)}
                  placeholder="https://dox.example.com"
                  spellCheck={false}
                  autoFocus
                  required
                />
              </label>
              {error ? <p className="error">{error}</p> : null}
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? "Connecting…" : "Connect"}
              </button>
            </form>
          ) : (
            <form onSubmit={submit} className="stack">
              {probe.hasUsers ? (
                <div className="tabs" role="tablist">
                  {(["login", "register"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      role="tab"
                      aria-selected={mode === kind}
                      onClick={() => setMode(kind)}
                    >
                      {kind === "login" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>
              ) : null}

              <label className="field">
                <span>Username</span>
                <input
                  id="auth-username"
                  name="username"
                  value={userName}
                  onChange={(event) => setUserName(event.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                  autoFocus
                  required
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={
                    registering ? "new-password" : "current-password"
                  }
                  required
                />
              </label>
              {registering ? (
                <label className="field">
                  <span>Confirm password</span>
                  <input
                    id="auth-confirm"
                    name="confirm"
                    type="password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </label>
              ) : null}
              {needsInvite ? (
                <label className="field">
                  <span>Invite code</span>
                  <input
                    id="auth-invite"
                    name="invite"
                    value={invite}
                    onChange={(event) => setInvite(event.target.value)}
                    placeholder="8 characters"
                    spellCheck={false}
                    required
                  />
                </label>
              ) : null}
              {firstRun ? (
                <label className="field">
                  <span>Server name (optional)</span>
                  <input
                    id="auth-server-name"
                    name="serverName"
                    value={serverName}
                    onChange={(event) => setServerName(event.target.value)}
                    placeholder="Alice's Dox"
                  />
                </label>
              ) : null}

              {error ? <p className="error">{error}</p> : null}

              <button className="btn primary" type="submit" disabled={busy}>
                {busy
                  ? "Working…"
                  : registering
                    ? firstRun
                      ? "Create owner account"
                      : "Create account"
                    : "Sign in"}
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => {
                  setProbe(null);
                  setError("");
                }}
              >
                Use a different server
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
