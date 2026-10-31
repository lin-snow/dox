import { Box, Text, useWindowSize } from "ink";
import type { ReactNode } from "react";

import { color, icon } from "../../theme";
import { VERSION } from "../../../version";
import { Footer } from "../layout/Footer";
import { TitledPanel } from "./TitledPanel";

interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  tone?: string;
  confirmKey?: string;
  cancelKey?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  footerMode?: string;
}

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
  const { columns, rows: windowRows } = useWindowSize();
  const cols = Math.max(40, columns);
  const rows = Math.max(10, windowRows);
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
