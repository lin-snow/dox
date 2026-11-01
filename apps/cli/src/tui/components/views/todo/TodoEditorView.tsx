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

import { parseWhen } from "@dox/core";

import { color, icon } from "../../../theme";
import { VERSION } from "../../../../version";
import { Footer } from "../../layout/Footer";
import { MultilineInput } from "../../primitives/MultilineInput";
import { TitledPanel } from "../../primitives/TitledPanel";

export interface TodoEditorPayload {
  title: string;
  description: string;
  /** Raw deadline text; empty clears. */
  due: string;
  /** Raw reminder text; empty clears. */
  remind: string;
  /** Raw meeting start text; empty means no meeting. */
  meetStart: string;
  /** Raw meeting end text; empty means no meeting. */
  meetEnd: string;
}

interface TodoEditorViewProps {
  mode: "add" | "edit";
  defaultTitle?: string;
  defaultDescription?: string;
  defaultDue?: string;
  defaultRemind?: string;
  defaultMeetStart?: string;
  defaultMeetEnd?: string;
  onSubmit: (payload: TodoEditorPayload) => void;
  onCancel: () => void;
}

const TITLE_FIELD = "todo-editor:title";
const DUE_FIELD = "todo-editor:due";
const REMIND_FIELD = "todo-editor:remind";
const MEET_START_FIELD = "todo-editor:meet-start";
const MEET_END_FIELD = "todo-editor:meet-end";
const DESC_FIELD = "todo-editor:description";

const WHEN_HINT = '2026-11-05 · "2026-11-05 09:30" · 09:30 · +2h';

export function TodoEditorView({
  mode,
  defaultTitle,
  defaultDescription,
  defaultDue,
  defaultRemind,
  defaultMeetStart,
  defaultMeetEnd,
  onSubmit,
  onCancel,
}: TodoEditorViewProps) {
  const { columns, rows: windowRows } = useWindowSize();
  const cols = Math.max(60, columns);
  const rows = Math.max(15, windowRows);

  const [title, setTitle] = useState(defaultTitle ?? "");
  const [description, setDescription] = useState(defaultDescription ?? "");
  const [due, setDue] = useState(defaultDue ?? "");
  const [remind, setRemind] = useState(defaultRemind ?? "");
  const [meetStart, setMeetStart] = useState(defaultMeetStart ?? "");
  const [meetEnd, setMeetEnd] = useState(defaultMeetEnd ?? "");

  const { focus } = useFocusManager();

  const dueInvalid = due.trim().length > 0 && !parseWhen(due);
  const remindInvalid = remind.trim().length > 0 && !parseWhen(remind);
  const meetError = meetingError(meetStart, meetEnd);

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
      // Keep the sheet open on bad input so the user's typing survives.
      if (dueInvalid || remindInvalid || meetError) return;
      onSubmit({
        title: trimmed,
        description,
        due,
        remind,
        meetStart,
        meetEnd,
      });
    }
  });

  const headerTitle = mode === "add" ? "New todo" : "Edit todo";
  const subtitle =
    mode === "add"
      ? "Capture a new task. Ctrl+S to save · Esc cancels."
      : "Update the title, deadlines, meeting window, and markdown description.";

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
                  focus(DUE_FIELD);
                }}
              />
            )}
          </Field>

          <Field id={DUE_FIELD} label="due" value={due}>
            {(focused) => (
              <TextInput
                isDisabled={!focused}
                defaultValue={defaultDue}
                placeholder={`optional · ${WHEN_HINT}`}
                onChange={setDue}
                onSubmit={(value) => {
                  setDue(value);
                  focus(REMIND_FIELD);
                }}
              />
            )}
          </Field>
          {dueInvalid && (
            <Box marginLeft={4}>
              <Text color={color.danger}>unrecognised date · {WHEN_HINT}</Text>
            </Box>
          )}

          <Field id={REMIND_FIELD} label="remind" value={remind}>
            {(focused) => (
              <TextInput
                isDisabled={!focused}
                defaultValue={defaultRemind}
                placeholder="optional · defaults to the due time"
                onChange={setRemind}
                onSubmit={(value) => {
                  setRemind(value);
                  focus(DESC_FIELD);
                }}
              />
            )}
          </Field>
          {remindInvalid && (
            <Box marginLeft={4}>
              <Text color={color.danger}>unrecognised time · {WHEN_HINT}</Text>
            </Box>
          )}
          {!remindInvalid && due.trim() !== "" && remind.trim() === "" && (
            <Box marginLeft={4}>
              <Text color={color.muted} dimColor>
                you will be reminded at the due time
              </Text>
            </Box>
          )}

          <Field id={MEET_START_FIELD} label="starts" value={meetStart}>
            {(focused) => (
              <TextInput
                isDisabled={!focused}
                defaultValue={defaultMeetStart}
                placeholder={`optional · meeting start · ${WHEN_HINT}`}
                onChange={setMeetStart}
                onSubmit={(value) => {
                  setMeetStart(value);
                  focus(MEET_END_FIELD);
                }}
              />
            )}
          </Field>

          <Field id={MEET_END_FIELD} label="ends" value={meetEnd}>
            {(focused) => (
              <TextInput
                isDisabled={!focused}
                defaultValue={defaultMeetEnd}
                placeholder={`optional · meeting end · ${WHEN_HINT}`}
                onChange={setMeetEnd}
                onSubmit={(value) => {
                  setMeetEnd(value);
                  focus(DESC_FIELD);
                }}
              />
            )}
          </Field>
          {meetError && (
            <Box marginLeft={4}>
              <Text color={color.danger}>{meetError}</Text>
            </Box>
          )}

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
              Enter jumps to the next field · Ctrl+S to save · Esc cancels
            </Text>
          </Box>
        </TitledPanel>
      </Box>
      <Footer
        mode={mode === "add" ? "insert" : "edit"}
        version={VERSION}
        outerPadX={1}
        hints={[
          ["⏎", "next field"],
          ["^S", "save"],
          ["esc", "cancel"],
        ]}
      />
    </Box>
  );
}

/**
 * A meeting is one window, so half of it is never a valid edit — and an end
 * before its start is a typo, not intent. Both are caught here so the sheet
 * can point at the fields instead of closing and letting the server reject a
 * patch the user has to retype from scratch.
 */
function meetingError(startRaw: string, endRaw: string): string | null {
  const start = startRaw.trim();
  const end = endRaw.trim();
  if (start === "" && end === "") return null;
  if (start === "" || end === "") {
    return "a meeting needs both a start and an end";
  }
  const from = parseWhen(start);
  if (!from) return `unrecognised meeting start · ${WHEN_HINT}`;
  const to = parseWhen(end);
  if (!to) return `unrecognised meeting end · ${WHEN_HINT}`;
  if (to.at <= from.at) return "the meeting must end after it starts";
  return null;
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
