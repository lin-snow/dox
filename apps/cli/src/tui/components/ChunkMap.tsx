import { Box, Text } from "ink";

import type { Todo } from "@dox/core";

import { color } from "../theme";

interface ChunkMapProps {
  todos: Todo[];
  // Number of columns in the grid. Rows are derived from todo count.
  cols?: number;
  // Index of the currently-selected todo, drawn with a brighter swatch.
  cursorIndex?: number;
}

// Renders todos as a grid of color squares — SurgeDM's "chunk map" pattern,
// repurposed as a per-todo status snapshot. Green = done, magenta = open;
// cursor row is brightened.
export function ChunkMap({ todos, cols = 24, cursorIndex }: ChunkMapProps) {
  if (todos.length === 0) {
    return (
      <Text color={color.muted} dimColor>
        no todos to map
      </Text>
    );
  }
  const rows: Todo[][] = [];
  for (let i = 0; i < todos.length; i += cols) rows.push(todos.slice(i, i + cols));
  return (
    <Box flexDirection="column">
      {rows.map((row, rowIdx) => (
        <Box key={rowIdx}>
          {row.map((todo, colIdx) => {
            const absoluteIdx = rowIdx * cols + colIdx;
            const isCursor = absoluteIdx === cursorIndex;
            const swatch = todo.done ? color.success : color.accent;
            return (
              <Text key={todo.id} color={swatch} bold={isCursor} dimColor={!isCursor}>
                {isCursor ? "▣ " : "■ "}
              </Text>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
