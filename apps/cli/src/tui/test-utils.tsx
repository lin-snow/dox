import { render } from "ink-testing-library";
import type { ReactElement } from "react";

// Mount an Ink tree under ink-testing-library and add two tiny test verbs.
// We intentionally don't try to "synchronize" with Ink's reconciler — it
// doesn't expose a commit signal — so the integration layer relies on a
// wall-clock poll. Everything that can be tested against pure reducer state
// belongs in state.test.ts instead; this helper exists only for the handful
// of smokes that actually need a live Ink render.
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
      // Drain effects from the just-committed render before returning. Ink's
      // `useInput` subscribes inside useEffect, so a press() fired right after
      // a settle() match would otherwise land before nested input handlers
      // (e.g. a freshly-mounted TextInput inside a freshly-mounted view) are
      // wired up. A small handful of setImmediate boundaries covers the
      // useEffect chain in practice.
      for (let i = 0; i < 5; i++) {
        await new Promise<void>((r) => setImmediate(r));
      }
      return;
    }
    await new Promise<void>((r) => setImmediate(r));
  }
  // One final read: ink may have committed during the last await, after the
  // deadline elapsed but before we exited the loop. Throwing without this
  // check shows a "failure" with a frame that already satisfies the predicate.
  if (predicate(getFrame() ?? "")) return;
  throw new Error(
    `settle: predicate never satisfied within ${timeoutMs}ms\n` +
      `last frame:\n${getFrame() ?? "(no frame)"}`,
  );
}
