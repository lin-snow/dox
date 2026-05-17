// Compact relative-time string (`2m`, `1h`, `3d`, `2w`). Tolerates the
// grpc-gateway string-encoded int64s by accepting `unknown`.
export function relativeTime(now: number, raw: unknown): string {
  const ms = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : 0;
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const diffMs = Math.max(0, now - ms);
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

// Map project color names → ink color names. Free-form project.color from the
// server falls back to muted so unknown values render harmlessly.
export function swatchColor(raw: string | undefined): string {
  if (!raw) return "gray";
  const known: Record<string, string> = {
    red: "red",
    green: "green",
    yellow: "yellow",
    blue: "blue",
    cyan: "cyan",
    magenta: "magenta",
    orange: "yellow",
    purple: "magenta",
    pink: "magentaBright",
  };
  return known[raw.toLowerCase()] ?? "gray";
}
