import type { ActivityEvent } from "../api";
import { useDialog } from "../dialog";
import { sinceLabel } from "../format";
import { IconClose, IconRefresh } from "./Icons";

const VERB: Record<string, string> = {
  todo_created: "created",
  todo_completed: "completed",
  member_joined: "joined",
};

interface Props {
  events: ActivityEvent[];
  onRefresh: () => void;
  onClose: () => void;
}

/** Activity as a slide-over: the board stays visible behind it. Visually it is
 * a panel, semantically it is a dialog — aria-modal is what tells AT to stay
 * inside, and focus has to follow the same rule. */
export function ActivitySheet({ events, onRefresh, onClose }: Props) {
  const { ref, onKeyDown } = useDialog<HTMLElement>();

  return (
    <>
      <div className="sheet-veil" onClick={onClose} />
      <aside
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-title"
        ref={ref}
        onKeyDown={onKeyDown}
      >
        <header className="sheet-head">
          <h2 id="activity-title">Activity</h2>
          <div className="sheet-actions">
            <button
              type="button"
              aria-label="refresh"
              title="refresh"
              onClick={onRefresh}
            >
              <IconRefresh size={16} />
            </button>
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
          {events.length === 0 ? (
            <p className="col-empty">No activity yet</p>
          ) : (
            events.map((event) => (
              <article key={event.id} className="event">
                <p className="event-line">
                  <strong>{event.actorName}</strong>{" "}
                  <span className="event-verb">
                    {VERB[event.verb] ?? event.verb}
                  </span>{" "}
                  <span className="event-target">{event.targetLabel}</span>
                </p>
                <p className="event-meta">
                  {[event.projectName, sinceLabel(event.createdAt)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </article>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
