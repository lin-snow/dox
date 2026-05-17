import { PassThrough } from "node:stream";

export interface IO {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  debug: (line: string) => void;
}

export const realIO = (): IO => ({
  stdout: process.stdout,
  stderr: process.stderr,
  debug: process.env.DOX_DEBUG
    ? (line) => process.stderr.write(`[dbg] ${line}\n`)
    : () => {},
});

export interface BufferIO {
  io: IO;
  out: PassThrough;
  err: PassThrough;
}

export const bufferIO = (): BufferIO => {
  const out = new PassThrough();
  const err = new PassThrough();
  return {
    io: { stdout: out, stderr: err, debug: () => {} },
    out,
    err,
  };
};
