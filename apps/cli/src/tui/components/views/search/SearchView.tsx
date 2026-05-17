import { Box, Text, useInput, useStdout } from "ink";
import { TextInput } from "@inkjs/ui";
import { useEffect, useMemo } from "react";

import type { Project, Todo } from "@dox/core";

import { color, icon } from "../../../theme";
import { relativeTime, swatchColor } from "../../../util";
import { Footer } from "../../layout/Footer";
import { TitledPanel } from "../../primitives/TitledPanel";

interface SearchViewProps {
  todos: Todo[];
  projects: Project[];
  query: string;
  cursor: number;
  hydrating: boolean;
  nowMs: number;
  onQueryChange: (q: string) => void;
  onCursorUp: () => void;
  onCursorDown: () => void;
  onResultCount: (count: number) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}

// Full-screen fuzzy search for todos. Matches against title and (when the row
// has been hydrated by App.tsx's getTodo loop) description. Enter opens the
// cursored result in a detail view; Esc bounces back to the list.
export function SearchView({
  todos,
  projects,
  query,
  cursor,
  hydrating,
  nowMs,
  onQueryChange,
  onCursorUp,
  onCursorDown,
  onResultCount,
  onOpen,
  onClose,
}: SearchViewProps) {
  const { stdout } = useStdout();
  const cols = Math.max(80, stdout?.columns ?? 100);
  const rows = Math.max(20, stdout?.rows ?? 30);
  const panelWidth = cols - 2;
  const panelHeight = Math.max(15, rows - 4);

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const results = useMemo(() => searchTodos(todos, query), [todos, query]);
  const safeCursor = Math.min(cursor, Math.max(0, results.length - 1));

  // Push the current result count up to the reducer so it can clamp the cursor
  // as the user narrows the query. Without this, deleting characters could
  // leave the cursor pointing past the end of the list.
  useEffect(() => {
    onResultCount(results.length);
  }, [results.length, onResultCount]);

  // Arrow keys + Esc are handled here so they work while the TextInput holds
  // focus — TextInput only consumes left/right arrows + typed characters.
  useInput((_input, key) => {
    if (key.escape) return onClose();
    if (key.upArrow) return onCursorUp();
    if (key.downArrow) return onCursorDown();
  });

  // Height budget for the result list. Panel chrome eats: border-top 1 +
  // paddingY-top 1 + query row 1 + meta row 1 + spacer 1 = 5 above; paddingY-
  // bottom 1 + border-bottom 1 = 2 below. Footer sits outside the panel.
  const viewportH = Math.max(3, panelHeight - 7);
  const win = sliceWindow(results, safeCursor, viewportH);

  const matchLabel =
    query.trim() === ""
      ? `${todos.length} todos total`
      : `${results.length} match${results.length === 1 ? "" : "es"}`;

  return (
    <Box flexDirection="column" paddingX={1}>
      <TitledPanel
        title="Search"
        width={panelWidth}
        height={panelHeight}
        paddingX={2}
        paddingY={1}
        focused
      >
        {/* Query row: chevron prompt + live-bound TextInput. */}
        <Box>
          <Box width={2}>
            <Text color={color.accent} bold>
              {icon.chevron}
            </Text>
          </Box>
          <Box flexGrow={1}>
            <TextInput
              defaultValue={query}
              placeholder="search by title or description…"
              onChange={onQueryChange}
              onSubmit={() => {
                const target = results[safeCursor];
                if (target) onOpen(target.id);
              }}
            />
          </Box>
        </Box>

        {/* Meta strip — match count + hydration hint. */}
        <Box marginTop={1}>
          <Text color={color.muted}>{matchLabel}</Text>
          {hydrating && (
            <Text color={color.muted} dimColor>
              {"   "}
              {icon.dot} loading descriptions…
            </Text>
          )}
        </Box>

        {/* Result list — windowed around the cursor so long match sets don't
            push the footer off-screen. Empty query shows recent todos so the
            page is useful immediately on open. */}
        <Box marginTop={1} flexDirection="column">
          {results.length === 0 ? (
            <Text color={color.muted} dimColor>
              {"  "}
              {query.trim() === ""
                ? "type to search…"
                : "no matches — try a shorter query"}
            </Text>
          ) : (
            <>
              {win.items.map((t, idx) => {
                const projectId = t.projectId;
                const project = projectId
                  ? (projectById.get(projectId) ?? null)
                  : null;
                return (
                  <ResultRow
                    key={t.id}
                    todo={t}
                    project={project}
                    nowMs={nowMs}
                    highlighted={win.start + idx === safeCursor}
                    width={panelWidth - 6}
                  />
                );
              })}
              {(win.moreAbove > 0 || win.moreBelow > 0) && (
                <Box width={panelWidth - 6}>
                  <Text color={color.muted} dimColor>
                    {win.moreAbove > 0 ? `↑ ${win.moreAbove} more` : ""}
                  </Text>
                  <Box flexGrow={1} />
                  <Text color={color.muted} dimColor>
                    {win.moreBelow > 0 ? `${win.moreBelow} more ↓` : ""}
                  </Text>
                </Box>
              )}
            </>
          )}
        </Box>
      </TitledPanel>

      <Footer
        mode="search"
        version="v0.0.0"
        outerPadX={1}
        hints={[
          ["↑↓", "navigate"],
          ["⏎", "open"],
          ["esc", "back"],
        ]}
      />
    </Box>
  );
}

interface ResultRowProps {
  todo: Todo;
  project: Project | null;
  nowMs: number;
  highlighted: boolean;
  width: number;
}

function ResultRow({
  todo,
  project,
  nowMs,
  highlighted,
  width,
}: ResultRowProps) {
  const mark = todo.done ? icon.done : icon.open;
  const markColor = todo.done
    ? color.success
    : highlighted
      ? color.accent
      : color.muted;
  const bar = highlighted ? icon.selectBar : " ";
  const age = relativeTime(nowMs, todo.updatedAt);
  const ageWidth = 4;
  return (
    <Box width={width}>
      <Text color={color.accent}>{bar}</Text>
      <Text> </Text>
      <Text color={markColor}>{mark}</Text>
      <Text> </Text>
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text
          color={highlighted ? color.accent : undefined}
          bold={highlighted}
          dimColor={todo.done}
          strikethrough={todo.done}
          wrap="truncate"
        >
          {todo.title}
        </Text>
      </Box>
      {project && (
        <Box
          width={Math.min(14, Math.floor(width / 3))}
          justifyContent="flex-end"
        >
          <Text color={swatchColor(project.color)} wrap="truncate">
            ● {project.name}
          </Text>
        </Box>
      )}
      <Box width={ageWidth} justifyContent="flex-end">
        <Text color={color.muted}>{age}</Text>
      </Box>
    </Box>
  );
}

// Tokenized case-insensitive substring match against title + description. All
// whitespace-separated tokens must appear somewhere in the haystack; ordering
// doesn't matter ("milk buy" still matches "buy milk"). Empty query → show all
// todos sorted by updatedAt desc so the page is useful before the user types.
function searchTodos(todos: Todo[], query: string): Todo[] {
  const sorted = [...todos].sort(
    (a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0),
  );
  const q = query.trim().toLowerCase();
  if (q === "") return sorted;
  const tokens = q.split(/\s+/).filter(Boolean);
  return sorted.filter((t) => {
    const haystack = `${t.title} ${t.description ?? ""}`.toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });
}

interface WindowSlice<T> {
  items: T[];
  start: number;
  moreAbove: number;
  moreBelow: number;
}

function sliceWindow<T>(
  items: T[],
  cursor: number,
  viewportH: number,
): WindowSlice<T> {
  if (items.length <= viewportH) {
    return { items, start: 0, moreAbove: 0, moreBelow: 0 };
  }
  const half = Math.floor(viewportH / 2);
  const maxStart = items.length - viewportH;
  const start = Math.max(0, Math.min(cursor - half, maxStart));
  const slice = items.slice(start, start + viewportH);
  return {
    items: slice,
    start,
    moreAbove: start,
    moreBelow: items.length - start - slice.length,
  };
}
