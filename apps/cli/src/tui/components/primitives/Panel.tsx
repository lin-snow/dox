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
  // Override the resting border color (when not focused). Useful for stats /
  // help panels that should pop even without focus.
  borderTint?: string;
  children: ReactNode;
}

// Rounded bordered container. The container only owns the chrome — section
// titles live OUTSIDE in <SectionHeader />, matching the SurgeDM pattern where
// every panel is labeled by an inline-dash header above it.
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
