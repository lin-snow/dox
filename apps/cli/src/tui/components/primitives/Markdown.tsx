import { Text } from "ink";
import { Marked } from "marked";
// marked-terminal ships no type declarations; the runtime is well-behaved JS
// and we only need the default plugin factory.
// @ts-expect-error - no types published
import { markedTerminal } from "marked-terminal";
import { useMemo } from "react";

import { color } from "../../theme";

interface MarkdownProps {
  source: string;
  // Width of the rendering area in cells; marked-terminal honors this for word
  // wrap on paragraphs and reflows code blocks accordingly.
  width?: number;
}

// Renders a markdown string as ANSI-tinted text inside an Ink <Text>. Heavy
// constructs that don't translate to a terminal (HTML, images, raw tables)
// degrade to plain-text; the rest (headings, bold, italic, code, lists,
// links) come out with sensible styling.
//
// The marked instance is recreated per width so paragraph reflow stays in
// sync with terminal width changes.
export function Markdown({ source, width }: MarkdownProps) {
  const rendered = useMemo(() => {
    const md = new Marked();
    md.use(
      markedTerminal({
        // Soft, terminal-friendly defaults. We avoid garish reverse-video for
        // code blocks because the surrounding panel already provides contrast.
        width: width ?? 80,
        reflowText: true,
        tab: 2,
      }),
    );
    const out = md.parse(source, { async: false });
    // marked-terminal sometimes leaves a trailing newline; strip it so the
    // surrounding Ink layout doesn't get an extra blank row.
    return typeof out === "string" ? out.replace(/\n+$/, "") : String(out);
  }, [source, width]);

  if (!rendered) {
    return null;
  }
  return <Text>{rendered}</Text>;
}

// Placeholder rendered when the description is empty/unset. Kept colocated so
// callers don't need to repeat the wording in each detail view.
export function MarkdownEmpty({ hint }: { hint: string }) {
  return (
    <Text color={color.muted} dimColor italic>
      {hint}
    </Text>
  );
}
