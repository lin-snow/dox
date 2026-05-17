import { Box, Text, useInput, useStdout } from "ink";
import { TextInput } from "@inkjs/ui";
import { useRef, useState } from "react";

import { color, icon } from "../../../theme";
import { Footer } from "../../layout/Footer";
import { TitledPanel } from "../../primitives/TitledPanel";

export interface SettingsFormField {
  key: string;
  label: string;
  placeholder?: string;
  // Pre-fill, e.g. existing server_name value being edited.
  initial?: string;
}

interface SettingsFormModalProps {
  title: string;
  fields: SettingsFormField[];
  help?: string;
  submitLabel?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

// Linear form modal. Mirrors the Onboarding pattern: TextInput is fully
// uncontrolled (no onChange), values are captured on each field's Enter via
// onSubmit, and Enter advances focus — last field's Enter calls parent
// onSubmit with the accumulated values.
//
// Why this shape: @inkjs/ui v2.0.0's TextInput has a useEffect with onChange
// in its deps. Passing a non-stable onChange there causes a "Maximum update
// depth exceeded" loop as soon as the user types a character. Dropping
// onChange entirely sidesteps it.
export function SettingsFormModal({
  title,
  fields,
  help,
  submitLabel = "save",
  busy = false,
  error,
  onSubmit,
  onCancel,
}: SettingsFormModalProps) {
  const { stdout } = useStdout();
  const cols = Math.max(60, stdout?.columns ?? 100);
  const rows = Math.max(15, stdout?.rows ?? 30);
  const cardWidth = Math.min(72, cols - 8);

  // Accumulator for each field's submitted value. Lives in a ref because we
  // don't need to re-render between fields — only the focused index changes.
  const valuesRef = useRef<Record<string, string>>(
    (() => {
      const init: Record<string, string> = {};
      for (const f of fields) init[f.key] = f.initial ?? "";
      return init;
    })(),
  );
  const [field, setField] = useState(0);

  // Per-field Enter handler. Saves the typed value, advances to the next
  // field, or — if this was the last field — fires the parent's onSubmit.
  const handleFieldSubmit = (idx: number, value: string) => {
    if (busy) return;
    const f = fields[idx];
    if (!f) return;
    valuesRef.current[f.key] = value;
    if (idx + 1 < fields.length) {
      setField(idx + 1);
      return;
    }
    onSubmit({ ...valuesRef.current });
  };

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} height={rows - 1}>
      <Box
        flexGrow={1}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <TitledPanel
          title={title}
          width={cardWidth}
          paddingX={2}
          paddingY={1}
          focused
        >
          {help && (
            <Text color={color.muted} wrap="wrap">
              {help}
            </Text>
          )}

          {fields.map((f, idx) => (
            <FieldRow key={f.key} label={f.label} active={field === idx}>
              <TextInput
                isDisabled={field !== idx}
                placeholder={f.placeholder ?? ""}
                defaultValue={f.initial ?? ""}
                onSubmit={(value) => handleFieldSubmit(idx, value)}
              />
            </FieldRow>
          ))}

          {error && (
            <Box marginTop={1}>
              <Text color={color.danger} wrap="wrap">
                {error}
              </Text>
            </Box>
          )}

          <Box marginTop={1}>
            <Text color={color.muted}>
              {fields.length > 1 ? "⏎ on each field to advance · " : "⏎ to "}
              {fields.length > 1 ? "" : submitLabel}
              {fields.length > 1 ? "last ⏎ submits" : ""} · esc to cancel
              {busy ? "  (saving…)" : ""}
            </Text>
          </Box>
        </TitledPanel>
      </Box>
      <Footer
        mode={title.toLowerCase()}
        version="v0.0.0"
        outerPadX={1}
        hints={[
          ["⏎", fields.length > 1 ? "next / submit" : submitLabel],
          ["esc", "cancel"],
        ]}
      />
    </Box>
  );
}

function FieldRow({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  const tint = active ? color.accent : color.muted;
  return (
    <Box marginTop={1}>
      <Box width={16}>
        <Text color={tint}>{active ? `${icon.chevron} ` : "  "}</Text>
        <Text color={tint} bold={active}>
          {label}
        </Text>
      </Box>
      <Box flexGrow={1}>{children}</Box>
    </Box>
  );
}
