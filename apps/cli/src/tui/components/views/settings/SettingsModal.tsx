import { Box, Text, useInput } from "ink";

import type { InviteClient, UserClient } from "@dox/core";
import { loadConfig, saveConfig } from "@dox/core";

import type { Action, SettingsEditing, State } from "../../../state";
import { color } from "../../../theme";
import { ConfirmDialog } from "../../primitives/ConfirmDialog";
import { SettingsFormModal } from "./SettingsFormModal";

interface SettingsModalProps {
  editing: SettingsEditing;
  state: State;
  dispatch: (a: Action) => void;
  users?: UserClient;
  invites?: InviteClient;
  onSignedOut?: () => void;
}

// Picks the correct modal kind for `editing` and wires it to the right async
// action on the user/invite clients. Lives in its own component so App.tsx
// doesn't grow another seven-branch ladder.
export function SettingsModal({
  editing,
  state,
  dispatch,
  users,
  invites,
  onSignedOut,
}: SettingsModalProps) {
  const cancel = () => dispatch({ type: "SETTINGS_EDIT", editing: null });

  // ── form modals ────────────────────────────────────────────────────────
  if (editing.kind === "serverName") {
    return (
      <SettingsFormModal
        title="Edit Server Name"
        help="Up to 64 chars. Shown on the login screen and dashboard header."
        fields={[
          {
            key: "name",
            label: "name",
            placeholder: "my dox server…",
            initial: state.settingsServer?.serverName ?? "",
          },
        ]}
        busy={state.settingsBusy}
        error={state.settingsError}
        onSubmit={async (vals) => {
          if (!users) return cancel();
          dispatch({ type: "SETTINGS_BUSY", busy: true });
          try {
            await users.updateSettings({ serverName: vals.name ?? "" });
            const next = await users.getSettings();
            dispatch({ type: "SETTINGS_BUSY", busy: false });
            dispatch({ type: "SETTINGS_SERVER_SET", settings: next });
            dispatch({ type: "SETTINGS_EDIT", editing: null });
          } catch (err) {
            dispatch({ type: "SETTINGS_ERROR", error: (err as Error).message });
          }
        }}
        onCancel={cancel}
      />
    );
  }

  if (editing.kind === "serverDescription") {
    return (
      <SettingsFormModal
        title="Edit Description"
        help="Up to 256 chars. Shown to anyone hitting /v1/auth/server-info."
        fields={[
          {
            key: "description",
            label: "description",
            placeholder: "a short blurb…",
            initial: state.settingsServer?.serverDescription ?? "",
          },
        ]}
        busy={state.settingsBusy}
        error={state.settingsError}
        onSubmit={async (vals) => {
          if (!users) return cancel();
          dispatch({ type: "SETTINGS_BUSY", busy: true });
          try {
            await users.updateSettings({ serverDescription: vals.description ?? "" });
            const next = await users.getSettings();
            dispatch({ type: "SETTINGS_BUSY", busy: false });
            dispatch({ type: "SETTINGS_SERVER_SET", settings: next });
            dispatch({ type: "SETTINGS_EDIT", editing: null });
          } catch (err) {
            dispatch({ type: "SETTINGS_ERROR", error: (err as Error).message });
          }
        }}
        onCancel={cancel}
      />
    );
  }

  if (editing.kind === "changePassword") {
    return (
      <SettingsFormModal
        title="Change Password"
        help="Enter your current password, then a new one (min 8 chars). Shown in cleartext — make sure nobody's looking."
        fields={[
          { key: "old", label: "current", placeholder: "current password" },
          { key: "new", label: "new", placeholder: "new password (8+ chars)" },
        ]}
        busy={state.settingsBusy}
        error={state.settingsError}
        onSubmit={async (vals) => {
          if (!users) return cancel();
          if ((vals.new ?? "").length < 8) {
            dispatch({ type: "SETTINGS_ERROR", error: "new password must be at least 8 characters" });
            return;
          }
          dispatch({ type: "SETTINGS_BUSY", busy: true });
          try {
            await users.changePassword(vals.old ?? "", vals.new ?? "");
            dispatch({ type: "SETTINGS_BUSY", busy: false });
            dispatch({ type: "SETTINGS_EDIT", editing: null });
          } catch (err) {
            dispatch({ type: "SETTINGS_ERROR", error: (err as Error).message });
          }
        }}
        onCancel={cancel}
      />
    );
  }

  if (editing.kind === "redeemCode") {
    return (
      <SettingsFormModal
        title="Redeem Invite Code"
        help="Paste a project invite code someone shared with you."
        submitLabel="redeem"
        fields={[{ key: "code", label: "code", placeholder: "ABC-12345" }]}
        busy={state.settingsBusy}
        error={state.settingsError}
        onSubmit={async (vals) => {
          if (!invites) return cancel();
          dispatch({ type: "SETTINGS_BUSY", busy: true });
          try {
            await invites.accept(vals.code ?? "");
            dispatch({ type: "SETTINGS_BUSY", busy: false });
            dispatch({ type: "SETTINGS_EDIT", editing: null });
            // Accepting an invite doesn't change *my outgoing* list. The new
            // project becomes visible on the next refresh poll (≤ 30s) — no
            // need to force a refetch here.
          } catch (err) {
            dispatch({ type: "SETTINGS_ERROR", error: (err as Error).message });
          }
        }}
        onCancel={cancel}
      />
    );
  }

  // ── confirm dialogs ────────────────────────────────────────────────────
  if (editing.kind === "registrationToggle") {
    const next = editing.next;
    return (
      <ConfirmAction
        title={next ? "Open Registration" : "Close Registration"}
        message={
          next
            ? "Anyone with the server URL will be able to register a new account. Continue?"
            : "Registration will require a server invite issued by you. Existing users keep access. Continue?"
        }
        tone={next ? color.accent2 : color.accent}
        busy={state.settingsBusy}
        error={state.settingsError}
        onConfirm={async () => {
          if (!users) return cancel();
          dispatch({ type: "SETTINGS_BUSY", busy: true });
          try {
            await users.updateSettings({ registrationOpen: next });
            const updated = await users.getSettings();
            dispatch({ type: "SETTINGS_BUSY", busy: false });
            dispatch({ type: "SETTINGS_SERVER_SET", settings: updated });
            dispatch({ type: "SETTINGS_EDIT", editing: null });
          } catch (err) {
            dispatch({ type: "SETTINGS_ERROR", error: (err as Error).message });
          }
        }}
        onCancel={cancel}
      />
    );
  }

  if (editing.kind === "signOut") {
    return (
      <ConfirmAction
        title="Sign Out"
        message="Clears the local token. Server URL stays. Re-login required to use this client."
        tone={color.danger}
        busy={state.settingsBusy}
        error={state.settingsError}
        onConfirm={async () => {
          dispatch({ type: "SETTINGS_BUSY", busy: true });
          try {
            const cfg = await loadConfig();
            if (cfg) {
              await saveConfig({
                ...cfg,
                token: "",
                userId: "",
                userName: "",
                role: "",
              });
            }
            dispatch({ type: "SETTINGS_BUSY", busy: false });
            dispatch({ type: "CLOSE_SETTINGS" });
            onSignedOut?.();
          } catch (err) {
            dispatch({ type: "SETTINGS_ERROR", error: (err as Error).message });
          }
        }}
        onCancel={cancel}
      />
    );
  }

  if (editing.kind === "revokeInvite") {
    const inv = state.settingsOutgoing.find((i) => i.codeHash === editing.codeHash);
    const label = inv
      ? inv.projectId
        ? `${inv.projectName || "(deleted project)"} · ${inv.role || "editor"}`
        : "Server invite"
      : "this invite";
    return (
      <ConfirmAction
        title="Revoke Invite"
        message={`Revoke "${label}"? The code becomes invalid immediately.`}
        tone={color.danger}
        busy={state.settingsBusy}
        error={state.settingsError}
        onConfirm={async () => {
          if (!invites) return cancel();
          dispatch({ type: "SETTINGS_BUSY", busy: true });
          try {
            await invites.revoke(editing.codeHash);
            const list = await invites.listOutgoing();
            dispatch({ type: "SETTINGS_BUSY", busy: false });
            dispatch({ type: "SETTINGS_OUTGOING_SET", invites: list });
            dispatch({ type: "SETTINGS_EDIT", editing: null });
          } catch (err) {
            dispatch({ type: "SETTINGS_ERROR", error: (err as Error).message });
          }
        }}
        onCancel={cancel}
      />
    );
  }

  return null;
}

// ConfirmDialog is presentational only — this wrapper owns the keys (y/n/esc)
// + threads error/busy through ConfirmDialog's message slot.
function ConfirmAction({
  title,
  message,
  tone,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  tone: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useInput((input, key) => {
    if (key.escape || input === "n" || input === "N") {
      if (!busy) onCancel();
      return;
    }
    if (input === "y" || input === "Y") {
      if (!busy) onConfirm();
    }
  });

  const body = (
    <>
      <Text wrap="wrap">{message}</Text>
      {error && (
        <Box marginTop={1}>
          <Text color={color.danger} wrap="wrap">
            {error}
          </Text>
        </Box>
      )}
      {busy && (
        <Box marginTop={1}>
          <Text color={color.muted}>working…</Text>
        </Box>
      )}
    </>
  );

  return <ConfirmDialog title={title} tone={tone} message={body} footerMode={title.toLowerCase()} />;
}
