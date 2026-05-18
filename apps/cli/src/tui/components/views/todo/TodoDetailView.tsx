import { Box, Text, useInput } from "ink";

import type { Project, Todo } from "@dox/core";

import { useTerminalSize } from "../../../hooks";
import { color, icon } from "../../../theme";
import { relativeTime, swatchColor } from "../../../util";
import { VERSION } from "../../../../version";
import { Footer } from "../../layout/Footer";
import { Markdown, MarkdownEmpty } from "../../primitives/Markdown";
import { TitledPanel } from "../../primitives/TitledPanel";

interface TodoDetailViewProps {
  todo: Todo;
  project: Project | null;
  ownerName?: string;
  nowMs: number;
  onClose: () => void;
  onToggleDone: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

// Centered Todo detail page. A TitledPanel sized as a card (capped width +
// height) holds structured sections; a key-hint Footer pins the bottom. Hosts
// the long-form description once the server returns it; falls back to a muted
// placeholder so the section is always present for layout consistency.
export function TodoDetailView({
  todo,
  project,
  ownerName,
  nowMs,
  onClose,
  onToggleDone,
  onEdit,
  onDelete,
}: TodoDetailViewProps) {
  const { cols, rows } = useTerminalSize();
  // Card dimensions: wide enough for the two-column metadata grid + a
  // comfortable description column, but capped so the layout reads as a
  // focused page rather than a full-screen surface.
  const panelWidth = Math.min(96, Math.max(60, cols - 4));
  const panelHeight = Math.min(28, Math.max(16, rows - 6));
  // Push the card toward the visual middle; subtract ~3 rows for the footer.
  const topPad = Math.max(1, Math.floor((rows - panelHeight - 3) / 2));

  useInput((input, key) => {
    if (key.escape) return onClose();
    if (input === " ") return onToggleDone();
    if (input === "e") return onEdit();
    if (input === "d") return onDelete();
  });

  const statusIcon = todo.done ? icon.done : icon.open;
  const statusColor = todo.done ? color.success : color.accent;
  const statusLabel = todo.done ? "Done" : "Open";

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box height={topPad} />
      <Box justifyContent="center">
        <TitledPanel
          title="Todo"
          width={panelWidth}
          height={panelHeight}
          paddingX={2}
          paddingY={1}
          focused
        >
          {/* Status pill + short ID — same shape as TodoInfo but with more breathing room. */}
          <Box>
            <Box borderStyle="round" borderColor={statusColor} paddingX={2}>
              <Text color={statusColor} bold>
                {statusIcon} {statusLabel}
              </Text>
            </Box>
            <Box flexGrow={1} />
            <Box alignItems="center">
              <Text color={color.muted}>{todo.id.toLowerCase()}</Text>
            </Box>
          </Box>

          {/* Title — full width, bold accent. */}
          <Box marginTop={1}>
            <Text color={color.accent} bold wrap="truncate">
              {todo.title}
            </Text>
          </Box>

          {/* Two-column metadata grid. */}
          <Box marginTop={1}>
            <Box
              flexDirection="column"
              width={Math.floor((panelWidth - 8) / 2)}
            >
              <MetaRow label="Project">
                {project ? (
                  <Text>
                    <Text color={swatchColor(project.color)}>● </Text>
                    <Text>{project.name}</Text>
                  </Text>
                ) : (
                  <Text color={color.muted} dimColor>
                    ● inbox
                  </Text>
                )}
              </MetaRow>
              <MetaRow label="Created by">
                <Text color={color.accent2}>
                  {ownerName ?? todo.createdBy.toLowerCase()}
                </Text>
              </MetaRow>
            </Box>
            <Box flexDirection="column" flexGrow={1}>
              <MetaRow label="Created">
                <Text>{relativeTime(nowMs, todo.createdAt)} ago</Text>
              </MetaRow>
              <MetaRow label="Updated">
                <Text>{relativeTime(nowMs, todo.updatedAt)} ago</Text>
              </MetaRow>
            </Box>
          </Box>

          {/* Description section — placeholder when missing so the section header
            always renders, making the field's eventual arrival a no-op visually. */}
          <Box marginTop={1}>
            <Text color={color.muted}>
              {"─".repeat(Math.max(10, panelWidth - 6))}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text bold color={color.muted}>
              DESCRIPTION
            </Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            {todo.description ? (
              <Markdown source={todo.description} width={panelWidth - 6} />
            ) : (
              <MarkdownEmpty hint="no description — press 'e' to add one" />
            )}
          </Box>
        </TitledPanel>
      </Box>

      <Footer
        mode="detail"
        version={VERSION}
        outerPadX={1}
        hints={[
          ["␣", "toggle"],
          ["e", "edit"],
          ["d", "delete"],
          ["esc", "back"],
        ]}
      />
    </Box>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Box width={12}>
        <Text color={color.muted}>{label}</Text>
      </Box>
      {children}
    </Box>
  );
}
