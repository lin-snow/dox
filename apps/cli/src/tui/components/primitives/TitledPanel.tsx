import { Box, Text } from "ink";
import type { ReactNode } from "react";

import { color } from "../../theme";

interface TitledPanelProps {
  title: string;
  width: number;
  focused?: boolean;
  borderTint?: string;
  paddingX?: number;
  paddingY?: number;
  height?: number;
  children: ReactNode;
}

export function TitledPanel({
  title,
  width,
  focused = false,
  borderTint,
  paddingX = 1,
  paddingY = 0,
  height,
  children,
}: TitledPanelProps) {
  const borderColor = focused ? color.accent : (borderTint ?? color.muted);
  const titleColor = focused ? color.accent : color.accent2;

  const trailDashes = 3;
  const inner = Math.max(2, width - 2);
  const titleStr = ` ${title} `;
  const leadDashes = Math.max(1, inner - titleStr.length - trailDashes);

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box>
        <Text>
          <Text color={borderColor}>{"╭"}</Text>
          <Text color={borderColor}>{"─".repeat(leadDashes)}</Text>
          <Text color={titleColor} bold>
            {titleStr}
          </Text>
          <Text color={borderColor}>{"─".repeat(trailDashes)}</Text>
          <Text color={borderColor}>{"╮"}</Text>
        </Text>
      </Box>
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="round"
        borderColor={borderColor}
        borderTop={false}
        paddingX={paddingX}
        paddingY={paddingY}
        width={width}
      >
        {children}
      </Box>
    </Box>
  );
}
