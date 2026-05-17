import { Box, Text, useInput, useStdout } from "ink";

import type { Project, ProjectMember } from "@dox/core";

import type { ManageEditing } from "../../../state";
import { color, icon } from "../../../theme";
import { relativeTime, swatchColor } from "../../../util";
import { VERSION } from "../../../../version";
import { Footer } from "../../layout/Footer";
import { TitledPanel } from "../../primitives/TitledPanel";

interface ProjectManageViewProps {
  project: Project | null;
  members: ProjectMember[];
  membersLoaded: boolean;
  editing: ManageEditing | null;
  busy: boolean;
  error: string | null;
  nowMs: number;
  // True if the current viewer owns the project. Drives whether the invite
  // action is offered.
  isOwner: boolean;
  onClose: () => void;
  onOpenInvitePicker: () => void;
  onPickInviteRole: (role: "editor" | "viewer") => void;
  onDismissModal: () => void;
}

// Per-project management screen. Shows the project's members + (for the
// owner) lets you mint a new invite. The "Invite user to project" action
// the user asked for lives here rather than in Settings.
export function ProjectManageView({
  project,
  members,
  membersLoaded,
  editing,
  busy,
  error,
  nowMs,
  isOwner,
  onClose,
  onOpenInvitePicker,
  onPickInviteRole,
  onDismissModal,
}: ProjectManageViewProps) {
  const { stdout } = useStdout();
  const cols = Math.max(60, stdout?.columns ?? 100);
  const rows = Math.max(20, stdout?.rows ?? 30);
  // Centered card sized like ProjectEditorView — wide enough for member rows
  // (~72 cols), with breathing room from the terminal edges.
  const cardWidth = Math.min(72, cols - 8);

  useInput((input, key) => {
    if (editing) {
      if (editing.kind === "invitePicker") {
        if (key.escape) return onDismissModal();
        if (input === "e" || input === "E") return onPickInviteRole("editor");
        if (input === "v" || input === "V") return onPickInviteRole("viewer");
      } else if (editing.kind === "codeReveal") {
        // Any key dismisses the reveal.
        onDismissModal();
      }
      return;
    }
    if (key.escape || input === "q") return onClose();
    if ((input === "i" || input === "I") && isOwner)
      return onOpenInvitePicker();
  });

  if (!project) {
    return (
      <Box flexDirection="column" paddingX={1} height={rows - 1}>
        <Box
          flexGrow={1}
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
        >
          <TitledPanel
            title="Project"
            width={cardWidth}
            paddingX={2}
            paddingY={1}
            focused
          >
            <Text color={color.muted}>project not found</Text>
          </TitledPanel>
        </Box>
        <Footer
          mode="manage"
          version={VERSION}
          outerPadX={1}
          hints={[["esc", "back"]]}
        />
      </Box>
    );
  }

  if (editing?.kind === "invitePicker") {
    return <InvitePickerModal busy={busy} error={error} />;
  }
  if (editing?.kind === "codeReveal") {
    return (
      <CodeRevealModal
        code={editing.code}
        role={editing.role}
        expiresAt={editing.expiresAt}
        projectName={project.name}
        nowMs={nowMs}
      />
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} height={rows - 1}>
      <Box
        flexGrow={1}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <TitledPanel
          title={`Project · ${project.name}`}
          width={cardWidth}
          paddingX={2}
          paddingY={1}
          focused
          borderTint={swatchColor(project.color)}
        >
          <Header
            project={project}
            memberCount={members.length}
            membersLoaded={membersLoaded}
          />

          <Box marginTop={1} flexDirection="column">
            <Text color={color.muted}>Members</Text>
            <Box marginTop={1} flexDirection="column">
              {!membersLoaded ? (
                <Text color={color.muted} dimColor>
                  loading…
                </Text>
              ) : members.length === 0 ? (
                <Text color={color.muted} dimColor>
                  (just you)
                </Text>
              ) : (
                members.map((m) => (
                  <MemberRow key={m.userId} m={m} nowMs={nowMs} />
                ))
              )}
            </Box>
          </Box>

          {isOwner && (
            <Box marginTop={1}>
              <Text color={color.muted}>
                Press{" "}
                <Text color={color.accent} bold>
                  i
                </Text>{" "}
                to invite a new user.
              </Text>
            </Box>
          )}
        </TitledPanel>
      </Box>
      <Footer
        mode="manage"
        version={VERSION}
        outerPadX={1}
        hints={
          isOwner
            ? [
                ["i", "invite"],
                ["esc", "back"],
              ]
            : [["esc", "back"]]
        }
      />
    </Box>
  );
}

function Header({
  project,
  memberCount,
  membersLoaded,
}: {
  project: Project;
  memberCount: number;
  membersLoaded: boolean;
}) {
  const tint = swatchColor(project.color);
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={tint} bold>
          {icon.on}{" "}
        </Text>
        <Text bold>{project.name}</Text>
        <Box marginLeft={2}>
          <Text color={color.muted}>
            {membersLoaded
              ? `${memberCount} member${memberCount === 1 ? "" : "s"}`
              : "—"}
          </Text>
        </Box>
      </Box>
      {project.description && (
        <Box marginTop={1}>
          <Text color={color.muted} wrap="wrap">
            {project.description}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function MemberRow({ m, nowMs }: { m: ProjectMember; nowMs: number }) {
  const roleTint = m.role === "editor" ? color.accent : color.accent2;
  const label = m.userName || m.userId;
  return (
    <Box>
      <Text>{`  ${label}`}</Text>
      <Box marginLeft={2}>
        <Text color={roleTint}>{m.role}</Text>
      </Box>
      <Box marginLeft={2}>
        <Text color={color.muted} dimColor>
          added {relativeTime(Number(m.addedAt), nowMs)}
        </Text>
      </Box>
    </Box>
  );
}

function InvitePickerModal({
  busy,
  error,
}: {
  busy: boolean;
  error: string | null;
}) {
  const { stdout } = useStdout();
  const cols = Math.max(60, stdout?.columns ?? 100);
  const rows = Math.max(15, stdout?.rows ?? 30);
  const cardWidth = Math.min(60, cols - 8);

  return (
    <Box flexDirection="column" paddingX={1} height={rows - 1}>
      <Box
        flexGrow={1}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <TitledPanel
          title="Invite User"
          width={cardWidth}
          paddingX={2}
          paddingY={1}
          focused
        >
          <Text wrap="wrap">
            Pick a role for the invitee. You'll get a code to share.
          </Text>
          <Box marginTop={1} justifyContent="center">
            <Text color={color.accent} bold>{`[e]`}</Text>
            <Text color={color.muted}>{` editor    `}</Text>
            <Text color={color.accent2} bold>{`[v]`}</Text>
            <Text color={color.muted}>{` viewer`}</Text>
          </Box>
          {error && (
            <Box marginTop={1}>
              <Text color={color.danger} wrap="wrap">
                {error}
              </Text>
            </Box>
          )}
          {busy && (
            <Box marginTop={1}>
              <Text color={color.muted}>creating invite…</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text color={color.muted}>esc to cancel</Text>
          </Box>
        </TitledPanel>
      </Box>
      <Footer
        mode="invite"
        version={VERSION}
        outerPadX={1}
        hints={[
          ["e", "editor"],
          ["v", "viewer"],
          ["esc", "cancel"],
        ]}
      />
    </Box>
  );
}

function CodeRevealModal({
  code,
  role,
  expiresAt,
  projectName,
  nowMs,
}: {
  code: string;
  role: string;
  expiresAt: string;
  projectName: string;
  nowMs: number;
}) {
  const { stdout } = useStdout();
  const cols = Math.max(60, stdout?.columns ?? 100);
  const rows = Math.max(15, stdout?.rows ?? 30);
  const cardWidth = Math.min(70, cols - 8);
  const expiresIn = relativeTime(Number(expiresAt), nowMs);

  return (
    <Box flexDirection="column" paddingX={1} height={rows - 1}>
      <Box
        flexGrow={1}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <TitledPanel
          title="Invite Code"
          width={cardWidth}
          paddingX={2}
          paddingY={1}
          focused
          borderTint={color.accent}
        >
          <Text wrap="wrap">
            New {role} invite for <Text bold>{projectName}</Text>. Share this
            code with the user you want to add.{" "}
            <Text color={color.danger} bold>
              You won't see it again.
            </Text>
          </Text>
          <Box marginTop={1} justifyContent="center">
            <Text color={color.accent} bold>
              {code}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={color.muted}>expires {expiresIn}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={color.muted}>press any key to close</Text>
          </Box>
        </TitledPanel>
      </Box>
      <Footer
        mode="invite"
        version={VERSION}
        outerPadX={1}
        hints={[["any", "close"]]}
      />
    </Box>
  );
}
