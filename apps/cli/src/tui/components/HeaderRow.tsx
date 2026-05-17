import { Box, Text } from "ink";

import { color, icon } from "../theme";
import { Logo } from "./Logo";

interface HeaderRowProps {
  userName?: string;
  server?: string;
  total: number;
  done: number;
  syncing?: boolean;
}

// Top-of-screen identity strip: logo on the left, identity + live stats on the
// right. Matches SurgeDM's "logo + 'Serving at…' + activity" pattern.
export function HeaderRow({ userName, server, total, done, syncing }: HeaderRowProps) {
  return (
    <Box paddingX={1} marginBottom={1}>
      <Logo />
      <Box flexDirection="column" marginLeft={2} justifyContent="center">
        <Box>
          <Text color={color.success}>{icon.on}</Text>
          <Text color={color.muted}>
            {"  "}
            connected
          </Text>
          {syncing && (
            <Text color={color.accent2}>
              {"   "}
              {icon.spinner} syncing
            </Text>
          )}
        </Box>
        {(userName || server) && (
          <Box>
            <Text color={color.muted}>  </Text>
            {userName && <Text color={color.accent2}>{userName}</Text>}
            {userName && server && <Text color={color.muted}>{` ${icon.dot} `}</Text>}
            {server && <Text color={color.muted}>{server}</Text>}
          </Box>
        )}
        <Box>
          <Text color={color.muted}>  </Text>
          <Text color={color.accent}>{total}</Text>
          <Text color={color.muted}> todos</Text>
          <Text color={color.muted}>{` ${icon.dot} `}</Text>
          <Text color={color.success}>{done}</Text>
          <Text color={color.muted}> done</Text>
        </Box>
      </Box>
    </Box>
  );
}
