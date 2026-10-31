import { Box, Text } from "ink";
import { Fragment } from "react";

import { color } from "../../theme";

interface DualBarChartProps {
  primary: number[];
  secondary: number[];
  rows?: number;
  ySteps?: number;
  max?: number;
}

const FULL_PRIMARY = "█";
const FULL_SECONDARY = "▒";
const EIGHTHS_PRIMARY = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇"];
const EIGHTHS_SECONDARY = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇"];

export function DualBarChart({
  primary,
  secondary,
  rows = 5,
  ySteps = 2,
  max,
}: DualBarChartProps) {
  const peak = max ?? Math.max(1, ...primary, ...secondary);
  const pCols = primary.map((v) =>
    buildColumn(v, peak, rows, FULL_PRIMARY, EIGHTHS_PRIMARY),
  );
  const sCols = secondary.map((v) =>
    buildColumn(v, peak, rows, FULL_SECONDARY, EIGHTHS_SECONDARY),
  );
  const len = Math.max(pCols.length, sCols.length);
  const chartW = len * 2;
  return (
    <Box flexShrink={0}>
      {ySteps > 0 && <YAxis rows={rows} peak={peak} step={ySteps} />}
      <Box flexDirection="column" width={chartW} flexShrink={0}>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <Text key={rowIdx} wrap="truncate-end">
            {Array.from({ length: len }).map((_, colIdx) => (
              <Fragment key={colIdx}>
                <Text color={color.muted} dimColor>
                  {sCols[colIdx]?.[rowIdx] ?? " "}
                </Text>
                <Text color={color.accent}>
                  {pCols[colIdx]?.[rowIdx] ?? " "}
                </Text>
              </Fragment>
            ))}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

function YAxis({
  rows,
  peak,
  step,
}: {
  rows: number;
  peak: number;
  step: number;
}) {
  return (
    <Box flexDirection="column" marginRight={1}>
      {Array.from({ length: rows }).map((_, idx) => {
        const showLabel = idx % step === 0;
        const value = peak * (1 - idx / Math.max(1, rows - 1));
        const text = showLabel ? formatY(value) : " ";
        return (
          <Box key={idx} width={3} justifyContent="flex-end">
            <Text color={color.muted} dimColor={!showLabel}>
              {text}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function formatY(n: number): string {
  if (n >= 10) return n.toFixed(0);
  return n.toFixed(0);
}

function buildColumn(
  value: number,
  peak: number,
  rows: number,
  full: string,
  eighths: string[],
): string[] {
  const v = Math.max(0, Math.min(value, peak));
  const total = (v / peak) * rows * 8;
  const out: string[] = [];
  for (let i = 0; i < rows; i++) {
    const rowFromBottom = rows - 1 - i;
    const remaining = total - rowFromBottom * 8;
    if (remaining >= 8) out.push(full);
    else if (remaining > 0) out.push(eighths[Math.round(remaining)] ?? " ");
    else out.push(" ");
  }
  return out;
}
