import { Box, Text, useStdout } from "ink";
import type { ReactNode } from "react";

import { color, icon } from "../../theme";
import { VERSION } from "../../../version";
import { Footer } from "../layout/Footer";
import { TitledPanel } from "./TitledPanel";

interface ConfirmDialogProps {
  title: string;
  // Body content. Plain string renders as one paragraph; pass a node for
  // richer layouts (multiline, mixed colors).
  message: ReactNode;
  // Tint of the title border and the destructive-action hint. Defaults to red
  // for delete-style flows; pass a softer color for benign confirmations.
  tone?: string;
  confirmKey?: string;
  cancelKey?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Footer label shown in the mode pill. Defaults to "confirm".
  footerMode?: string;
}

// Full-screen centered confirmation dialog. Mirrors TodoEditorView /
// ProjectEditorView so the modal swap feels native. Parent owns the key
// handling — this component is presentational only.
export function ConfirmDialog({
  title,
  message,
  tone = color.danger,
  confirmKey = "y",
  cancelKey = "n",
  confirmLabel = "Yes",
  cancelLabel = "No",
  footerMode = "confirm",
}: ConfirmDialogProps) {
  const { stdout } = useStdout();
  const cols = Math.max(40, stdout?.columns ?? 100);
  const rows = Math.max(10, stdout?.rows ?? 30);
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
          title={title}
          width={cardWidth}
          paddingX={2}
          paddingY={1}
          borderTint={tone}
        >
          <Box>
            <Text color={tone} bold>{`${icon.brand}  `}</Text>
            {typeof message === "string" ? (
              <Box flexGrow={1}>
                <Text wrap="wrap">{message}</Text>
              </Box>
            ) : (
              <Box flexDirection="column" flexGrow={1}>
                {message}
              </Box>
            )}
          </Box>
          <Box marginTop={1} justifyContent="center">
            <Text color={tone} bold>{`[${confirmKey}]`}</Text>
            <Text color={color.muted}>{` ${confirmLabel}    `}</Text>
            <Text color={color.accent2} bold>{`[${cancelKey}]`}</Text>
            <Text color={color.muted}>{` ${cancelLabel}`}</Text>
          </Box>
        </TitledPanel>
      </Box>
      <Footer
        mode={footerMode}
        version={VERSION}
        outerPadX={1}
        hints={[
          [confirmKey, confirmLabel.toLowerCase()],
          [cancelKey, cancelLabel.toLowerCase()],
          ["esc", "cancel"],
        ]}
      />
    </Box>
  );
}
