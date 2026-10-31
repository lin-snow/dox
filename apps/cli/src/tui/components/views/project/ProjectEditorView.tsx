import { Box, Text, useInput, useWindowSize } from "ink";
import { TextInput } from "@inkjs/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { color, icon } from "../../../theme";
import { VERSION } from "../../../../version";
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

export function ProjectEditorView({
  onSubmit,
  onCancel,
}: ProjectEditorViewProps) {
  const { columns, rows: windowRows } = useWindowSize();
  const cols = Math.max(60, columns);
  const rows = Math.max(15, windowRows);
  const cardWidth = Math.min(72, cols - 8);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [field, setField] = useState<FieldIndex>(0);

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
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
        version={VERSION}
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
