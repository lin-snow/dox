// FormatCodeOnNewline formats a raw 8-char code as "ABCD-EFGH" matching the
// server's auth.FormatCode rendering.
export function FormatCodeOnNewline(code: string): string {
  if (code.length !== 8) return code;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
