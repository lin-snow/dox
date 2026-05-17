import { Box, Text, useInput } from "ink";
import { Alert, Spinner, TextInput } from "@inkjs/ui";
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

  const showServerContext = stage !== "server";
  const showRegistrationContext = info && stage !== "server" && stage !== "probing";
  const showUserNameContext =
    intent === "register" && (stage === "enter-device" || stage === "submitting");
  const showInviteContext =
    intent === "register" &&
    inviteCode &&
    (stage === "enter-username" || stage === "enter-device" || stage === "submitting");

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        dox
      </Text>
      <Text dimColor>
        {reason === "reauth"
          ? "Your saved login was rejected — let's reconnect."
          : "Welcome — let's get you connected."}
      </Text>

      {/* Confirmed-so-far context */}
      <Box flexDirection="column" marginTop={1}>
        {showServerContext && (
          <Text dimColor>
            Server <Text color="green">✓</Text> {server}
          </Text>
        )}
        {showRegistrationContext && info && (
          <Text dimColor>
            {!info.hasUsers
              ? "✨ Empty server — you'll become the owner."
              : info.registrationOpen
                ? "Open registration is enabled."
                : "Invite required (server is private)."}
          </Text>
        )}
        {showInviteContext && (
          <Text dimColor>
            Invite <Text color="green">✓</Text> {inviteCode}
          </Text>
        )}
        {showUserNameContext && (
          <Text dimColor>
            Username <Text color="green">✓</Text> {userName}
          </Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {stage === "server" && (
          <Box flexDirection="column">
            <Text>Server URL</Text>
            <TextInput
              defaultValue={server}
              placeholder={DEFAULT_SERVER}
              onSubmit={submitServer}
            />
          </Box>
        )}

        {stage === "probing" && <Spinner label={`Connecting to ${server}…`} />}

        {stage === "choose-branch" && (
          <Box flexDirection="column">
            <Text>How would you like to connect?</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text>
                <Text color="cyan">1</Text> Create a new account (you have an invite code)
              </Text>
              <Text>
                <Text color="cyan">2</Text> Add this device to my existing account (pairing code)
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>press 1 or 2</Text>
            </Box>
          </Box>
        )}

        {stage === "enter-invite" && (
          <Box flexDirection="column">
            <Text>Invite code</Text>
            <TextInput placeholder="ABCD-EFGH" onSubmit={submitInvite} />
          </Box>
        )}

        {stage === "enter-username" && (
          <Box flexDirection="column">
            <Text>Pick a username</Text>
            <TextInput defaultValue={userName} onSubmit={submitUserName} />
          </Box>
        )}

        {stage === "enter-device" && (
          <Box flexDirection="column">
            <Text>Name this device</Text>
            <TextInput defaultValue={deviceName} onSubmit={submitDeviceName} />
          </Box>
        )}

        {stage === "pair-code" && (
          <Box flexDirection="column">
            <Text>Pairing code</Text>
            <Text dimColor>
              run <Text color="cyan">dox device pair --name &lt;name&gt;</Text> on a logged-in device
            </Text>
            <TextInput placeholder="ABCD-EFGH" onSubmit={submitPairCode} />
          </Box>
        )}

        {stage === "submitting" && (
          <Spinner label={intent === "register" ? "Creating account…" : "Pairing device…"} />
        )}
      </Box>

      {error && (
        <Box marginTop={1}>
          <Alert variant="error">{error}</Alert>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Ctrl+C to cancel</Text>
      </Box>
    </Box>
  );
}
