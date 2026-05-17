import type { ReactNode } from "react";

import type { OutgoingInvite, ServerSettings } from "@dox/core";

import type { SettingsTabKey } from "./state";

// One row in a settings tab. `value` is the short right-aligned summary shown
// next to the label in the list. `detail` is the longer right-panel content
// when this row is the active one. `enterAction` / `secondaryAction` plug in
// what ↵ and `r` do on the row.
export interface SettingsRow {
  key: string;
  label: string;
  // Short, single-line summary rendered inline (right-aligned). Optional.
  value?: string;
  // Right pane content when this row is selected. Defaults to a short blurb if
  // omitted.
  detail?: ReactNode;
  // Triggered by ⏎. Null/undefined = read-only row.
  onEnter?: () => void;
  // Optional non-Enter binding, e.g. `r` to revoke an invite.
  secondary?: { key: string; label: string; action: () => void };
  // Render the value muted/dim — used for "(coming soon)" or "—".
  muted?: boolean;
}

export interface SettingsTabSpec {
  key: SettingsTabKey;
  label: string;
  // Short blurb above the list. Optional.
  hint?: string;
  rows: SettingsRow[];
  // Footer hint chips for this tab.
  hints?: ReadonlyArray<readonly [string, string]>;
}

export interface BuildSettingsArgs {
  identity: { userName?: string; server?: string; role?: string };
  server: ServerSettings | null;
  serverLoaded: boolean;
  outgoing: OutgoingInvite[];
  outgoingLoaded: boolean;
  // Dispatchers — wired up in App.tsx. Each opens a modal or kicks off an
  // async action.
  on: {
    editServerName: () => void;
    editServerDescription: () => void;
    toggleRegistration: (next: boolean) => void;
    changePassword: () => void;
    signOut: () => void;
    redeemCode: () => void;
    revokeInvite: (codeHash: string) => void;
  };
}

const isOwner = (role?: string) => role === "owner";

function fmtExpiry(expiresAtMs: string): string {
  const ms = Number(expiresAtMs);
  if (!Number.isFinite(ms)) return "—";
  const delta = ms - Date.now();
  if (delta <= 0) return "expired";
  const hours = Math.floor(delta / 3_600_000);
  if (hours >= 24) return `expires in ${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `expires in ${hours}h`;
  const mins = Math.max(1, Math.floor(delta / 60_000));
  return `expires in ${mins}m`;
}

function inviteSummary(inv: OutgoingInvite): string {
  if (!inv.projectId) return "Server invite";
  const name = inv.projectName || "(deleted project)";
  return `${name} · ${inv.role || "editor"}`;
}

export function buildServerTab(args: BuildSettingsArgs): SettingsTabSpec {
  const owner = isOwner(args.identity.role);
  const s = args.server;
  const rows: SettingsRow[] = [
    {
      key: "name",
      label: "Server Name",
      value: s?.serverName || (args.serverLoaded ? "(unset)" : "loading…"),
      detail: "Display name shown on the login screen and in the dashboard header.",
      onEnter: owner ? args.on.editServerName : undefined,
      muted: !s?.serverName,
    },
    {
      key: "description",
      label: "Description",
      value: s?.serverDescription || (args.serverLoaded ? "(unset)" : "loading…"),
      detail: "Short blurb shown to anyone hitting /v1/auth/server-info — describes what this instance is for.",
      onEnter: owner ? args.on.editServerDescription : undefined,
      muted: !s?.serverDescription,
    },
  ];
  if (owner) {
    rows.push({
      key: "registration",
      label: "Open Registration",
      value: s ? (s.registrationOpen ? "true" : "false") : "loading…",
      detail:
        "When on, anyone with the server URL can register an account. When off, registration requires a server invite issued by you.",
      onEnter: s ? () => args.on.toggleRegistration(!s.registrationOpen) : undefined,
    });
  }
  return {
    key: "server",
    label: "Server",
    hint: owner ? "Instance metadata. You're the owner." : "Read-only — only the server owner can change these.",
    rows,
    hints: owner
      ? [
          ["⏎", "edit"],
          ["1/2/3", "tab"],
          ["esc", "close"],
        ]
      : [
          ["1/2/3", "tab"],
          ["esc", "close"],
        ],
  };
}

export function buildAccountTab(args: BuildSettingsArgs): SettingsTabSpec {
  const rows: SettingsRow[] = [
    {
      key: "user",
      label: "Logged-in User",
      value: args.identity.userName || "—",
      detail: "The identity bound to the JWT in your local config. Cannot be changed in place — sign out and log in as someone else.",
    },
    {
      key: "server-url",
      label: "Server URL",
      value: args.identity.server || "—",
      detail: "Base URL of the dox server this client talks to. Set via `dox login --server …`.",
    },
    {
      key: "role",
      label: "Role",
      value: args.identity.role || "—",
      detail: "Server-level role. `owner` can edit server settings and issue server invites; `member` cannot.",
    },
    {
      key: "change-password",
      label: "Change Password…",
      detail: "Replace your password. You'll be prompted for the current one and a new one (min 8 chars).",
      onEnter: args.on.changePassword,
    },
    {
      key: "sign-out",
      label: "Sign Out",
      detail: "Clears the token in ~/.config/dox/config.toml and exits. Re-run `dox` to log in again.",
      onEnter: args.on.signOut,
    },
  ];
  return {
    key: "account",
    label: "Account",
    rows,
    hints: [
      ["⏎", "activate"],
      ["1/2/3", "tab"],
      ["esc", "close"],
    ],
  };
}

export function buildInvitesTab(args: BuildSettingsArgs): SettingsTabSpec {
  const inviteRows: SettingsRow[] = args.outgoing.map((inv) => ({
    key: `inv-${inv.codeHash}`,
    label: inviteSummary(inv),
    value: fmtExpiry(inv.expiresAt),
    detail: inv.projectId
      ? `Project invite for ${inv.projectName || "(deleted project)"} — role ${inv.role || "editor"}. ${fmtExpiry(inv.expiresAt)}. Press r to revoke.`
      : `Server invite — anyone with the code can register a new account. ${fmtExpiry(inv.expiresAt)}. Press r to revoke.`,
    secondary: { key: "r", label: "revoke", action: () => args.on.revokeInvite(inv.codeHash) },
  }));
  const rows: SettingsRow[] = [
    ...inviteRows,
    {
      key: "redeem",
      label: "Redeem code…",
      detail: "Paste a project invite code someone shared with you to join their project.",
      onEnter: args.on.redeemCode,
    },
  ];
  return {
    key: "invites",
    label: "Invites",
    hint: args.outgoingLoaded
      ? args.outgoing.length === 0
        ? "No outgoing invites. Issue one from a project's manage view (Phase 2)."
        : `${args.outgoing.length} outgoing invite${args.outgoing.length === 1 ? "" : "s"}.`
      : "Loading invites…",
    rows,
    hints: [
      ["⏎", "redeem"],
      ["r", "revoke"],
      ["1/2/3", "tab"],
      ["esc", "close"],
    ],
  };
}

export function buildSettingsTabs(args: BuildSettingsArgs): SettingsTabSpec[] {
  return [buildServerTab(args), buildAccountTab(args), buildInvitesTab(args)];
}
