import { IconActivity, IconCheck, IconSearch, IconSliders } from "./Icons";

export type View = "board" | "done";

interface Props {
  view: View;
  /** The board hides completed rows, so the toggle has to say how many there are. */
  doneCount: number;
  onView: (view: View) => void;
  onSearch: () => void;
  onActivity: () => void;
  onSettings: () => void;
}

/** Quiet buttons in the corner — the reference keeps chrome to a minimum, so no
 * title bar text and no toolbar. The Done toggle is the one stateful control:
 * it switches which list the window shows and stays lit while that list is up. */
export function TopBar({
  view,
  doneCount,
  onView,
  onSearch,
  onActivity,
  onSettings,
}: Props) {
  return (
    <div className="topbar">
      <button
        type="button"
        aria-label={`done: ${doneCount}`}
        aria-pressed={view === "done"}
        data-on={view === "done" || undefined}
        title="Done · ⌘D"
        onClick={() => onView(view === "done" ? "board" : "done")}
      >
        <IconCheck size={16} />
      </button>
      <button type="button" aria-label="search" title="⌘K" onClick={onSearch}>
        <IconSearch size={16} />
      </button>
      <button
        type="button"
        aria-label="activity"
        title="activity"
        onClick={onActivity}
      >
        <IconActivity size={16} />
      </button>
      <button
        type="button"
        aria-label="settings"
        title="⌘,"
        onClick={onSettings}
      >
        <IconSliders size={16} />
      </button>
    </div>
  );
}
