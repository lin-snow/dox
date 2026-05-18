import { Box, Text, useInput } from "ink";

import { useTerminalSize } from "../../../hooks";
import { color, icon } from "../../../theme";
import { VERSION } from "../../../../version";
import { Footer } from "../../layout/Footer";

interface HelpViewProps {
  onClose: () => void;
}

// Standalone keybindings page. Mirrors AboutView's centered-card layout — the
// content sits in a bordered card pushed to the visual middle of the terminal,
// with the Footer pinned below for consistent chrome across overlay-style pages.
const navigate: ReadonlyArray<readonly [string, string]> = [
  ["j / ↓", "move down"],
  ["k / ↑", "move up"],
  ["h / l", "switch sidebar ↔ list"],
  ["tab", "next filter"],
  ["g / G", "first / last"],
];

const act: ReadonlyArray<readonly [string, string]> = [
  ["space", "toggle done"],
  ["i / a", "add todo"],
  ["e", "edit todo"],
  ["d", "delete todo"],
  ["p", "new project"],
  ["m", "manage project"],
  ["D", "delete project"],
  ["/", "search todos"],
  ["r", "refresh"],
];

const app: ReadonlyArray<readonly [string, string]> = [
  ["s", "open settings"],
  ["A", "about dox"],
  ["?", "toggle this help"],
  ["q / Ctrl+C", "quit"],
  ["esc", "close / cancel"],
];

export function HelpView({ onClose }: HelpViewProps) {
  const { cols, rows: totalRows } = useTerminalSize();

  useInput((input, key) => {
    if (input === "?" || key.escape || key.return) onClose();
  });

  // Width grows with the terminal but caps at 86 so the card stays card-like
  // on ultra-wide screens. Min 60 keeps the two-column body legible.
  const cardWidth = Math.min(86, Math.max(60, cols - 4));
  // Approx card height: title (1) + spacer (1) + tallest column (Act = 11)
  // + paddingY top/bottom (2) + border top/bottom (2). Used only to derive
  // topPad — the actual height is content-driven.
  const cardRows = 17;
  const topPad = Math.max(1, Math.floor((totalRows - cardRows - 3) / 2));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box height={topPad} />
      <Box justifyContent="center">
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={color.accent}
          paddingX={2}
          paddingY={1}
          width={cardWidth}
        >
          <Text bold color={color.accent}>
            {icon.brand} keybindings
          </Text>
          <Box marginTop={1}>
            {/* Left column stacks Navigate + App so the right column (the
                largest section by row count) sets the card's height. */}
            <Box flexDirection="column" flexGrow={1} flexBasis={0}>
              <Section title="Navigate" rows={navigate} />
              <Section title="App" rows={app} marginTop />
            </Box>
            <Box width={2} />
            <Box flexDirection="column" flexGrow={1} flexBasis={0}>
              <Section title="Act" rows={act} />
            </Box>
          </Box>
        </Box>
      </Box>
      <Footer
        mode="help"
        version={VERSION}
        outerPadX={1}
        hints={[
          ["?", "back"],
          ["esc", "back"],
          ["⏎", "back"],
        ]}
      />
    </Box>
  );
}

function Section({
  title,
  rows,
  marginTop = false,
}: {
  title: string;
  rows: ReadonlyArray<readonly [string, string]>;
  marginTop?: boolean;
}) {
  return (
    <Box flexDirection="column" marginTop={marginTop ? 1 : 0}>
      <Text color={color.muted}>{title.toUpperCase()}</Text>
      {rows.map(([k, l]) => (
        <Box key={k}>
          <Box width={14}>
            <Text color={color.accent}> {k}</Text>
          </Box>
          <Text wrap="truncate">{l}</Text>
        </Box>
      ))}
    </Box>
  );
}
