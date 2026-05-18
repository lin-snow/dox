import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useRef, useState } from "react";

import { color } from "../../theme";

export interface MultilineInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  // Mirrors @inkjs/ui TextInput's `isDisabled`. While disabled we early-return
  // from useInput so the focus manager's other field owns key handling, and we
  // render the value flat (no cursor, no placeholder).
  isDisabled?: boolean;
  // Required so we know how wide each rendered line may be. Pass the parent's
  // content column budget (panel width minus paddings) so wrap math matches
  // the visual frame.
  width: number;
  // Viewport cap: when the cursor lands past this many rows below the top we
  // scroll so the cursor stays visible. Keeps the host card height stable.
  maxRows?: number;
}

interface Cursor {
  row: number;
  col: number;
}

// Custom multi-line text-area for Ink TUIs. @inkjs/ui ships only single-line
// inputs (TextInput/PasswordInput/EmailInput), so we roll our own when a field
// needs newline insertion. See `purring-knitting-pelican.md` for the design.
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
  // Remember the user's intended column so ↓ from a long line into a short one
  // then onward into another long one restores horizontal position.
  const desiredCol = useRef<number>(cursor.col);

  // Re-clamp when the value mutates from outside (parent reset, paste of a
  // different shape). Keyed on lines.length + the active row's length so an
  // edit that doesn't change those still skips the clamp.
  const activeLineLen = lines[cursor.row]?.length ?? 0;
  useEffect(() => {
    setCursor((prev) => clampCursor(prev, lines));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length, activeLineLen]);

  useInput(
    (input, key) => {
      if (isDisabled) return;

      // Plain Enter inserts a newline — this is a true multi-line field. Save
      // is bound at the editor level (Ctrl+S) rather than here, because most
      // terminals don't pass the Shift modifier on Enter so a "Shift+Enter for
      // newline / Enter for save" split is unreliable.
      if (key.return) {
        const { next, cursor: nextCursor } = insertText(lines, cursor, "\n");
        commit(next, nextCursor);
        return;
      }

      // Tab + Esc + Ctrl+S belong to the parent / focus manager / editor save.
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

      // Home/End — accept both terminal-native keys (when reported) and the
      // portable Emacs-style Ctrl+A / Ctrl+E that every terminal can emit.
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
        // (0,0) on an empty buffer: nothing to delete — keep `onChange` quiet
        // so React doesn't see a redundant state update.
        if (cursor.row === 0 && cursor.col === 0) return;
        const { next, cursor: nextCursor } = deleteBackward(lines, cursor);
        commit(next, nextCursor);
        return;
      }

      // Printable input (covers single chars and pasted runs). Reject control
      // chords and meta-prefixed inputs so e.g. Ctrl+A doesn't insert "a".
      if (!input || key.ctrl || key.meta) return;
      // Pasted text may carry embedded newlines (and CRLF on Windows-ish
      // sources). Normalise CRLF → LF, then let insertText split on LF so a
      // multi-line paste lands as multiple lines rather than a single mash.
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

  // Viewport: keep the cursor row visible within a window of `maxRows`. No
  // separate scroll-offset state — start is derived each render so a paste or
  // arrow keypress naturally drags the viewport.
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
        // Render the cursor cell first so it visually sits at the start of the
        // placeholder, not inside it.
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
  // Pin the cursor inside the viewport: when cursor moves below the bottom,
  // scroll so the cursor is on the last visible row.
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

  // Multi-segment paste: first segment merges with `before`, last with
  // `after`, middle segments stand on their own.
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
  // col === 0 && row > 0 (caller guarantees we don't enter here at 0,0): merge
  // the current line into the previous one.
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
