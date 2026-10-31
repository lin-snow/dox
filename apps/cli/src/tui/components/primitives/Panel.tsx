import { Box } from "ink";
import type { ReactNode } from "react";

import { color } from "../../theme";

interface PanelProps {
  focused?: boolean;
  flexGrow?: number;
  width?: number | string;
  minHeight?: number;
  paddingX?: number;
  paddingY?: number;
  borderTint?: string;
  children: ReactNode;
}

export function Panel({
  focused = false,
  flexGrow,
  width,
  minHeight,
  paddingX = 1,
  paddingY = 0,
  borderTint,
  children,
}: PanelProps) {
  const borderColor = focused ? color.accent : (borderTint ?? color.muted);
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={paddingX}
      paddingY={paddingY}
      flexGrow={flexGrow}
      width={width}
      minHeight={minHeight}
    >
      {children}
    </Box>
  );
}
