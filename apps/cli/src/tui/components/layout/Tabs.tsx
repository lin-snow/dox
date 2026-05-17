import { Box, Text } from "ink";

import { color, icon } from "../../theme";

export type TabKind = "system" | "project";

interface Tab {
  key: string;
  label: string;
  count?: number;
  // `system` tabs (Private, Done) get a uniform 1-cell prefix (◆) and a
  // muted │ divider before the first project tab. `project` tabs supply their
  // own prefix glyph via `prefixIcon` (colored swatch). Defaults to "system"
  // when omitted so existing call sites stay valid.
  kind?: TabKind;
  // 1-cell glyph rendered before the label, tinted with `prefixColor` (or
  // the active/muted tint when no override is given).
  prefixIcon?: string;
  prefixColor?: string;
}

interface TabsProps {
  tabs: Tab[];
  activeKey: string;
}

// Borderless inline tab strip: `▎◆ Private 3   ◆ Done 12   │   ● Family 8 …`.
//
// Tried boxed tabs first (SurgeDM style) but with 6+ tabs the row overflows
// most terminals and each tab gets squeezed into a 4-row pill — labels wrap
// vertically. Inline chips with a selection bar on the active tab keep the
// whole strip single-line at any practical width.
//
// A `│` divider (muted) is inserted at the first system→project transition so
// users can see at a glance that the "system" tabs (Private, Done) are not
// just two more projects.
export function Tabs({ tabs, activeKey }: TabsProps) {
  // Compute index of the first project tab, if any, so we can render the
  // divider in front of it. We treat undefined `kind` as "system" for
  // backwards-compatibility with any existing call sites.
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
