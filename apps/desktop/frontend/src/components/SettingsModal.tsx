import { useEffect, useRef, useState } from "react";

import type { Prefs, Project, Session } from "../api";
import { useDialog } from "../dialog";
import { buildLabel } from "../format";
import { projectTint } from "../tint";
import { IconClose } from "./Icons";

interface Props {
  session: Session;
  prefs: Prefs;
  projects: Project[];
  canManageProjects: boolean;
  onPrefs: (patch: Partial<Prefs>) => Promise<void>;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onArchiveProject: (id: string) => Promise<void>;
  onRestoreProject: (id: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onSignOut: () => Promise<void>;
  onChangeServer: () => Promise<void>;
  onClose: () => void;
}

export function SettingsModal({
  session,
  prefs,
  projects,
  canManageProjects,
  onPrefs,
  onRenameProject,
  onArchiveProject,
  onRestoreProject,
  onDeleteProject,
  onSignOut,
  onChangeServer,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const { ref: dialogRef, onKeyDown } = useDialog<HTMLDivElement>();
  /** Fade the last visible row only while there is more to scroll: a permanent
   * mask would wash out the bottom of a modal that fits. */
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const update = () =>
      setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    update();
    el.addEventListener("scroll", update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        ref={dialogRef}
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h2 id="settings-title">Settings</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="close"
            onClick={onClose}
          >
            <IconClose size={15} />
          </button>
        </header>

        <div className="modal-body" ref={bodyRef} data-more={more || undefined}>
          <section className="setting">
            <h3>Server</h3>
            <p className="value">{session.server}</p>
            <div className="row-actions">
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => void run(onChangeServer)}
              >
                Change server
              </button>
            </div>
          </section>

          <section className="setting">
            <h3>Account</h3>
            <p className="value">
              {session.user?.name} · {session.user?.role}
            </p>
            <div className="row-actions">
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => void run(onSignOut)}
              >
                Sign out
              </button>
            </div>
          </section>

          <section className="setting">
            <h3>Notifications</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={prefs.notificationsEnabled}
                onChange={(event) =>
                  void onPrefs({ notificationsEnabled: event.target.checked })
                }
              />
              <span>Desktop notifications for due reminders</span>
            </label>
            <p className="hint">
              Reminders come from your server, so they still arrive while dox is
              in the menu bar.
            </p>
          </section>

          <section className="setting">
            <h3>Board</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={prefs.showCompleted}
                onChange={(event) =>
                  void onPrefs({ showCompleted: event.target.checked })
                }
              />
              <span>Show completed todos</span>
            </label>
            <p className="hint">
              Off keeps finished work out of the columns. Nothing is deleted:
              turn this back on to see it again, or press ⌘K to search it.
            </p>
          </section>

          <section className="setting">
            <h3>Projects</h3>
            {projects.length === 0 ? (
              <p className="hint">No projects yet</p>
            ) : null}
            {projects
              .filter((project) => !project.archived)
              .map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  order={projects}
                  editable={canManageProjects}
                  onRename={onRenameProject}
                  onArchive={onArchiveProject}
                  onRestore={onRestoreProject}
                  onDelete={onDeleteProject}
                />
              ))}

            {projects.some((project) => project.archived) ? (
              <>
                <h3 className="sub-head">Archived</h3>
                {projects
                  .filter((project) => project.archived)
                  .map((project) => (
                    <ProjectRow
                      key={project.id}
                      project={project}
                      order={projects}
                      editable={canManageProjects}
                      onRename={onRenameProject}
                      onArchive={onArchiveProject}
                      onRestore={onRestoreProject}
                      onDelete={onDeleteProject}
                    />
                  ))}
              </>
            ) : null}

            {!canManageProjects ? (
              <p className="hint">
                Only the server owner can rename, archive or delete projects.
              </p>
            ) : null}
          </section>
        </div>

        <footer className="modal-foot">
          <span className="meta">dox desktop{buildLabel(session.version)}</span>
        </footer>
      </div>
    </div>
  );
}

interface RowProps {
  project: Project;
  order: Project[];
  editable: boolean;
  onRename: (id: string, name: string) => Promise<void>;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}

function ProjectRow({
  project,
  order,
  editable,
  onRename,
  onArchive,
  onRestore,
  onDelete,
}: RowProps) {
  const [name, setName] = useState(project.name);
  /** Deleting a project deletes its todos, so it takes two clicks. */
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="project-row">
      <i className="ring" style={projectTint(project, order)} />
      <input
        id={`project-${project.id}`}
        name="projectName"
        value={name}
        disabled={!editable}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          const value = name.trim();
          if (!value) setName(project.name);
          else if (value !== project.name) void onRename(project.id, value);
        }}
        aria-label={`rename ${project.name}`}
        spellCheck={false}
      />
      {editable ? (
        <div className="row-buttons">
          <button
            type="button"
            className="link"
            onClick={() =>
              project.archived ? onRestore(project.id) : onArchive(project.id)
            }
          >
            {project.archived ? "Restore" : "Archive"}
          </button>
          {confirming ? (
            <button
              type="button"
              className="link danger"
              onClick={() => void onDelete(project.id)}
            >
              its todos go too — delete?
            </button>
          ) : (
            <button
              type="button"
              className="link danger"
              onClick={() => setConfirming(true)}
              onBlur={() => setConfirming(false)}
            >
              Delete
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
