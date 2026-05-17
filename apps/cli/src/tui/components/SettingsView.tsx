import { Box, Text, useInput, useStdout } from "ink";

import { color } from "../theme";
import { Footer } from "./Footer";
import { TitledPanel } from "./TitledPanel";

export interface SettingItem {
  key: string;
  label: string;
  value: string;
  // One-paragraph description shown on the right of the panel when this row
  // is selected. The image's "Maximum concurrent connections per host (1-64)."
  // is the model.
  description: string;
}

export interface SettingsTab {
  key: string;
  label: string;
  items: SettingItem[];
}

interface SettingsViewProps {
  tabs: SettingsTab[];
  activeTabIndex: number;
  cursor: number;
  onTabChange: (next: number) => void;
  onCursorChange: (next: number) => void;
  onClose: () => void;
}

// Full-screen settings panel modeled on SurgeDM's screenshot. The whole screen
// is one "Settings" titled panel; inside, a tab strip on top, then a 2-column
// body (item list left, detail right), then the key-hint footer at bottom.
export function SettingsView({
  tabs,
  activeTabIndex,
  cursor,
  onTabChange,
  onCursorChange,
  onClose,
}: SettingsViewProps) {
  const { stdout } = useStdout();
  const cols = Math.max(80, stdout?.columns ?? 100);
  const rows = Math.max(20, stdout?.rows ?? 30);
  const panelWidth = cols - 2; // outer paddingX={1}
  const innerHeight = Math.max(15, rows - 4); // panel + footer + padding

  const activeTab = tabs[activeTabIndex];
  const items = activeTab?.items ?? [];
  const current = items[cursor] ?? null;

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.leftArrow || input === "h") {
      onTabChange((activeTabIndex - 1 + tabs.length) % tabs.length);
      return;
    }
    if (key.rightArrow || input === "l" || key.tab) {
      onTabChange((activeTabIndex + 1) % tabs.length);
      return;
    }
    if (input === "j" || key.downArrow) {
      onCursorChange(Math.min(items.length - 1, cursor + 1));
      return;
    }
    if (input === "k" || key.upArrow) {
      onCursorChange(Math.max(0, cursor - 1));
      return;
    }
    // Numeric tab jump: matches the image's `[1] General` style hint.
    const n = Number(input);
    if (Number.isInteger(n) && n >= 1 && n <= tabs.length) {
      onTabChange(n - 1);
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <TitledPanel title="Settings" width={panelWidth} paddingY={1} focused height={innerHeight}>
        <TabStrip tabs={tabs} activeIndex={activeTabIndex} />
        <Box marginTop={1} flexGrow={1}>
          <ItemList items={items} cursor={cursor} width={Math.floor(panelWidth * 0.28)} />
          <Box width={2} />
          <Detail item={current} />
        </Box>
      </TitledPanel>
      <Footer
        mode="settings"
        version="v0.0.0"
        outerPadX={1}
        hints={[
          ["←", "prev tab"],
          ["→", "next tab"],
          ["⏎", "edit"],
          ["r", "reset"],
          ["esc", "close"],
        ]}
      />
    </Box>
  );
}

function TabStrip({ tabs, activeIndex }: { tabs: SettingsTab[]; activeIndex: number }) {
  return (
    <Box justifyContent="center">
      {tabs.map((t, idx) => {
        const active = idx === activeIndex;
        const tint = active ? color.accent : color.muted;
        return (
          <Box key={t.key} marginRight={idx < tabs.length - 1 ? 1 : 0}>
            <Box borderStyle="round" borderColor={tint} paddingX={1}>
              <Text color={tint} bold={active}>
                {`[${idx + 1}] `}
                {t.label}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function ItemList({
  items,
  cursor,
  width,
}: {
  items: SettingItem[];
  cursor: number;
  width: number;
}) {
  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderColor={color.muted} paddingX={1} paddingY={1}>
      {items.length === 0 ? (
        <Text color={color.muted} dimColor>
          (no items)
        </Text>
      ) : (
        items.map((item, idx) => {
          const active = idx === cursor;
          return (
            <Box key={item.key}>
              <Text color={active ? color.accent : color.muted}>
                {active ? "• " : "  "}
              </Text>
              <Text color={active ? color.accent : undefined} bold={active} wrap="truncate">
                {item.label}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}

function Detail({ item }: { item: SettingItem | null }) {
  if (!item) {
    return (
      <Box flexGrow={1} paddingX={2} paddingY={1}>
        <Text color={color.muted} dimColor>
          select an item on the left
        </Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      <Box>
        <Text color={color.muted}>Value: </Text>
        <Text color={color.accent} bold>
          {item.value}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={color.muted}>{"─".repeat(60)}</Text>
      </Box>
      <Box marginTop={1}>
        <Text wrap="wrap">{item.description}</Text>
      </Box>
    </Box>
  );
}
