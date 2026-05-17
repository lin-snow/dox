import { Box, Text } from "ink";

import { color, icon } from "../../theme";

interface StepperProps {
  steps: ReadonlyArray<string>;
  activeIndex: number;
}

// Horizontal "● ─── ◉ ─── ○" progress row with right-padded labels under each
// dot. Each cell is fixed-width so dots and labels line up regardless of label
// length.
const CELL_WIDTH = 11; // 1 dot + 4 link + 6 label + padding

export function Stepper({ steps, activeIndex }: StepperProps) {
  return (
    <Box flexDirection="column">
      <Box>
        {steps.map((_, idx) => {
          const state =
            idx < activeIndex
              ? "done"
              : idx === activeIndex
                ? "active"
                : "pending";
          const glyph =
            state === "done"
              ? icon.stepDone
              : state === "active"
                ? icon.stepActive
                : icon.stepPending;
          const dotColor =
            state === "done"
              ? color.success
              : state === "active"
                ? color.accent
                : color.muted;
          const linkColor = idx < activeIndex ? color.success : color.muted;
          return (
            <Box key={`d-${idx}`} width={CELL_WIDTH}>
              <Text color={dotColor}>{glyph}</Text>
              {idx < steps.length - 1 && (
                <Text color={linkColor}>
                  {" "}
                  {icon.stepLink}
                  {icon.stepLink}
                  {icon.stepLink}{" "}
                </Text>
              )}
            </Box>
          );
        })}
      </Box>
      <Box>
        {steps.map((label, idx) => {
          const state =
            idx < activeIndex
              ? "done"
              : idx === activeIndex
                ? "active"
                : "pending";
          const labelColor = state === "active" ? color.accent : color.muted;
          return (
            <Box key={`l-${idx}`} width={CELL_WIDTH}>
              <Text
                color={labelColor}
                bold={state === "active"}
                dimColor={state === "pending"}
              >
                {label}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
