import type { ActivityEvent } from "../api";
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

/** Activity as a slide-over: the board stays visible behind it. */
export function ActivitySheet({ events, onRefresh, onClose }: Props) {
  return (
    <>
      <div className="sheet-veil" onClick={onClose} />
      <aside className="sheet" aria-label="activity">
        <header className="sheet-head">
          <h2>Activity</h2>
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
            <p className="col-empty">nothing yet</p>
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
