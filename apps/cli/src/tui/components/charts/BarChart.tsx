import { Box, Text } from "ink";

import { color } from "../theme";

interface BarChartProps {
  // One value per column. Positive numbers only; negatives are clamped to 0.
  values: number[];
  // Number of rows in the rendered chart. Each row is one step in y-resolution.
  rows?: number;
  // Maximum y-value used for normalization. Defaults to the max of `values`.
  max?: number;
  // Y-axis label every N rows. 0 disables y-axis labels.
  ySteps?: number;
  // Unit label appended to y-axis numbers (e.g. " MB/s"). Empty by default.
  unit?: string;
}

const FULL = "█";
const EIGHTHS = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇"];

// Vertical bar chart in pure box-drawing chars. Each column is one bar; height
// is `rows`. Sub-row precision via unicode 1/8 blocks so short bars don't snap
// to "all or nothing". SurgeDM uses this aesthetic for its network activity
// graph — magenta on dark reads as neon.
export function BarChart({ values, rows = 6, max, ySteps = 2, unit = "" }: BarChartProps) {
  const peak = max ?? Math.max(1, ...values);
  // Each column is a string of (rows) characters drawn top → bottom.
  const cols = values.map((v) => normalizeColumn(v, peak, rows));
  return (
    <Box>
      {ySteps > 0 && <YAxis rows={rows} peak={peak} step={ySteps} unit={unit} />}
      <Box flexDirection="column">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <Box key={rowIdx}>
            {cols.map((col, colIdx) => (
              <Text key={colIdx} color={color.accent}>
                {col[rowIdx] ?? " "}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function YAxis({ rows, peak, step, unit }: { rows: number; peak: number; step: number; unit: string }) {
  return (
    <Box flexDirection="column" marginRight={1}>
      {Array.from({ length: rows }).map((_, idx) => {
        const showLabel = idx % step === 0;
        const value = peak * (1 - idx / Math.max(1, rows - 1));
        return (
          <Box key={idx} width={6} justifyContent="flex-end">
            <Text color={color.muted} dimColor={!showLabel}>
              {showLabel ? `${formatY(value)}${unit}` : ""}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function formatY(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(0);
  return n.toFixed(1);
}

// Build top→bottom column glyphs from a single bar height.
function normalizeColumn(value: number, peak: number, rows: number): string[] {
  const v = Math.max(0, Math.min(value, peak));
  // Total "eighths" of bar height.
  const total = (v / peak) * rows * 8;
  const out: string[] = [];
  for (let i = 0; i < rows; i++) {
    // Each row represents 8 eighths; rows are top-down so invert.
    const rowFromBottom = rows - 1 - i;
    const remaining = total - rowFromBottom * 8;
    if (remaining >= 8) out.push(FULL);
    else if (remaining > 0) out.push(EIGHTHS[Math.round(remaining)] ?? " ");
    else out.push(" ");
  }
  return out;
}
