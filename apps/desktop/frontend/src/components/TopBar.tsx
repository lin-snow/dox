import { IconActivity, IconSearch, IconSliders } from "./Icons";

interface Props {
  onSearch: () => void;
  onActivity: () => void;
  onSettings: () => void;
}

/** Three quiet buttons in the corner — the reference keeps chrome to a
 * minimum, so no title bar text and no toolbar. */
export function TopBar({ onSearch, onActivity, onSettings }: Props) {
  return (
    <div className="topbar">
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
