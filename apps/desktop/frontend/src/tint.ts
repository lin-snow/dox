import type { CSSProperties } from "react";

import type { Project } from "./api";

/** Neighbouring projects must not collide, so the palette is indexed by the
 * server's listing order rather than hashed. */
const PALETTE = ["#3f9a51", "#3b83f0", "#c2557a", "#c08a2e", "#5f7f9a"];

export function projectTint(
  project: Project,
  order: Project[] = [],
): CSSProperties {
  if (project.color) return { "--tint": project.color } as CSSProperties;
  const index = order.findIndex((item) => item.id === project.id);
  return {
    "--tint": PALETTE[(index < 0 ? 0 : index) % PALETTE.length],
  } as CSSProperties;
}
