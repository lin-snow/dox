import {
  Box,
  Text,
  useFocus,
  useFocusManager,
  useInput,
  useWindowSize,
} from "ink";
import { TextInput } from "@inkjs/ui";
import { useState } from "react";

import { color, icon } from "../../../theme";
import { VERSION } from "../../../../version";
import { Footer } from "../../layout/Footer";
import { MultilineInput } from "../../primitives/MultilineInput";
import { TitledPanel } from "../../primitives/TitledPanel";

export interface TodoEditorPayload {
  title: string;
  description: string;
}

interface TodoEditorViewProps {
  mode: "add" | "edit";
  defaultTitle?: string;
  defaultDescription?: string;
  onSubmit: (payload: TodoEditorPayload) => void;
  onCancel: () => void;
}

const TITLE_FIELD = "todo-editor:title";
const DESC_FIELD = "todo-editor:description";

export function TodoEditorView({
  mode,
  defaultTitle,
  defaultDescription,
  onSubmit,
  onCancel,
}: TodoEditorViewProps) {
  const { columns, rows: windowRows } = useWindowSize();
  const cols = Math.max(60, columns);
  const rows = Math.max(15, windowRows);

  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");

  const { focus } = useFocusManager();

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.ctrl && input === "s") {
      const trimmed = title.trim();
      if (trimmed === "") {
        onCancel();
        return;
      }
      onSubmit({ title: trimmed, description });
    }
  });

  const headerTitle = mode === "add" ? "New todo" : "Edit todo";
  const subtitle =
    mode === "add"
      ? "Capture a new task. Ctrl+S to save · Esc cancels."
      : "Update the title and optional markdown description.";

  const cardWidth = Math.min(80, cols - 8);

  return (
    <Box flexDirection="column" paddingX={1} height={rows - 1}>
      <Box
        flexGrow={1}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <TitledPanel
          title={headerTitle}
          width={cardWidth}
          paddingX={2}
          paddingY={1}
          focused
        >
          <Text color={color.muted}>{subtitle}</Text>

          <Field id={TITLE_FIELD} label="title" autoFocus value={title}>
            {(focused) => (
              <TextInput
                isDisabled={!focused}
                defaultValue={defaultTitle}
                placeholder={mode === "add" ? "new todo title…" : undefined}
                onChange={setTitle}
                onSubmit={(value) => {
                  setTitle(value);
                  focus(DESC_FIELD);
                }}
              />
            )}
          </Field>

          <Field id={DESC_FIELD} label="description" value={description}>
            {(focused) => (
              <MultilineInput
                isDisabled={!focused}
                value={description}
                onChange={setDescription}
                placeholder="optional · markdown (**bold**, `code`, [link](url), #, -, ```)"
                width={cardWidth - 6}
                maxRows={8}
              />
            )}
          </Field>

          <Box marginTop={1}>
            <Text color={color.muted}>
              Tab to switch fields · Enter inserts newline · Ctrl+S to save ·
              Esc cancels
            </Text>
          </Box>
        </TitledPanel>
      </Box>
      <Footer
        mode={mode === "add" ? "insert" : "edit"}
        version={VERSION}
        outerPadX={1}
        hints={[
          ["tab", "next field"],
          ["^S", "save"],
          ["esc", "cancel"],
        ]}
      />
    </Box>
  );
}

interface FieldProps {
  id: string;
  label: string;
  value: string;
  autoFocus?: boolean;
  children: (focused: boolean) => React.ReactNode;
}

function Field({ id, label, value, autoFocus, children }: FieldProps) {
  const { isFocused } = useFocus({ id, autoFocus });
  return (
    <Box marginTop={1} flexDirection="column">
      <Box>
        <Box width={14}>
          <Text color={isFocused ? color.accent : color.muted} bold={isFocused}>
            {`${isFocused ? icon.chevron : " "}  ${label}`}
          </Text>
        </Box>
        {value.length === 0 && (
          <Text color={color.muted} dimColor>
            (empty)
          </Text>
        )}
      </Box>
      <Box marginLeft={4}>{children(isFocused)}</Box>
    </Box>
  );
}
