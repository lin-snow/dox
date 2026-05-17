import { Box, Text, useInput } from "ink";
import { Spinner, TextInput } from "@inkjs/ui";
import { useEffect, useState } from "react";
import os from "node:os";

import {
  type Config,
  type ServerInfo,
  fetchServerInfo,
  redeemPairingCode,
  register,
  saveConfig,
} from "@dox/core";

import { color, icon } from "../theme";
import { ErrorAlert } from "./ErrorAlert";
import { Panel } from "./Panel";
import { SectionHeader } from "./SectionHeader";
import { Stepper } from "./Stepper";

type Stage =
  | "server"
  | "probing"
  | "choose-branch"
  | "enter-invite"
  | "enter-username"
  | "enter-device"
  | "pair-code"
  | "submitting";

type Intent = "register" | "pair";

// "fresh" = no config on disk; "reauth" = config existed but its token was
// rejected by the server (device revoked, DB rotated, etc.). Surfaced as a
// different welcome line so the user knows why they're seeing this screen.
export type OnboardingReason = "fresh" | "reauth";

const DEFAULT_SERVER = "http://localhost:8080";
const STEPS = ["Server", "Method", "You", "Device"] as const;

interface OnboardingProps {
  reason?: OnboardingReason;
  onDone: (config: Config) => void;
}

export function Onboarding({ reason = "fresh", onDone }: OnboardingProps) {
  const [stage, setStage] = useState<Stage>("server");
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [userName, setUserName] = useState(os.userInfo().username || "");
  const [deviceName, setDeviceName] = useState(os.hostname() || "");
  const [inviteCode, setInviteCode] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [intent, setIntent] = useState<Intent>("register");
  const [error, setError] = useState<string | null>(null);

  // Probe the server when transitioning into "probing".
  useEffect(() => {
    if (stage !== "probing") return;
    let cancelled = false;
    (async () => {
      try {
        const result = await fetchServerInfo(server);
        if (cancelled) return;
        setInfo(result);
        if (!result.hasUsers || result.registrationOpen) {
          setIntent("register");
          setInviteCode("");
          setStage("enter-username");
        } else {
          setStage("choose-branch");
        }
      } catch (err) {
        if (cancelled) return;
        setError(`couldn't reach server: ${(err as Error).message}`);
        setStage("server");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stage, server]);

  // Issue the final register / redeem call when transitioning into "submitting".
  useEffect(() => {
    if (stage !== "submitting") return;
    let cancelled = false;
    (async () => {
      try {
        if (intent === "register") {
          const res = await register(server, {
            userName,
            deviceName,
            inviteCode: inviteCode || undefined,
          });
          const cfg: Config = {
            server,
            token: res.token,
            userId: res.userId,
            userName: res.userName,
            role: res.role,
            deviceId: res.deviceId,
          };
          await saveConfig(cfg);
          if (!cancelled) onDone(cfg);
        } else {
          const res = await redeemPairingCode(server, pairCode);
          const cfg: Config = {
            server,
            token: res.token,
            userId: res.userId,
            userName: res.userName,
            // Role unknown until /me; left blank locally, server stays authoritative.
            role: "",
            deviceId: res.deviceId,
          };
          await saveConfig(cfg);
          if (!cancelled) onDone(cfg);
        }
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setStage(intent === "register" ? "enter-device" : "pair-code");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stage, intent, server, userName, deviceName, inviteCode, pairCode, onDone]);

  // Branch picker — numeric keys; native useInput is simpler than a Select for two options.
  useInput(
    (input) => {
      setError(null);
      if (input === "1") {
        setIntent("register");
        setStage("enter-invite");
      } else if (input === "2") {
        setIntent("pair");
        setStage("pair-code");
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
    setStage("enter-device");
  };

  const submitDeviceName = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setError(null);
    setDeviceName(trimmed);
    setStage("submitting");
  };

  const submitPairCode = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setError(null);
    setPairCode(trimmed);
    setStage("submitting");
  };

  const stepIndex = stepIndexFor(stage, intent);

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text bold color={color.brand}>
          {icon.brand} dox
        </Text>
        <Text color={color.muted}>
          {"   "}
          {reason === "reauth"
            ? "your saved login was rejected — let's reconnect."
            : "welcome — let's get you connected."}
        </Text>
      </Box>

      <Box marginTop={1} marginBottom={1}>
        <Stepper steps={STEPS as unknown as string[]} activeIndex={stepIndex} />
      </Box>

      {/* Confirmed-so-far context, rendered as compact chips */}
      <ContextStrip
        server={stage !== "server" ? server : undefined}
        info={stage !== "server" && stage !== "probing" ? info : null}
        inviteCode={intent === "register" && inviteCode ? inviteCode : undefined}
        userName={
          intent === "register" && (stage === "enter-device" || stage === "submitting")
            ? userName
            : undefined
        }
      />

      <Box flexDirection="column" marginTop={1} width={64}>
        <SectionHeader title={panelTitle(stage, intent)} />
        <Panel focused paddingY={1} width={64}>
          {stage === "server" && (
            <Box flexDirection="column">
              <Text color={color.muted}>where does your dox server live?</Text>
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
            <Spinner label={`connecting to ${server}…`} />
          )}

          {stage === "choose-branch" && (
            <Box flexDirection="column">
              <Text color={color.muted}>how would you like to connect?</Text>
              <Box flexDirection="column" marginTop={1}>
                <Box>
                  <Text color={color.accent} bold>
                    {"  1  "}
                  </Text>
                  <Text>create a new account </Text>
                  <Text color={color.muted}>(you have an invite code)</Text>
                </Box>
                <Box>
                  <Text color={color.accent} bold>
                    {"  2  "}
                  </Text>
                  <Text>add this device to my account </Text>
                  <Text color={color.muted}>(pairing code)</Text>
                </Box>
              </Box>
              <Box marginTop={1}>
                <Text color={color.muted}>press 1 or 2</Text>
              </Box>
            </Box>
          )}

          {stage === "enter-invite" && (
            <Box flexDirection="column">
              <Text color={color.muted}>paste your invite code</Text>
              <Box marginTop={1}>
                <Text color={color.muted}>{">  "}</Text>
                <TextInput placeholder="ABCD-EFGH" onSubmit={submitInvite} />
              </Box>
            </Box>
          )}

          {stage === "enter-username" && (
            <Box flexDirection="column">
              <Text color={color.muted}>pick a username</Text>
              <Box marginTop={1}>
                <Text color={color.muted}>{">  "}</Text>
                <TextInput defaultValue={userName} onSubmit={submitUserName} />
              </Box>
            </Box>
          )}

          {stage === "enter-device" && (
            <Box flexDirection="column">
              <Text color={color.muted}>name this device</Text>
              <Box marginTop={1}>
                <Text color={color.muted}>{">  "}</Text>
                <TextInput defaultValue={deviceName} onSubmit={submitDeviceName} />
              </Box>
            </Box>
          )}

          {stage === "pair-code" && (
            <Box flexDirection="column">
              <Text color={color.muted}>
                run{" "}
                <Text color={color.accent}>dox device pair --name &lt;name&gt;</Text>{" "}
                on a logged-in device, then paste the code:
              </Text>
              <Box marginTop={1}>
                <Text color={color.muted}>{">  "}</Text>
                <TextInput placeholder="ABCD-EFGH" onSubmit={submitPairCode} />
              </Box>
            </Box>
          )}

          {stage === "submitting" && (
            <Spinner label={intent === "register" ? "creating account…" : "pairing device…"} />
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
      return "Username";
    case "enter-device":
      return "Device name";
    case "pair-code":
      return "Pairing code";
    case "submitting":
      return intent === "register" ? "Creating account" : "Pairing device";
  }
}

function stepIndexFor(stage: Stage, intent: Intent): number {
  // Maps internal stages onto the 4-dot stepper. Method step collapses for the
  // bootstrap / open-registration path where it's auto-selected.
  switch (stage) {
    case "server":
    case "probing":
      return 0;
    case "choose-branch":
    case "enter-invite":
    case "pair-code":
      return 1;
    case "enter-username":
      return 2;
    case "enter-device":
      return 3;
    case "submitting":
      return intent === "register" ? 3 : 1;
  }
}

interface ContextStripProps {
  server?: string;
  info: ServerInfo | null;
  inviteCode?: string;
  userName?: string;
}

function ContextStrip({ server, info, inviteCode, userName }: ContextStripProps) {
  const chips: { label: string; value: string; tone?: string }[] = [];
  if (server) chips.push({ label: "server", value: server });
  if (info) {
    if (!info.hasUsers) chips.push({ label: "mode", value: "first user → owner", tone: color.accent2 });
    else if (info.registrationOpen) chips.push({ label: "mode", value: "open" });
    else chips.push({ label: "mode", value: "invite-only" });
  }
  if (inviteCode) chips.push({ label: "invite", value: inviteCode });
  if (userName) chips.push({ label: "user", value: userName });
  if (chips.length === 0) return null;
  return (
    <Box flexDirection="column">
      {chips.map((c) => (
        <Box key={c.label}>
          <Text color={color.success}>  {icon.done} </Text>
          <Text color={color.muted}>{c.label}: </Text>
          <Text color={c.tone ?? undefined}>{c.value}</Text>
        </Box>
      ))}
    </Box>
  );
}
