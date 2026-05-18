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
  // Short verb shown in the tip strip after `⏎`, e.g. "edit" / "toggle" /
  // "sign out". Defaults to "open" when onEnter is set but this is empty.
  enterLabel?: string;
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
      detail:
        "A friendly name for this server. Shows up on the welcome screen.",
      onEnter: owner ? args.on.editServerName : undefined,
      enterLabel: "edit",
      muted: !s?.serverName,
    },
    {
      key: "description",
      label: "Description",
      value:
        s?.serverDescription || (args.serverLoaded ? "(unset)" : "loading…"),
      detail:
        "A short blurb about this server, so new members know what they're joining.",
      onEnter: owner ? args.on.editServerDescription : undefined,
      enterLabel: "edit",
      muted: !s?.serverDescription,
    },
  ];
  if (owner) {
    rows.push({
      key: "registration",
      label: "Open Registration",
      value: s ? (s.registrationOpen ? "true" : "false") : "loading…",
      detail:
        "When on, anyone with the server address can sign up. When off, new people need an invite from you.",
      onEnter: s
        ? () => args.on.toggleRegistration(!s.registrationOpen)
        : undefined,
      enterLabel: "toggle",
    });
  }
  return {
    key: "server",
    label: "Server",
    hint: owner
      ? "Server info and settings. You're the owner."
      : "View only — only the owner can change these.",
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
      detail:
        "The account you're signed in as. To use a different one, sign out and log in again.",
    },
    {
      key: "server-url",
      label: "Server URL",
      value: args.identity.server || "—",
      detail: "The dox server this app is connected to.",
    },
    {
      key: "role",
      label: "Role",
      value: args.identity.role || "—",
      detail:
        "Owners can change server settings and invite new people. Members can't.",
    },
    {
      key: "change-password",
      label: "Change Password…",
      detail:
        "Set a new password. You'll need your current one and a new one (at least 8 characters).",
      onEnter: args.on.changePassword,
      enterLabel: "change",
    },
    {
      key: "sign-out",
      label: "Sign Out",
      detail:
        "Sign out on this device. Your account stays — log back in any time to keep using dox.",
      onEnter: args.on.signOut,
      enterLabel: "sign out",
    },
  ];
  return {
    key: "account",
    label: "Account",
    rows,
    hints: [
      ["⏎", "open"],
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
      ? `Invite to join ${inv.projectName || "(deleted project)"} as ${inv.role || "editor"}. ${fmtExpiry(inv.expiresAt)}.`
      : `Sign-up invite — anyone with this code can create an account on this server. ${fmtExpiry(inv.expiresAt)}.`,
    secondary: {
      key: "r",
      label: "revoke",
      action: () => args.on.revokeInvite(inv.codeHash),
    },
  }));
  const rows: SettingsRow[] = [
    ...inviteRows,
    {
      key: "redeem",
      label: "Redeem code…",
      detail: "Paste an invite code someone shared to join their project.",
      onEnter: args.on.redeemCode,
      enterLabel: "redeem",
    },
  ];
  return {
    key: "invites",
    label: "Invites",
    hint: args.outgoingLoaded
      ? args.outgoing.length === 0
        ? "You haven't shared any invites yet. Create one from a project's page."
        : `${args.outgoing.length} active invite${args.outgoing.length === 1 ? "" : "s"}.`
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
