import { Box, Text, useInput, useWindowSize } from "ink";

import { color, icon } from "../../../theme";
import { VERSION } from "../../../../version";
import { Footer } from "../../layout/Footer";

interface HelpViewProps {
  onClose: () => void;
}

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
  ["n", "reminders"],
  ["r", "refresh"],
  ["start/end", "meeting window (editor)"],
];
const app: ReadonlyArray<readonly [string, string]> = [
  ["s", "open settings"],
  ["A", "about dox"],
  ["?", "toggle this help"],
  ["q / Ctrl+C", "quit"],
  ["esc", "close / cancel"],
  ["dox todo move", "reorder from the shell"],
];

export function HelpView({ onClose }: HelpViewProps) {
  const { columns: cols, rows: totalRows } = useWindowSize();

  useInput((input, key) => {
    if (input === "?" || key.escape || key.return) onClose();
  });

  const cardWidth = Math.min(86, Math.max(60, cols - 4));
  const cardRows = 20;
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
            {icon.brand} Keyboard shortcuts
          </Text>
          <Box marginTop={1}>
            {}
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
