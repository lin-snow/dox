import { render } from "ink-testing-library";
import type { ReactElement } from "react";

export function mount(ui: ReactElement) {
  const inst = render(ui);
  return {
    ...inst,
    /** Synchronous stdin write — keystrokes don't need awaiting on their own. */
    press: (keys: string) => inst.stdin.write(keys),
    /**
     * Poll `predicate(lastFrame)` until it returns true or `timeoutMs` elapses.
     * Each iteration yields via `setImmediate` (one IO-callback boundary), which
     * is enough to let Ink commit + write the next frame on Node and Bun.
     * Failure includes the last rendered frame so the cause is visible without
     * re-running with a debugger.
     */
    settle: (predicate: (frame: string) => boolean, timeoutMs = 3000) =>
      waitForFrame(inst.lastFrame, predicate, timeoutMs),
  };
}

async function waitForFrame(
  getFrame: () => string | undefined,
  predicate: (frame: string) => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate(getFrame() ?? "")) {
      for (let i = 0; i < 5; i++) {
        await new Promise<void>((r) => setImmediate(r));
      }
      return;
    }
    await new Promise<void>((r) => setImmediate(r));
  }
  if (predicate(getFrame() ?? "")) return;
  throw new Error(
    `settle: predicate never satisfied within ${timeoutMs}ms\n` +
      `last frame:\n${getFrame() ?? "(no frame)"}`,
  );
}
