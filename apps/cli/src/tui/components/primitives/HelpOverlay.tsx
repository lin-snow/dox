import { Box, Text } from "ink";

import { color, icon } from "../../theme";

const sections: { title: string; rows: ReadonlyArray<readonly [string, string]> }[] = [
  {
    title: "Navigate",
    rows: [
      ["j / ↓", "move down"],
      ["k / ↑", "move up"],
      ["h / l", "switch sidebar ↔ list"],
      ["tab", "next filter"],
      ["g / G", "first / last"],
    ],
  },
  {
    title: "Act",
    rows: [
      ["space", "toggle done"],
      ["i / a", "add todo"],
      ["e", "edit todo"],
      ["d", "delete todo"],
      ["p", "new project"],
      ["m", "manage project / invite"],
      ["D", "delete project"],
      ["/", "search todos"],
      ["r", "refresh"],
    ],
  },
  {
    title: "App",
    rows: [
      ["s", "open settings"],
      ["A", "about dox"],
      ["?", "toggle this help"],
      ["q / Ctrl+C", "quit"],
      ["esc", "close overlay / cancel"],
    ],
  },
];

export function HelpOverlay() {
  return (
    <Box justifyContent="center" marginTop={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={color.accent}
        paddingX={2}
        paddingY={1}
        width={64}
      >
        <Text bold color={color.accent}>
          {icon.brand} keybindings
        </Text>
        {sections.map((s) => (
          <Box key={s.title} flexDirection="column" marginTop={1}>
            <Text color={color.muted}>{s.title.toUpperCase()}</Text>
            {s.rows.map(([k, l]) => (
              <Box key={k}>
                <Box width={16}>
                  <Text color={color.accent}>  {k}</Text>
                </Box>
                <Text>{l}</Text>
              </Box>
            ))}
          </Box>
        ))}
        <Box marginTop={1}>
          <Text color={color.muted}>press ? or esc to close</Text>
        </Box>
      </Box>
    </Box>
  );
}
