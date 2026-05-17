import { Box, Text } from "ink";

import type { ActivityEvent, ActivityVerb } from "@dox/core";

import { color, icon } from "../../../theme";
import { relativeTime, swatchColor } from "../../../util";

interface ActivityFeedProps {
  events: ReadonlyArray<ActivityEvent>;
  nowMs: number;
}

// Right-bottom collaboration feed. v1 verbs are all project-scoped and
// non-actionable, so the layout is a straight reverse-chronological list with
// no pinning or call-to-action affordances.
export function ActivityFeed({ events, nowMs }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
        <Text color={color.muted} dimColor>no activity yet</Text>
        <Box marginTop={1}>
          <Text color={color.muted} dimColor>
            invite teammates to a project to see updates
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {events.map((e) => (
        <ActivityRow key={e.id} event={e} nowMs={nowMs} />
      ))}
    </Box>
  );
}

// Per-event row layout: fixed actor + verb columns on the left, flex target in
// the middle, fixed relative-time on the right. Mirrors TodoRow so the two
// right-column panels read as a coherent stack.
const ACTOR_W = 8;
const TIME_W = 4;

function ActivityRow({ event, nowMs }: { event: ActivityEvent; nowMs: number }) {
  const { glyph, tint } = verbStyle(event.verb);
  const age = relativeTime(nowMs, event.createdAt);
  return (
    <Box>
      <Box width={ACTOR_W}>
        <Text color={color.accent2} wrap="truncate">
          {event.actorName}
        </Text>
      </Box>
      <Text> </Text>
      <Text color={tint} bold>{glyph}</Text>
      <Text> </Text>
      {event.projectColor && (
        <>
          <Text color={swatchColor(event.projectColor)}>{icon.on}</Text>
          <Text> </Text>
        </>
      )}
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text wrap="truncate">{event.targetLabel}</Text>
      </Box>
      <Box width={TIME_W} justifyContent="flex-end">
        <Text color={color.muted}>{age}</Text>
      </Box>
    </Box>
  );
}

interface VerbStyle {
  glyph: string;
  tint: string;
}

function verbStyle(verb: ActivityVerb): VerbStyle {
  switch (verb) {
    case "todo_completed":
      return { glyph: icon.done, tint: color.success };
    case "todo_created":
      return { glyph: "+", tint: color.accent2 };
    case "member_joined":
      return { glyph: "→", tint: color.accent };
  }
}
