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
