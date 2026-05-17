import { Box, Text, useInput, useStdout } from "ink";
import { TextInput } from "@inkjs/ui";
import { useState } from "react";

import { color, icon } from "../../../theme";
import { Footer } from "../../layout/Footer";
import { TitledPanel } from "../../primitives/TitledPanel";

export interface SettingsFormField {
  key: string;
  label: string;
  placeholder?: string;
  // Hide input chars (passwords).
  masked?: boolean;
  // Pre-fill, e.g. existing server_name value being edited.
  initial?: string;
}

interface SettingsFormModalProps {
  title: string;
  fields: SettingsFormField[];
  // Helper text shown above the fields. Keep it under one line so the modal
  // stays compact.
  help?: string;
  submitLabel?: string;
  // Disable submit while a request is in flight.
  busy?: boolean;
  // Rendered red under the fields when present.
  error?: string | null;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

// Centered modal that collects one or two text fields and routes them through
// onSubmit. Tab cycles fields, Enter submits from any field, Esc cancels.
// Read-only "presentational" component for layout — parent owns the async
// side-effect after onSubmit.
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

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = f.initial ?? "";
    return init;
  });
  const [field, setField] = useState(0);

  const submit = () => {
    if (busy) return;
    onSubmit({ ...values });
  };

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.tab && fields.length > 1) {
      const delta = key.shift ? -1 : 1;
      setField((((field + delta) % fields.length) + fields.length) % fields.length);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} height={rows - 1}>
      <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
        <TitledPanel title={title} width={cardWidth} paddingX={2} paddingY={1} focused>
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
                onChange={(next) => setValues((cur) => ({ ...cur, [f.key]: next }))}
                onSubmit={submit}
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
              {fields.length > 1 ? "tab to switch fields · " : ""}⏎ to {submitLabel} · esc to cancel
              {busy ? "  (saving…)" : ""}
            </Text>
          </Box>
        </TitledPanel>
      </Box>
      <Footer
        mode={title.toLowerCase()}
        version="v0.0.0"
        outerPadX={1}
        hints={
          fields.length > 1
            ? [
                ["⇥", "field"],
                ["⏎", submitLabel],
                ["esc", "cancel"],
              ]
            : [
                ["⏎", submitLabel],
                ["esc", "cancel"],
              ]
        }
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
