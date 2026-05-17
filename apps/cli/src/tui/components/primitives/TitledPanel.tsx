import { Box, Text } from "ink";
import type { ReactNode } from "react";

import { color } from "../../theme";

interface TitledPanelProps {
  title: string;
  // Fixed width is required: we have to draw the top border by hand to inline
  // the title, and that means knowing exactly how many cells the row spans.
  width: number;
  focused?: boolean;
  // Override the resting border color (when not focused). Useful for accent
  // panels that should pop without claiming focus.
  borderTint?: string;
  paddingX?: number;
  paddingY?: number;
  height?: number;
  children: ReactNode;
}

// SurgeDM-style panel: title floats in the top border at the right inset,
// e.g. `╭───────────────── Server ──╮`. Built by composing the top border as a
// Text row, then using Ink's per-side border flags to draw the remaining three
// sides on the content Box below.
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
  const borderColor = focused ? color.accent : borderTint ?? color.muted;
  const titleColor = focused ? color.accent : color.accent2;

  // Layout inside the top border (excluding the two corner glyphs):
  //   leadDashes   " title "   trailDashes
  // `trailDashes` is small (2-3) for the SurgeDM-style "inset from right" look.
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
