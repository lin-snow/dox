import { Text } from "ink";
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { useMemo } from "react";

import { color } from "../../theme";

interface MarkdownProps {
  source: string;
  width?: number;
}

export function Markdown({ source, width }: MarkdownProps) {
  const rendered = useMemo(() => {
    const md = new Marked();
    md.use(
      markedTerminal({
        width: width ?? 80,
        reflowText: true,
        tab: 2,
      }),
    );
    const out = md.parse(source, { async: false });
    return typeof out === "string" ? out.replace(/\n+$/, "") : String(out);
  }, [source, width]);

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
