import { Box, Text } from "ink";

import { color, icon } from "../theme";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeKey: string;
}

// Borderless inline tab strip: `▎Inbox 3   All 10   Done 4 …`.
//
// Tried boxed tabs first (SurgeDM style) but with 6+ tabs the row overflows
// most terminals and each tab gets squeezed into a 4-row pill — labels wrap
// vertically. Inline chips with a selection bar on the active tab keep the
// whole strip single-line at any practical width.
export function Tabs({ tabs, activeKey }: TabsProps) {
  return (
    <Box>
      {tabs.map((t, idx) => {
        const active = t.key === activeKey;
        const tint = active ? color.accent : color.muted;
        const label = t.count !== undefined ? `${t.label} ${t.count}` : t.label;
        return (
          <Box key={t.key} marginRight={idx < tabs.length - 1 ? 2 : 0}>
            <Text color={active ? color.accent : color.muted}>
              {active ? icon.selectBar : " "}
            </Text>
            <Text color={tint} bold={active}>
              {label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
