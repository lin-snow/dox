import { useDialog } from "../dialog";
import { IconClose } from "./Icons";

const KEYS: readonly { keys: string; what: string }[] = [
  { keys: "⌘N · n", what: "New todo" },
  { keys: "⌘K", what: "Search" },
  { keys: "j / k · ↑ / ↓", what: "Move between todos" },
  {
    keys: "Alt+↑ / Alt+↓",
    what: "Move the selected todo up or down its column",
  },
  { keys: "Enter", what: "Open the selected todo" },
  { keys: "Space", what: "Mark done or open" },
  { keys: "⌘R", what: "Refresh" },
  { keys: "⌘,", what: "Settings" },
  { keys: "Esc", what: "Close the open panel" },
  { keys: "?", what: "Show this list" },
];

/** The keyboard is the fast path, but nothing on screen advertises it. That is
 * why the reorder keys are listed here: dragging is the pointer path to the
 * same `reorder()` call, never the only one. */
export function HelpSheet({ onClose }: { onClose: () => void }) {
  const { ref, onKeyDown } = useDialog<HTMLElement>();

  return (
    <>
      <div className="sheet-veil" onClick={onClose} />
      <aside
        className="sheet help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        ref={ref}
        onKeyDown={onKeyDown}
      >
        <header className="sheet-head">
          <h2 id="help-title">Keyboard shortcuts</h2>
          <div className="sheet-actions">
            <button
              type="button"
              aria-label="close"
              title="close"
              onClick={onClose}
            >
              <IconClose size={16} />
            </button>
          </div>
        </header>
        <div className="sheet-body">
          {KEYS.map((row) => (
            <div key={row.keys} className="key-row">
              <kbd>{row.keys}</kbd>
              <span>{row.what}</span>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
