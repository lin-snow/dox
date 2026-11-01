import { useState } from "react";

import type { Prefs, Project, Session } from "../api";
import { IconClose } from "./Icons";

interface Props {
  session: Session;
  prefs: Prefs;
  projects: Project[];
  canManageProjects: boolean;
  onPrefs: (patch: Partial<Prefs>) => Promise<void>;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onArchiveProject: (id: string) => Promise<void>;
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
  onSignOut,
  onChangeServer,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false);

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
        aria-label="settings"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h2>Settings</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="close"
            onClick={onClose}
          >
            <IconClose size={15} />
          </button>
        </header>

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
            Reminders are polled from the server, so they arrive even when the
            window is closed to the tray.
          </p>
        </section>

        <section className="setting">
          <h3>Projects</h3>
          {projects.length === 0 ? (
            <p className="hint">no projects yet</p>
          ) : null}
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              editable={canManageProjects}
              onRename={onRenameProject}
              onArchive={onArchiveProject}
            />
          ))}
          {!canManageProjects ? (
            <p className="hint">
              only the owner can rename or archive projects
            </p>
          ) : null}
        </section>

        <footer className="modal-foot">
          <span className="meta">dox desktop · {session.version}</span>
        </footer>
      </div>
    </div>
  );
}

interface RowProps {
  project: Project;
  editable: boolean;
  onRename: (id: string, name: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
}

function ProjectRow({ project, editable, onRename, onArchive }: RowProps) {
  const [name, setName] = useState(project.name);

  return (
    <div className="project-row">
      <span
        className="dot"
        style={{ background: project.color || "#517da1" }}
      />
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
        <button
          type="button"
          className="link"
          onClick={() => void onArchive(project.id)}
        >
          archive
        </button>
      ) : null}
    </div>
  );
}
