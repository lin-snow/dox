import { Box, Text, useFocus, useFocusManager, useInput, useStdout } from "ink";
import { TextInput } from "@inkjs/ui";
import { useState } from "react";

import { color, icon } from "../../../theme";
import { VERSION } from "../../../../version";
import { Footer } from "../../layout/Footer";
import { TitledPanel } from "../../primitives/TitledPanel";

export interface TodoEditorPayload {
  title: string;
  // Empty string is the explicit "no description" signal — the caller decides
  // whether to send it as a clear vs. leave-unchanged depending on mode.
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

// Full-screen editor page for adding / editing a todo. Title is required; the
// markdown description below it is optional. Tab swaps focus between the two
// fields; Enter on title advances focus to description; Enter on description
// submits both.
export function TodoEditorView({
  mode,
  defaultTitle,
  defaultDescription,
  onSubmit,
  onCancel,
}: TodoEditorViewProps) {
  const { stdout } = useStdout();
  const cols = Math.max(60, stdout?.columns ?? 100);
  const rows = Math.max(15, stdout?.rows ?? 30);

  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");

  const { focus } = useFocusManager();

  // Esc cancels — @inkjs/ui's TextInput doesn't capture escape, so a sibling
  // useInput sees it cleanly.
  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  const headerTitle = mode === "add" ? "New todo" : "Edit todo";
  const subtitle =
    mode === "add"
      ? "Capture a new task. Blank title + Enter cancels."
      : "Update the title and optional markdown description.";

  // Card width: wide enough to type comfortably, narrow enough to read as a
  // focused dialog rather than another full panel.
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
                  // Empty title + Enter is the "I changed my mind" gesture —
                  // submit immediately so the caller can EXIT_MODE. With a
                  // value present, advance focus to the description field.
                  if (value.trim() === "" && description === "") {
                    onSubmit({ title: "", description: "" });
                  } else {
                    focus(DESC_FIELD);
                  }
                }}
              />
            )}
          </Field>

          <Field id={DESC_FIELD} label="description" value={description}>
            {(focused) => (
              <TextInput
                isDisabled={!focused}
                defaultValue={defaultDescription}
                placeholder="optional · markdown (**bold**, `code`, [link](url), #, -, ```)"
                onChange={setDescription}
                onSubmit={(value) => {
                  onSubmit({ title: title.trim(), description: value });
                }}
              />
            )}
          </Field>

          <Box marginTop={1}>
            <Text color={color.muted}>
              Tab to switch · Enter on description to save · Esc to cancel
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
          ["⏎", "save"],
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

// A single labeled input row inside the editor card. Owns its own focus claim
// via useFocus so Ink's focus manager (Tab / Shift-Tab) can cycle through.
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
