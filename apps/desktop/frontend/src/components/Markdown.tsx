import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

marked.setOptions({ gfm: true, breaks: true });

/**
 * Markdown for todo descriptions. Sanitised because it lands in innerHTML;
 * link clicks are swallowed so a stray URL cannot navigate the webview away
 * from the app.
 */
export function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const html = useMemo(() => {
    const rendered = marked.parse(source, { async: false });
    return DOMPurify.sanitize(rendered);
  }, [source]);

  return (
    <div
      className={className ? `md ${className}` : "md"}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a")) event.preventDefault();
      }}
    />
  );
}
