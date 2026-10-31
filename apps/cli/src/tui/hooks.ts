import { useEffect, useState } from "react";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Returns a single spinner glyph that cycles while `active` is true. Same
// braille frame set @inkjs/ui Spinner uses, so inline indicators stay visually
// consistent with the larger Spinner widgets elsewhere in the TUI.
export function useSpinnerFrame(active: boolean, intervalMs = 80): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(
      () => setI((v) => (v + 1) % SPINNER_FRAMES.length),
      intervalMs,
    );
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return SPINNER_FRAMES[i] ?? SPINNER_FRAMES[0]!;
}

// Holds `value` at true for at least `holdMs` after it flips to false. Lets
// brief async states (a ~50ms poll round-trip) stay on-screen long enough to
// be perceived — the underlying state still settles immediately, this just
// delays the visual fade-out.
export function useMinHold(value: boolean, holdMs = 400): boolean {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    if (value) {
      setHeld(true);
      return;
    }
    const t = setTimeout(() => setHeld(false), holdMs);
    return () => clearTimeout(t);
  }, [value, holdMs]);
  return held;
}
