import { Box, Text } from "ink";

import { color } from "../../theme";

interface DualBarChartProps {
  // Two parallel series of equal length. Rendered side-by-side per column:
  // secondary (▒) draws first, primary (█) draws second. Negatives clamp to 0.
  primary: number[];
  secondary: number[];
  // Height of the chart body in rows. Each row resolves to 8 vertical eighths.
  rows?: number;
  // Y-axis label every N rows. 0 disables y-axis labels.
  ySteps?: number;
  // Manual peak. Defaults to max of both series so they share a y-scale.
  max?: number;
}

const FULL_PRIMARY = "█";
const FULL_SECONDARY = "▒";
const EIGHTHS_PRIMARY = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇"];
const EIGHTHS_SECONDARY = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇"];

// 2-series stacked bar chart in box-drawing chars. Each day occupies 2 cells:
// `▒█` for that day — left cell shows `secondary` (created), right cell shows
// `primary` (done). Both share the same y-axis so eye comparison is honest.
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
  return (
    <Box>
      {ySteps > 0 && <YAxis rows={rows} peak={peak} step={ySteps} />}
      <Box flexDirection="column">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <Box key={rowIdx}>
            {Array.from({ length: len }).map((_, colIdx) => (
              <Text key={colIdx}>
                <Text color={color.muted} dimColor>
                  {sCols[colIdx]?.[rowIdx] ?? " "}
                </Text>
                <Text color={color.accent}>
                  {pCols[colIdx]?.[rowIdx] ?? " "}
                </Text>
              </Text>
            ))}
          </Box>
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
        // Render a literal space (not "") when no label — Ink collapses empty
        // Text nodes to zero height, which slides remaining labels upward and
        // breaks alignment with the chart rows.
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
