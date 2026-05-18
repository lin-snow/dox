import { readFile } from "node:fs/promises";

// FormatCodeOnNewline formats a raw 8-char code as "ABCD-EFGH" matching the
// server's auth.FormatCode rendering.
export function FormatCodeOnNewline(code: string): string {
  if (code.length !== 8) return code;
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// readDescription resolves --description / --description-file into the body
// string to send. `-` as the file path reads from stdin. Returns undefined
// when neither flag is set, signalling "leave description unchanged" to the
// server-side PATCH semantics. Throws when both flags are given.
export async function readDescription(opts: {
  description?: string;
  descriptionFile?: string;
}): Promise<string | undefined> {
  if (opts.description !== undefined && opts.descriptionFile !== undefined) {
    throw new Error("use either --description or --description-file, not both");
  }
  if (opts.description !== undefined) return opts.description;
  if (opts.descriptionFile === undefined) return undefined;
  if (opts.descriptionFile === "-") return readStdin();
  return readFile(opts.descriptionFile, "utf-8");
}

async function readStdin(): Promise<string> {
  let data = "";
  process.stdin.setEncoding("utf-8");
  for await (const chunk of process.stdin) data += chunk;
  return data;
}
