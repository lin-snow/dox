import { Box, Text, useInput, useWindowSize } from "ink";

import { color, icon } from "../../../theme";
import { Footer } from "../../layout/Footer";
import { Logo } from "../../layout/Logo";

interface AboutViewProps {
  version: string;
  onClose: () => void;
}

const AUTHOR = "lin-snow";
const REPO = "https://github.com/lin-snow/dox";
const LICENSE = "AGPL-3.0";

export function AboutView({ version, onClose }: AboutViewProps) {
  const { rows: totalRows } = useWindowSize();

  useInput((_input, key) => {
    if (key.escape || key.return) onClose();
  });

  const cardRows = 12;
  const topPad = Math.max(1, Math.floor((totalRows - cardRows - 2) / 2));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box height={topPad} />
      <Box justifyContent="center">
        <Logo />
      </Box>
      <Box marginTop={1} justifyContent="center">
        <Text color={color.muted}>{`a self-hosted todo · ${version}`}</Text>
      </Box>
      <Box marginTop={2} justifyContent="center">
        <Box flexDirection="column">
          <AboutRow label="author" value={AUTHOR} valueColor={color.accent2} />
          <AboutRow label="repo" value={REPO} valueColor={color.accent2} />
          <AboutRow label="license" value={LICENSE} valueColor={color.accent} />
        </Box>
      </Box>
      <Box marginTop={2} justifyContent="center">
        <Text color={color.muted} dimColor>
          {icon.brand} thanks for trying dox
        </Text>
      </Box>
      <Footer
        mode="about"
        version={version}
        outerPadX={1}
        hints={[
          ["esc", "back"],
          ["⏎", "back"],
        ]}
      />
    </Box>
  );
}

function AboutRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor: string;
}) {
  return (
    <Box>
      <Box width={9}>
        <Text color={color.muted}>{label}</Text>
      </Box>
      <Text color={valueColor}>{value}</Text>
    </Box>
  );
}
