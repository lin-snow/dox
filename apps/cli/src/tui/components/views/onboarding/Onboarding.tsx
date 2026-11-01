import { Box, Text, useInput } from "ink";
import { Spinner, TextInput } from "@inkjs/ui";
import { useEffect, useState } from "react";
import os from "node:os";

import {
  type Config,
  type ServerInfo,
  fetchServerInfo,
  login,
  register,
  saveConfig,
} from "@dox/core";

import { color, icon } from "../../../theme";
import { ErrorAlert } from "../../primitives/ErrorAlert";
import { Panel } from "../../primitives/Panel";
import { SectionHeader } from "../../primitives/SectionHeader";
import { Stepper } from "../../primitives/Stepper";

type Stage =
  | "server"
  | "probing"
  | "choose-branch"
  | "enter-invite"
  | "enter-username"
  | "enter-password"
  | "confirm-password"
  | "enter-server-name"
  | "enter-server-description"
  | "submitting";

type Intent = "first-user" | "login" | "register";

export type OnboardingReason = "fresh" | "reauth";

const DEFAULT_SERVER = "http://localhost:6278";
const STEPS = ["Server", "Method", "Account", "Password"] as const;
const MIN_PASSWORD_LEN = 8;

interface OnboardingProps {
  reason?: OnboardingReason;
  onDone: (config: Config) => void;
}

export function Onboarding({ reason = "fresh", onDone }: OnboardingProps) {
  const [stage, setStage] = useState<Stage>("server");
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [userName, setUserName] = useState(os.userInfo().username || "");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [serverName, setServerName] = useState("");
  const [serverDesc, setServerDesc] = useState("");
  const [intent, setIntent] = useState<Intent>("login");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stage !== "probing") return;
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchServerInfo(server);
        if (cancelled) return;
        setInfo(result);
        if (!result.hasUsers) {
          setIntent("first-user");
          setStage("enter-username");
        } else {
          setStage("choose-branch");
        }
      } catch (err) {
        if (cancelled) return;
        setError(`Couldn't reach the server: ${(err as Error).message}`);
        setStage("server");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stage, server]);

  useEffect(() => {
    if (stage !== "submitting") return;
    let cancelled = false;
    (async () => {
      try {
        let result;
        if (intent === "login") {
          result = await login(server, { userName, password });
        } else {
          result = await register(server, {
            userName,
            password,
            inviteCode: inviteCode || undefined,
            serverName:
              intent === "first-user" && serverName ? serverName : undefined,
            serverDescription:
              intent === "first-user" && serverDesc ? serverDesc : undefined,
          });
        }
        const cfg: Config = {
          server,
          token: result.token,
          userId: result.userId,
          userName: result.userName,
          role: result.role,
        };
        await saveConfig(cfg);
        if (!cancelled) onDone(cfg);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setStage(intent === "login" ? "enter-password" : "confirm-password");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    stage,
    intent,
    server,
    userName,
    password,
    inviteCode,
    serverName,
    serverDesc,
    onDone,
  ]);

  useInput(
    (input) => {
      setError(null);
      if (input === "1") {
        setIntent("login");
        setStage("enter-username");
      } else if (input === "2") {
        setIntent("register");
        if (info && !info.registrationOpen) {
          setStage("enter-invite");
        } else {
          setStage("enter-username");
        }
      }
    },
    { isActive: stage === "choose-branch" },
  );

  const submitServer = (raw: string) => {
    const url = raw.trim() || DEFAULT_SERVER;
    setError(null);
    setServer(url);
    setStage("probing");
  };

  const submitInvite = (raw: string) => {
    setError(null);
    setInviteCode(raw.trim());
    setStage("enter-username");
  };

  const submitUserName = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setError(null);
    setUserName(trimmed);
    setStage("enter-password");
  };

  const submitPassword = (raw: string) => {
    if (intent === "login") {
      if (!raw) return;
      setError(null);
      setPassword(raw);
      setStage("submitting");
      return;
    }
    if (raw.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    setError(null);
    setPassword(raw);
    setStage("confirm-password");
  };

  const submitConfirmPassword = (raw: string) => {
    if (raw !== password) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    if (intent === "first-user") {
      setStage("enter-server-name");
    } else {
      setStage("submitting");
    }
  };

  const submitServerName = (raw: string) => {
    setError(null);
    setServerName(raw.trim());
    setStage("enter-server-description");
  };

  const submitServerDesc = (raw: string) => {
    setError(null);
    setServerDesc(raw.trim());
    setStage("submitting");
  };

  const stepIndex = stepIndexFor(stage);

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text bold color={color.brand}>
          {icon.brand} dox
        </Text>
        <Text color={color.muted}>
          {"   "}
          {reason === "reauth"
            ? "Your saved login was rejected. Let's reconnect."
            : "Welcome. Let's get you connected."}
        </Text>
      </Box>

      <Box marginTop={1} marginBottom={1}>
        <Stepper steps={STEPS as unknown as string[]} activeIndex={stepIndex} />
      </Box>

      <ContextStrip
        server={stage !== "server" ? server : undefined}
        info={stage !== "server" && stage !== "probing" ? info : null}
        inviteCode={
          intent === "register" && inviteCode ? inviteCode : undefined
        }
        userName={
          stage === "enter-password" ||
          stage === "confirm-password" ||
          stage === "enter-server-name" ||
          stage === "enter-server-description" ||
          stage === "submitting"
            ? userName
            : undefined
        }
      />

      <Box flexDirection="column" marginTop={1} width={64}>
        <SectionHeader title={panelTitle(stage, intent)} />
        <Panel focused paddingY={1} width={64}>
          {stage === "server" && (
            <Box flexDirection="column">
              <Text color={color.muted}>Where does your dox server live?</Text>
              <Box marginTop={1}>
                <Text color={color.muted}>{">  "}</Text>
                <TextInput
                  defaultValue={server}
                  placeholder={DEFAULT_SERVER}
                  onSubmit={submitServer}
                />
              </Box>
            </Box>
          )}

          {stage === "probing" && (
            <Spinner label={`Connecting to ${server}…`} />
          )}

          {stage === "choose-branch" && (
            <Box flexDirection="column">
              <Text color={color.muted}>How would you like to connect?</Text>
              <Box flexDirection="column" marginTop={1}>
                <Box>
                  <Text color={color.accent} bold>
                    {"  1  "}
                  </Text>
                  <Text>Log in to an existing account on this server</Text>
                </Box>
                <Box>
                  <Text color={color.accent} bold>
                    {"  2  "}
                  </Text>
                  <Text>Create a new account </Text>
                  <Text color={color.muted}>
                    {info && info.registrationOpen
                      ? "(open — no invite needed)"
                      : "(invite code required)"}
                  </Text>
                </Box>
              </Box>
              <Box marginTop={1}>
                <Text color={color.muted}>Press 1 or 2.</Text>
              </Box>
            </Box>
          )}

          {stage === "enter-invite" && (
            <Box flexDirection="column">
              <Text color={color.muted}>Paste your invite code.</Text>
              <Box marginTop={1}>
                <Text color={color.muted}>{">  "}</Text>
                <TextInput placeholder="ABCD-EFGH" onSubmit={submitInvite} />
              </Box>
            </Box>
          )}

          {stage === "enter-username" && (
            <Box flexDirection="column">
              <Text color={color.muted}>
                {intent === "login" ? "Your username." : "Pick a username."}
              </Text>
              <Box marginTop={1}>
                <Text color={color.muted}>{">  "}</Text>
                <TextInput defaultValue={userName} onSubmit={submitUserName} />
              </Box>
            </Box>
          )}

          {stage === "enter-password" && (
            <Box flexDirection="column">
              <Text color={color.muted}>
                {intent === "login"
                  ? "Your password."
                  : `Pick a password (at least ${MIN_PASSWORD_LEN} characters).`}
              </Text>
              <Box marginTop={1}>
                <Text color={color.muted}>{">  "}</Text>
                <TextInput placeholder="••••••••" onSubmit={submitPassword} />
              </Box>
            </Box>
          )}

          {stage === "confirm-password" && (
            <Box flexDirection="column">
              <Text color={color.muted}>Confirm your password.</Text>
              <Box marginTop={1}>
                <Text color={color.muted}>{">  "}</Text>
                <TextInput
                  placeholder="••••••••"
                  onSubmit={submitConfirmPassword}
                />
              </Box>
            </Box>
          )}

          {stage === "enter-server-name" && (
            <Box flexDirection="column">
              <Text color={color.muted}>
                Give this server a display name.{" "}
                <Text dimColor>(Leave blank to skip.)</Text>
              </Text>
              <Box marginTop={1}>
                <Text color={color.muted}>{">  "}</Text>
                <TextInput
                  placeholder="Alice's Dox"
                  onSubmit={submitServerName}
                />
              </Box>
            </Box>
          )}

          {stage === "enter-server-description" && (
            <Box flexDirection="column">
              <Text color={color.muted}>
                Add a one-line description.{" "}
                <Text dimColor>(Leave blank to skip.)</Text>
              </Text>
              <Box marginTop={1}>
                <Text color={color.muted}>{">  "}</Text>
                <TextInput
                  placeholder="family todos"
                  onSubmit={submitServerDesc}
                />
              </Box>
            </Box>
          )}

          {stage === "submitting" && (
            <Spinner
              label={intent === "login" ? "logging in…" : "creating account…"}
            />
          )}
        </Panel>
      </Box>

      {error && <ErrorAlert message={error} />}

      <Box marginTop={1} paddingX={1}>
        <Text color={color.muted}>
          <Text color={color.accent}>Ctrl+C</Text> cancel
        </Text>
      </Box>
    </Box>
  );
}

function panelTitle(stage: Stage, intent: Intent): string {
  switch (stage) {
    case "server":
    case "probing":
      return "Connect to server";
    case "choose-branch":
      return "Choose your path";
    case "enter-invite":
      return "Invite code";
    case "enter-username":
      return intent === "login" ? "Username" : "Pick a username";
    case "enter-password":
      return intent === "login" ? "Password" : "Pick a password";
    case "confirm-password":
      return "Confirm password";
    case "enter-server-name":
      return "Server name (optional)";
    case "enter-server-description":
      return "Description (optional)";
    case "submitting":
      return intent === "login" ? "Logging in" : "Creating account";
  }
}

function stepIndexFor(stage: Stage): number {
  switch (stage) {
    case "server":
    case "probing":
      return 0;
    case "choose-branch":
    case "enter-invite":
      return 1;
    case "enter-username":
      return 2;
    case "enter-password":
    case "confirm-password":
    case "enter-server-name":
    case "enter-server-description":
    case "submitting":
      return 3;
  }
}

interface ContextStripProps {
  server?: string;
  info: ServerInfo | null;
  inviteCode?: string;
  userName?: string;
}

function ContextStrip({
  server,
  info,
  inviteCode,
  userName,
}: ContextStripProps) {
  const chips: { label: string; value: string; tone?: string }[] = [];
  if (server) chips.push({ label: "server", value: server });
  if (info) {
    if (!info.hasUsers) {
      chips.push({
        label: "mode",
        value: "first user → owner",
        tone: color.accent2,
      });
    } else {
      const identity = info.serverName
        ? `${info.serverName}${info.ownerName ? ` · by ${info.ownerName}` : ""}`
        : info.ownerName
          ? `by ${info.ownerName}`
          : "(unnamed server)";
      chips.push({ label: "joining", value: identity, tone: color.accent2 });
      chips.push({
        label: "registration",
        value: info.registrationOpen ? "open" : "invite-only",
      });
    }
  }
  if (inviteCode) chips.push({ label: "invite", value: inviteCode });
  if (userName) chips.push({ label: "user", value: userName });
  if (chips.length === 0) return null;
  return (
    <Box flexDirection="column">
      {chips.map((c) => (
        <Box key={c.label}>
          <Text color={color.success}> {icon.done} </Text>
          <Text color={color.muted}>{c.label}: </Text>
          <Text color={c.tone ?? undefined}>{c.value}</Text>
        </Box>
      ))}
    </Box>
  );
}
