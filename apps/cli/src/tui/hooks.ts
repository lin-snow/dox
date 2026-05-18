import { useEffect, useState } from "react";
import { useStdout } from "ink";

// Ink's useStdout returns the stdout handle but does NOT re-render on SIGWINCH.
// Subscribe to the resize event so layout-dependent values reflow when the user
// resizes the terminal — without this, panels render at their mount-time width
// and the screen tears on resize.
export function useTerminalSize(): { cols: number; rows: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState(() => ({
    cols: stdout?.columns ?? 100,
    rows: stdout?.rows ?? 40,
  }));

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setSize({ cols: stdout.columns, rows: stdout.rows });
    };
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  return size;
}

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
