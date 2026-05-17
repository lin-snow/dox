import { Box, Text } from "ink";

import { color, icon } from "../../theme";

interface BrandBarProps {
  userName?: string;
  server?: string;
  project?: string;
  syncing?: boolean;
}

// Top-of-screen identity strip. Mirrors the "brand · context · status" pattern
// from claude-code / opencode.
export function BrandBar({ userName, server, project, syncing }: BrandBarProps) {
  return (
    <Box paddingX={1} marginBottom={1}>
      <Text bold color={color.brand}>
        {icon.brand} dox
      </Text>
      <Box flexGrow={1} />
      {project && (
        <Text color={color.muted}>
          <Text color={color.accent}>{icon.chevron}</Text> {project}
          {"  "}
        </Text>
      )}
      {userName && (
        <Text color={color.muted}>
          {userName}
          {server ? ` ${icon.dot} ` : ""}
        </Text>
      )}
      {server && <Text color={color.muted}>{server}</Text>}
      {syncing && (
        <Text color={color.accent}>
          {"  "}
          {icon.spinner} syncing
        </Text>
      )}
    </Box>
  );
}
