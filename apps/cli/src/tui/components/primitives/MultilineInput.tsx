import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";

import { color } from "../../theme";

export interface MultilineInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  width: number;
  maxRows?: number;
}

interface Cursor {
  row: number;
  col: number;
}

export function MultilineInput({
  value,
  onChange,
  placeholder,
  isDisabled = false,
  width,
  maxRows = 8,
}: MultilineInputProps) {
  const lines = useMemo(() => value.split("\n"), [value]);
  const [cursor, setCursor] = useState<Cursor>(() => ({
    row: Math.max(0, lines.length - 1),
    col: lines[lines.length - 1]?.length ?? 0,
  }));
  const desiredCol = useRef<number>(cursor.col);

  const activeLineLen = lines[cursor.row]?.length ?? 0;
  useEffect(() => {
    setCursor((prev) => clampCursor(prev, lines));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length, activeLineLen]);

  useInput(
    (input, key) => {
      if (isDisabled) return;

      if (key.return) {
        const { next, cursor: nextCursor } = insertText(lines, cursor, "\n");
        commit(next, nextCursor);
        return;
      }

      if (key.tab || key.escape) return;
      if (key.ctrl && input === "s") return;

      if (key.leftArrow) {
        const moved = moveLeft(cursor, lines);
        desiredCol.current = moved.col;
        setCursor(moved);
        return;
      }
      if (key.rightArrow) {
        const moved = moveRight(cursor, lines);
        desiredCol.current = moved.col;
        setCursor(moved);
        return;
      }
      if (key.upArrow) {
        setCursor(moveVertical(cursor, lines, -1, desiredCol.current));
        return;
      }
      if (key.downArrow) {
        setCursor(moveVertical(cursor, lines, 1, desiredCol.current));
        return;
      }

      if (key.home || (key.ctrl && input === "a")) {
        const next = { row: cursor.row, col: 0 };
        desiredCol.current = 0;
        setCursor(next);
        return;
      }
      if (key.end || (key.ctrl && input === "e")) {
        const col = lines[cursor.row]?.length ?? 0;
        const next = { row: cursor.row, col };
        desiredCol.current = col;
        setCursor(next);
        return;
      }

      if (key.backspace || key.delete) {
        if (cursor.row === 0 && cursor.col === 0) return;
        const { next, cursor: nextCursor } = deleteBackward(lines, cursor);
        commit(next, nextCursor);
        return;
      }

      if (!input || key.ctrl || key.meta) return;
      const sanitized = input.replace(/\r/g, "");
      const { next, cursor: nextCursor } = insertText(lines, cursor, sanitized);
      commit(next, nextCursor);
    },
    { isActive: !isDisabled },
  );

  function commit(nextLines: string[], nextCursor: Cursor) {
    onChange(nextLines.join("\n"));
    setCursor(nextCursor);
    desiredCol.current = nextCursor.col;
  }

  const safeWidth = Math.max(1, width);
  const start = clampStart(cursor.row, lines.length, maxRows);
  const visible = lines.slice(start, start + maxRows);

  if (isDisabled) {
    return (
      <Box flexDirection="column" width={safeWidth}>
        {(value === "" ? [" "] : lines).map((line, idx) => (
          <Text key={idx} wrap="wrap">
            {line || " "}
          </Text>
        ))}
      </Box>
    );
  }

  const showPlaceholder =
    value === "" && placeholder !== undefined && placeholder.length > 0;

  return (
    <Box flexDirection="column" width={safeWidth}>
      {showPlaceholder ? (
        <Text>
          <Text inverse> </Text>
          <Text color={color.muted} dimColor>
            {placeholder}
          </Text>
        </Text>
      ) : (
        visible.map((line, idx) => {
          const absoluteRow = start + idx;
          if (absoluteRow !== cursor.row) {
            return (
              <Text key={absoluteRow} wrap="wrap">
                {line || " "}
              </Text>
            );
          }
          const col = cursor.col;
          const before = line.slice(0, col);
          const at = line[col] ?? " ";
          const after = line.slice(col + 1);
          return (
            <Text key={absoluteRow} wrap="wrap">
              {before}
              <Text inverse>{at}</Text>
              {after}
            </Text>
          );
        })
      )}
    </Box>
  );
}

function clampCursor(cursor: Cursor, lines: string[]): Cursor {
  const row = Math.max(0, Math.min(cursor.row, lines.length - 1));
  const col = Math.max(0, Math.min(cursor.col, lines[row]?.length ?? 0));
  if (row === cursor.row && col === cursor.col) return cursor;
  return { row, col };
}

function clampStart(row: number, total: number, maxRows: number): number {
  if (total <= maxRows) return 0;
  const maxStart = total - maxRows;
  return Math.max(0, Math.min(row - (maxRows - 1), maxStart));
}

function moveLeft(cursor: Cursor, lines: string[]): Cursor {
  if (cursor.col > 0) return { row: cursor.row, col: cursor.col - 1 };
  if (cursor.row > 0) {
    const prevLen = lines[cursor.row - 1]?.length ?? 0;
    return { row: cursor.row - 1, col: prevLen };
  }
  return cursor;
}

function moveRight(cursor: Cursor, lines: string[]): Cursor {
  const len = lines[cursor.row]?.length ?? 0;
  if (cursor.col < len) return { row: cursor.row, col: cursor.col + 1 };
  if (cursor.row < lines.length - 1) return { row: cursor.row + 1, col: 0 };
  return cursor;
}

function moveVertical(
  cursor: Cursor,
  lines: string[],
  direction: -1 | 1,
  desiredCol: number,
): Cursor {
  const nextRow = cursor.row + direction;
  if (nextRow < 0 || nextRow >= lines.length) return cursor;
  const target = lines[nextRow]?.length ?? 0;
  return { row: nextRow, col: Math.min(desiredCol, target) };
}

interface MutationResult {
  next: string[];
  cursor: Cursor;
}

function insertText(
  lines: string[],
  cursor: Cursor,
  text: string,
): MutationResult {
  const segments = text.split("\n");
  const current = lines[cursor.row] ?? "";
  const before = current.slice(0, cursor.col);
  const after = current.slice(cursor.col);

  if (segments.length === 1) {
    const nextLine = before + segments[0] + after;
    const next = lines.slice();
    next[cursor.row] = nextLine;
    return {
      next,
      cursor: { row: cursor.row, col: before.length + segments[0]!.length },
    };
  }

  const first = before + segments[0];
  const last = segments[segments.length - 1] + after;
  const middle = segments.slice(1, -1);

  const next = [
    ...lines.slice(0, cursor.row),
    first,
    ...middle,
    last,
    ...lines.slice(cursor.row + 1),
  ];
  const newRow = cursor.row + segments.length - 1;
  return {
    next,
    cursor: { row: newRow, col: segments[segments.length - 1]!.length },
  };
}

function deleteBackward(lines: string[], cursor: Cursor): MutationResult {
  if (cursor.col > 0) {
    const current = lines[cursor.row] ?? "";
    const nextLine =
      current.slice(0, cursor.col - 1) + current.slice(cursor.col);
    const next = lines.slice();
    next[cursor.row] = nextLine;
    return { next, cursor: { row: cursor.row, col: cursor.col - 1 } };
  }
  const prev = lines[cursor.row - 1] ?? "";
  const current = lines[cursor.row] ?? "";
  const merged = prev + current;
  const next = [
    ...lines.slice(0, cursor.row - 1),
    merged,
    ...lines.slice(cursor.row + 1),
  ];
  return { next, cursor: { row: cursor.row - 1, col: prev.length } };
}
