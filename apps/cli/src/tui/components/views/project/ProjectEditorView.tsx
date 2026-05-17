import { Box, Text, useInput, useStdout } from "ink";
import { TextInput } from "@inkjs/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { color, icon } from "../../../theme";
import { Footer } from "../../layout/Footer";
import { TitledPanel } from "../../primitives/TitledPanel";

export interface ProjectInput {
  name: string;
  description?: string;
  color?: string;
}

interface ProjectEditorViewProps {
  onSubmit: (input: ProjectInput) => void;
  onCancel: () => void;
}

// Curated palette. Hex values keep the wire format explicit (the server stores
// the string verbatim); `tint` is what we render the swatch in so the picker
// actually looks like its choice.
const PALETTE: ReadonlyArray<{ name: string; value: string; tint: string }> = [
  { name: "none", value: "", tint: "gray" },
  { name: "magenta", value: "#ec4899", tint: "magentaBright" },
  { name: "cyan", value: "#06b6d4", tint: "cyanBright" },
  { name: "green", value: "#10b981", tint: "greenBright" },
  { name: "yellow", value: "#f59e0b", tint: "yellowBright" },
  { name: "red", value: "#ef4444", tint: "redBright" },
  { name: "blue", value: "#3b82f6", tint: "blueBright" },
  { name: "violet", value: "#8b5cf6", tint: "magenta" },
];

type FieldIndex = 0 | 1 | 2;

// Full-screen centered editor for creating a project. Modeled on
// TodoEditorView but multi-field: name + description (text), color (picker).
// Tab cycles fields, Enter submits from any field, Esc cancels.
export function ProjectEditorView({
  onSubmit,
  onCancel,
}: ProjectEditorViewProps) {
  const { stdout } = useStdout();
  const cols = Math.max(60, stdout?.columns ?? 100);
  const rows = Math.max(15, stdout?.rows ?? 30);
  const cardWidth = Math.min(72, cols - 8);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [field, setField] = useState<FieldIndex>(0);

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      // Re-route focus to the name field so the user sees what's missing.
      setField(0);
      return;
    }
    const swatch = PALETTE[paletteIdx];
    onSubmit({
      name: trimmedName,
      description: description.trim() || undefined,
      color: swatch && swatch.value ? swatch.value : undefined,
    });
  };

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.tab) {
      const delta = key.shift ? -1 : 1;
      setField(((((field + delta) % 3) + 3) % 3) as FieldIndex);
      return;
    }
    // Color picker navigation + submit only fire when the picker holds focus,
    // since on text fields the @inkjs/ui TextInput consumes arrows / Enter.
    if (field === 2) {
      if (key.leftArrow) {
        setPaletteIdx((i) => (i - 1 + PALETTE.length) % PALETTE.length);
      } else if (key.rightArrow) {
        setPaletteIdx((i) => (i + 1) % PALETTE.length);
      } else if (key.return) {
        submit();
      }
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
          title="New project"
          width={cardWidth}
          paddingX={2}
          paddingY={1}
          focused
        >
          <Text color={color.muted}>
            Group related todos. Only the name is required.
          </Text>

          <FieldRow label="name" active={field === 0}>
            <TextInput
              isDisabled={field !== 0}
              placeholder="project name…"
              onChange={setName}
              onSubmit={submit}
            />
          </FieldRow>

          <FieldRow label="desc" active={field === 1}>
            <TextInput
              isDisabled={field !== 1}
              placeholder="(optional)"
              onChange={setDescription}
              onSubmit={submit}
            />
          </FieldRow>

          <FieldRow label="color" active={field === 2}>
            <ColorPicker idx={paletteIdx} active={field === 2} />
          </FieldRow>

          <Box marginTop={1}>
            <Text color={color.muted}>
              tab to switch fields · ⏎ to save · esc to cancel
            </Text>
          </Box>
        </TitledPanel>
      </Box>
      <Footer
        mode="new project"
        version="v0.0.0"
        outerPadX={1}
        hints={[
          ["⇥", "field"],
          ["⏎", "save"],
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
  children: ReactNode;
}) {
  const tint = active ? color.accent : color.muted;
  return (
    <Box marginTop={1}>
      <Box width={11}>
        <Text color={tint}>{active ? `${icon.chevron} ` : "  "}</Text>
        <Text color={tint} bold={active}>
          {label}
        </Text>
      </Box>
      <Box flexGrow={1}>{children}</Box>
    </Box>
  );
}

function ColorPicker({ idx, active }: { idx: number; active: boolean }) {
  const selected = PALETTE[idx];
  return (
    <Box>
      {PALETTE.map((swatch, i) => {
        const isSelected = i === idx;
        const glyph = swatch.value
          ? isSelected
            ? icon.stepActive
            : icon.stepPending
          : isSelected
            ? "⊘"
            : "·";
        return (
          <Box key={swatch.name} marginRight={1}>
            <Text color={swatch.tint} bold={isSelected}>
              {glyph}
            </Text>
          </Box>
        );
      })}
      {selected && (
        <Box marginLeft={1}>
          <Text color={active ? color.accent : color.muted}>
            {selected.name}
          </Text>
        </Box>
      )}
    </Box>
  );
}
