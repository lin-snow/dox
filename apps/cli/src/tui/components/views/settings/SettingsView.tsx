import { Box, Text, useInput, useWindowSize } from "ink";

import type { SettingsTabSpec, SettingsRow } from "../../../settings";
import type { SettingsTabKey } from "../../../state";
import { color } from "../../../theme";
import { VERSION } from "../../../../version";
import { Footer } from "../../layout/Footer";
import { TitledPanel } from "../../primitives/TitledPanel";

interface SettingsViewProps {
  tabs: SettingsTabSpec[];
  activeTab: SettingsTabKey;
  cursor: number;
  notice?: string | null;
  onTabChange: (next: SettingsTabKey) => void;
  onCursorChange: (next: number) => void;
  onClose: () => void;
  inputPaused?: boolean;
}

export function SettingsView({
  tabs,
  activeTab,
  cursor,
  notice,
  onTabChange,
  onCursorChange,
  onClose,
  inputPaused = false,
}: SettingsViewProps) {
  const { columns: cols, rows } = useWindowSize();
  const panelWidth = Math.min(110, Math.max(72, cols - 4));
  const innerHeight = Math.min(28, Math.max(18, rows - 6));
  const topPad = Math.max(1, Math.floor((rows - innerHeight - 3) / 2));
  const innerW = Math.max(8, panelWidth - 4);
  const sidebarW = Math.max(16, Math.floor(panelWidth * 0.36));
  const detailW = Math.max(20, innerW - sidebarW - 2);

  const tabIndex = Math.max(
    0,
    tabs.findIndex((t) => t.key === activeTab),
  );
  const tab = tabs[tabIndex] ?? tabs[0];
  const tabRows = tab?.rows ?? [];
  const clampedCursor =
    tabRows.length === 0 ? 0 : Math.min(cursor, tabRows.length - 1);
  const current: SettingsRow | undefined = tabRows[clampedCursor];

  useInput((input, key) => {
    if (inputPaused) return;
    if (key.escape) {
      onClose();
      return;
    }
    if (key.leftArrow || input === "h") {
      const next = tabs[(tabIndex - 1 + tabs.length) % tabs.length];
      if (next) onTabChange(next.key);
      return;
    }
    if (key.rightArrow || input === "l" || key.tab) {
      const next = tabs[(tabIndex + 1) % tabs.length];
      if (next) onTabChange(next.key);
      return;
    }
    if (input === "j" || key.downArrow) {
      onCursorChange(Math.min(tabRows.length - 1, clampedCursor + 1));
      return;
    }
    if (input === "k" || key.upArrow) {
      onCursorChange(Math.max(0, clampedCursor - 1));
      return;
    }
    if (key.return) {
      current?.onEnter?.();
      return;
    }
    if (current?.secondary && input === current.secondary.key) {
      current.secondary.action();
      return;
    }
    const n = Number(input);
    if (Number.isInteger(n) && n >= 1 && n <= tabs.length) {
      const target = tabs[n - 1];
      if (target) onTabChange(target.key);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box height={topPad} />
      <Box justifyContent="center">
        <TitledPanel
          title="Settings"
          width={panelWidth}
          paddingY={1}
          focused
          height={innerHeight}
        >
          <TabStrip tabs={tabs} activeKey={activeTab} />
          {notice && (
            <Box marginTop={1} justifyContent="center">
              <Text color={color.success}>{`✓ ${notice}`}</Text>
            </Box>
          )}
          {tab?.hint && !notice && (
            <Box marginTop={1} justifyContent="center">
              <Text color={color.muted}>{tab.hint}</Text>
            </Box>
          )}
          <Box marginTop={1} flexGrow={1}>
            <RowList rows={tabRows} cursor={clampedCursor} width={sidebarW} />
            <Box width={2} />
            <Detail row={current} width={detailW} />
          </Box>
        </TitledPanel>
      </Box>
      <Footer
        mode="settings"
        version={VERSION}
        outerPadX={1}
        hints={tab?.hints ?? [["esc", "close"]]}
      />
    </Box>
  );
}

function TabStrip({
  tabs,
  activeKey,
}: {
  tabs: SettingsTabSpec[];
  activeKey: SettingsTabKey;
}) {
  return (
    <Box justifyContent="center">
      {tabs.map((t, idx) => {
        const active = t.key === activeKey;
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

function RowList({
  rows,
  cursor,
  width,
}: {
  rows: SettingsRow[];
  cursor: number;
  width: number;
}) {
  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={color.muted}
      paddingX={1}
      paddingY={1}
    >
      {rows.length === 0 ? (
        <Text color={color.muted} dimColor>
          (no items)
        </Text>
      ) : (
        rows.map((row, idx) => {
          const active = idx === cursor;
          const readOnly = !row.onEnter && !row.secondary;
          const labelColor = active
            ? color.accent
            : readOnly
              ? color.muted
              : undefined;
          return (
            <Box key={row.key}>
              <Text color={active ? color.accent : color.muted}>
                {active ? "• " : "  "}
              </Text>
              <Box flexGrow={1}>
                <Text color={labelColor} bold={active} wrap="truncate">
                  {row.label}
                </Text>
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}

function Detail({
  row,
  width,
}: {
  row: SettingsRow | undefined;
  width: number;
}) {
  const sepW = Math.max(0, width - 4);
  const sep = (
    <Text color={color.muted} dimColor>
      {"─".repeat(sepW)}
    </Text>
  );
  if (!row) {
    return (
      <Box flexGrow={1} paddingX={2} paddingY={1}>
        <Text color={color.muted} dimColor>
          select an item on the left
        </Text>
      </Box>
    );
  }
  const hasAction = Boolean(row.onEnter || row.secondary);
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      <Text color={color.accent} bold>
        {row.label}
      </Text>
      {row.value && (
        <Box marginTop={1}>
          <Text color={color.muted}>Value: </Text>
          <Text color={color.accent2}>{row.value}</Text>
        </Box>
      )}
      <Box marginTop={1}>{sep}</Box>
      <Box marginTop={1}>
        <Text wrap="wrap">
          {typeof row.detail === "string" || !row.detail
            ? (row.detail ?? "")
            : row.detail}
        </Text>
      </Box>
      {}
      <Box flexGrow={1} />
      <Box>
        <Text color={color.muted} dimColor>
          {"─ tips ".padEnd(sepW, "─")}
        </Text>
      </Box>
      <Box marginTop={1}>
        {hasAction ? (
          <>
            {row.onEnter && (
              <Text color={color.muted}>
                <Text color={color.accent} bold>
                  ⏎
                </Text>{" "}
                {row.enterLabel ?? "open"}
              </Text>
            )}
            {row.onEnter && row.secondary && (
              <Text color={color.muted}> · </Text>
            )}
            {row.secondary && (
              <Text color={color.muted}>
                <Text color={color.accent2} bold>
                  {row.secondary.key}
                </Text>{" "}
                {row.secondary.label}
              </Text>
            )}
          </>
        ) : (
          <Text color={color.muted} dimColor>
            view only
          </Text>
        )}
      </Box>
    </Box>
  );
}
