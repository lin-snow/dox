import { Box, Text } from "ink";
import type { Todo } from "@dox/core";

interface Props {
  todos: Todo[];
  cursor: number;
}

export function TodoList({ todos, cursor }: Props) {
  if (todos.length === 0) {
    return <Text dimColor>(no todos — press 'i' to add)</Text>;
  }
  return (
    <Box flexDirection="column">
      {todos.map((todo, idx) => (
        <TodoRow key={todo.id} todo={todo} highlighted={idx === cursor} />
      ))}
    </Box>
  );
}

function TodoRow({ todo, highlighted }: { todo: Todo; highlighted: boolean }) {
  const mark = todo.done ? "[x]" : "[ ]";
  const id = todo.id.slice(0, 6);
  const pointer = highlighted ? "> " : "  ";
  return (
    <Text color={highlighted ? "cyan" : undefined} dimColor={todo.done && !highlighted}>
      {pointer}
      {mark} {id}…  {todo.title}
    </Text>
  );
}
