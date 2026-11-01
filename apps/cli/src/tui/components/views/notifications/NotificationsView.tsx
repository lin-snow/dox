import { Box, Text, useInput, useWindowSize } from "ink";

import type { Project, Reminder } from "@dox/core";
import { elapsedLabel } from "@dox/core";

import { color, icon } from "../../../theme";
import { VERSION } from "../../../../version";
import { Footer } from "../../layout/Footer";
import { TitledPanel } from "../../primitives/TitledPanel";
import { swatchColor } from "../../../util";

interface NotificationsViewProps {
  reminders: Reminder[];
  projects: Project[];
  nowMs: number;
  onClose: () => void;
}

export function NotificationsView({
  reminders,
  projects,
  nowMs,
  onClose,
}: NotificationsViewProps) {
  const { columns: cols, rows } = useWindowSize();
  const panelWidth = Math.min(96, Math.max(60, cols - 4));
  const panelHeight = Math.min(26, Math.max(14, rows - 4));

  useInput((input, key) => {
    if (key.escape || input === "n" || input === "q") onClose();
  });

  const projectById = new Map(projects.map((p) => [p.id, p]));
  // Header + column labels + footer line.
  const visible = reminders.slice(0, Math.max(3, panelHeight - 8));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box justifyContent="center">
        <TitledPanel
          title="Reminders"
          width={panelWidth}
          height={panelHeight}
          paddingX={2}
          paddingY={1}
          focused
          borderTint={color.warn}
        >
          <Box>
            <Text color={color.muted} dimColor>
              {reminders.length === 0
                ? "No reminders yet"
                : `${reminders.length} recent`}
            </Text>
            <Box flexGrow={1} />
            <Text color={color.muted} dimColor>
              marked read on open
            </Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            {visible.length === 0 ? (
              <Text color={color.muted} dimColor>
                {"  "}reminders appear here at their due or remind time
              </Text>
            ) : (
              visible.map((r) => {
                const project = r.projectId
                  ? projectById.get(r.projectId)
                  : undefined;
                const when = elapsedLabel(Number(r.scheduledFor), nowMs);
                const unread = r.readAt === undefined;
                return (
                  <Box key={r.id}>
                    <Text color={unread ? color.accent : color.muted}>
                      {unread ? icon.on : icon.dot}
                    </Text>
                    <Text> </Text>
                    <Box width={8} justifyContent="flex-end">
                      <Text color={color.warn}>
                        {when === "now" ? "now" : `${when} ago`}
                      </Text>
                    </Box>
                    <Text> </Text>
                    <Text
                      color={
                        project?.color
                          ? swatchColor(project.color)
                          : color.muted
                      }
                    >
                      {project ? "● " : "  "}
                    </Text>
                    <Box flexGrow={1} flexShrink={1} overflow="hidden">
                      <Text wrap="truncate" bold={unread}>
                        {r.todoTitle}
                      </Text>
                    </Box>
                  </Box>
                );
              })
            )}
          </Box>

          {reminders.length > visible.length && (
            <Box marginTop={1}>
              <Text color={color.muted} dimColor>
                {`${reminders.length - visible.length} older reminders not shown`}
              </Text>
            </Box>
          )}
        </TitledPanel>
      </Box>

      <Footer
        mode="reminders"
        version={VERSION}
        outerPadX={1}
        hints={[
          ["esc", "back"],
          ["n", "close"],
        ]}
      />
    </Box>
  );
}
