import { Box, Text } from "ink";

import { color, icon } from "../../theme";

export type TabKind = "system" | "project";

interface Tab {
  key: string;
  label: string;
  count?: number;
  kind?: TabKind;
  prefixIcon?: string;
  prefixColor?: string;
}

interface TabsProps {
  tabs: Tab[];
  activeKey: string;
}

export function Tabs({ tabs, activeKey }: TabsProps) {
  const firstProjectIdx = tabs.findIndex((t) => t.kind === "project");

  return (
    <Box>
      {tabs.map((t, idx) => {
        const active = t.key === activeKey;
        const tint = active ? color.accent : color.muted;
        const label = t.count !== undefined ? `${t.label} ${t.count}` : t.label;
        const showDivider = idx === firstProjectIdx && idx > 0;
        return (
          <Box key={t.key} marginRight={idx < tabs.length - 1 ? 2 : 0}>
            {showDivider && (
              <>
                <Text color={color.muted}>│</Text>
                <Text>{"  "}</Text>
              </>
            )}
            <Text color={active ? color.accent : color.muted}>
              {active ? icon.selectBar : " "}
            </Text>
            {t.prefixIcon && (
              <>
                <Text color={t.prefixColor ?? tint}>{t.prefixIcon}</Text>
                <Text> </Text>
              </>
            )}
            <Text color={tint} bold={active}>
              {label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
