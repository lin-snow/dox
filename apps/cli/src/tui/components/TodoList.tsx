import { Box, Text } from "ink";
import type { Todo } from "@dox/core";

import { color, icon } from "../theme";

interface Props {
  todos: Todo[];
  cursor: number;
  focused?: boolean;
}

export function TodoList({ todos, cursor, focused = true }: Props) {
  if (todos.length === 0) {
    return <EmptyState />;
  }
  return (
    <Box flexDirection="column">
      {todos.map((todo, idx) => (
        <TodoRow key={todo.id} todo={todo} highlighted={focused && idx === cursor} />
      ))}
    </Box>
  );
}

function TodoRow({ todo, highlighted }: { todo: Todo; highlighted: boolean }) {
  const mark = todo.done ? icon.done : icon.open;
  const markColor = todo.done ? color.success : highlighted ? color.accent : color.muted;
  const bar = highlighted ? icon.selectBar : " ";
  const titleColor = highlighted ? color.accent : undefined;
  return (
    <Box>
      <Text color={color.accent}>{bar}</Text>
      <Text> </Text>
      <Text color={markColor}>{mark}</Text>
      <Text> </Text>
      <Text
        color={titleColor}
        bold={highlighted}
        dimColor={todo.done}
        strikethrough={todo.done}
      >
        {todo.title}
      </Text>
    </Box>
  );
}

function EmptyState() {
  return (
    <Box flexDirection="column" paddingY={1}>
      <Text color={color.muted}>      ╭─────────────╮</Text>
      <Text color={color.muted}>      │             │</Text>
      <Text color={color.muted}>
        {"      │   "}
        <Text color={color.accent}>nothing yet</Text>
        {"   │"}
      </Text>
      <Text color={color.muted}>      │             │</Text>
      <Text color={color.muted}>      ╰─────────────╯</Text>
      <Box marginTop={1}>
        <Text color={color.muted}>
          {"   press "}
          <Text color={color.accent}>i</Text>
          {" to add your first todo"}
        </Text>
      </Box>
    </Box>
  );
}
