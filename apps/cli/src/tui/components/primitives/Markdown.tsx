import { Text } from "ink";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { useMemo } from "react";

import { color } from "../../theme";

interface MarkdownProps {
  source: string;
  width?: number;
}

export interface RenderedMarkdown {
  text: string;
  truncated: boolean;
}

/** Shared renderer for full markdown and for bounded previews. */
export function renderMarkdown(
  source: string,
  width = 80,
  maxLines?: number,
): RenderedMarkdown {
  const md = new Marked();
  md.use(
    markedTerminal({
      width,
      reflowText: true,
      tab: 2,
    }),
  );
  const out = md.parse(source, { async: false });
  const rendered = (typeof out === "string" ? out : String(out)).replace(
    /\n+$/,
    "",
  );
  if (!maxLines) {
    return { text: rendered, truncated: false };
  }
  const lines = rendered.split("\n");
  if (lines.length <= maxLines) {
    return { text: rendered, truncated: false };
  }
  return {
    text: `${lines.slice(0, maxLines).join("\n").replace(/\s+$/, "")}…`,
    truncated: true,
  };
}

export function Markdown({ source, width }: MarkdownProps) {
  const rendered = useMemo(
    () => renderMarkdown(source, width ?? 80).text,
    [source, width],
  );

  if (!rendered) {
    return null;
  }
  return <Text>{rendered}</Text>;
}

export function MarkdownEmpty({ hint }: { hint: string }) {
  return (
    <Text color={color.muted} dimColor italic>
      {hint}
    </Text>
  );
}
