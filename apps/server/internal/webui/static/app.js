// Minimal dox web client.
//
// Scope: sign in, list todos, add one, tick one off, read one. Anything past
// that belongs in apps/desktop. See webui.go for why this is frozen.
//
// The JWT lives in sessionStorage, not localStorage: it dies with the tab, so
// a shared machine never keeps someone logged in. The page never fetches
// anything but its own origin (CSP enforces it).

const TOKEN_KEY = "dox.token";

const root = document.getElementById("app");

let token = sessionStorage.getItem(TOKEN_KEY) || "";
let info = null; // ServerInfo from the public probe
let me = null; // the caller
let projects = [];
let todos = [];
let detail = null; // fully-fetched todo while the detail view is open
let mode = "login"; // auth tab: "login" | "register"
let notice = ""; // message to show on the next render
let noticeEl = null; // live slot for messages while a form is on screen
let fatal = "";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  let res;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new ApiError("server unreachable", 0);
  }

  if (res.status === 401) {
    // Drop the credential here so the next render lands on the auth view
    // instead of leaving a shell that will 401 on every click.
    token = "";
    me = null;
    sessionStorage.removeItem(TOKEN_KEY);
    throw new ApiError("your session expired — sign in again", 401);
  }

  if (!res.ok) {
    let message = `request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && body.message) message = body.message;
    } catch {
      /* non-JSON error body; keep the status line */
    }
    throw new ApiError(message, res.status);
  }

  return res.status === 204 ? null : res.json();
}

/** Build DOM without innerHTML, so todo text can never become markup. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "on") {
      for (const [event, handler] of Object.entries(value)) {
        node.addEventListener(event, handler);
      }
    } else if (key === "class") {
      node.className = value;
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  }
  return node;
}

// int64 fields arrive as JSON strings because the gateway marshals protobuf.
const num = (value) =>
  value === undefined || value === null ? 0 : Number(value);

function projectById(id) {
  if (!id) return null;
  return projects.find((p) => p.id === id) || null;
}

function byUrgency(a, b) {
  if (a.done !== b.done) return Number(a.done) - Number(b.done);
  const da = a.dueAt ? num(a.dueAt) : Infinity;
  const db = b.dueAt ? num(b.dueAt) : Infinity;
  if (da !== db) return da - db;
  return num(b.createdAt) - num(a.createdAt);
}

function isOverdue(todo) {
  const at = num(todo.dueAt);
  if (!at || todo.done) return false;
  if (todo.dueAllDay) {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return at < midnight.getTime();
  }
  return at < Date.now();
}

function dueLabel(todo) {
  const at = num(todo.dueAt);
  if (!at) return "";
  const allDay = todo.dueAllDay === true;
  const options = allDay
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
  // An all-day deadline is a calendar day in the todo's own zone; render it
  // there so every member sees the same date.
  if (allDay && todo.dueZone) options.timeZone = todo.dueZone;
  try {
    return new Date(at).toLocaleString(undefined, options);
  } catch {
    return new Date(at).toLocaleDateString();
  }
}

function localZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function fail(err) {
  const message = err && err.message ? err.message : String(err);
  if (err && err.status === 401) {
    // api() already cleared the token; go back to the auth view.
    notice = message;
    render();
    return;
  }
  if (noticeEl) {
    noticeEl.textContent = message;
    noticeEl.hidden = false;
    return;
  }
  notice = message;
  render();
}

function render() {
  noticeEl = null;
  document.title = (info && info.serverName) || "dox";

  if (fatal) {
    root.replaceChildren(
      el("div", { class: "card" }, el("p", { class: "err" }, fatal)),
    );
    return;
  }
  if (!token) {
    root.replaceChildren(renderAuth());
    return;
  }
  if (!me) {
    root.replaceChildren(el("p", { class: "loading" }, "connecting…"));
    return;
  }
  root.replaceChildren(renderApp());
}

// ---- auth ----------------------------------------------------------------

function renderAuth() {
  const firstRun = !!(info && !info.hasUsers);
  const registering = firstRun || mode === "register";

  const noticeBox = el(
    "p",
    { class: "err", hidden: notice ? null : true },
    notice,
  );
  noticeEl = noticeBox;

  const title = el("h1", {}, (info && info.serverName) || "dox");
  const subtitle = el(
    "p",
    { class: "sub" },
    firstRun
      ? "this server has no accounts yet — the first one becomes the owner"
      : [
          info && info.ownerName ? `by ${info.ownerName}` : "self-hosted",
          info && info.registrationOpen
            ? " · registration open"
            : info
              ? " · invite only"
              : "",
        ].join(""),
  );

  const userInput = el("input", {
    id: "auth-username",
    name: "username",
    type: "text",
    autocomplete: "username",
    placeholder: "username",
    required: true,
    spellcheck: "false",
  });
  const passInput = el("input", {
    id: "auth-password",
    name: "password",
    type: "password",
    autocomplete: registering ? "new-password" : "current-password",
    placeholder: "password",
    required: true,
  });
  const confirmInput = registering
    ? el("input", {
        id: "auth-confirm",
        name: "confirm",
        type: "password",
        autocomplete: "new-password",
        placeholder: "confirm password",
        required: true,
      })
    : null;
  const inviteInput =
    registering && !firstRun && info && !info.registrationOpen
      ? el("input", {
          id: "auth-invite",
          name: "invite",
          type: "text",
          placeholder: "invite code",
          required: true,
          spellcheck: "false",
        })
      : null;
  const serverInput = firstRun
    ? el("input", {
        id: "auth-server",
        name: "serverName",
        type: "text",
        placeholder: "server name (optional)",
      })
    : null;

  const submit = el(
    "button",
    { class: "btn", type: "submit" },
    registering ? "Create account" : "Sign in",
  );

  const form = el(
    "form",
    {
      class: "stack",
      on: {
        submit: async (event) => {
          event.preventDefault();
          notice = "";
          if (noticeEl) noticeEl.hidden = true;

          if (registering) {
            if (passInput.value.length < 8) {
              fail(new Error("password must be at least 8 characters"));
              return;
            }
            if (confirmInput.value !== passInput.value) {
              fail(new Error("passwords do not match"));
              return;
            }
          }

          const body = registering
            ? {
                userName: userInput.value.trim(),
                password: passInput.value,
                ...(inviteInput
                  ? { inviteCode: inviteInput.value.trim().toUpperCase() }
                  : {}),
                ...(serverInput && serverInput.value.trim()
                  ? { serverName: serverInput.value.trim() }
                  : {}),
              }
            : { userName: userInput.value.trim(), password: passInput.value };

          submit.disabled = true;
          try {
            const res = await api(
              registering ? "/v1/auth/register" : "/v1/auth/login",
              {
                method: "POST",
                body: JSON.stringify(body),
              },
            );
            token = res.token;
            sessionStorage.setItem(TOKEN_KEY, token);
            me = null;
            notice = "";
            render();
            await boot();
          } catch (err) {
            submit.disabled = false;
            fail(err);
          }
        },
      },
    },
    userInput,
    passInput,
    confirmInput,
    inviteInput,
    serverInput,
    submit,
  );

  // A branch picker, not auto-routing: registrationOpen controls whether
  // *registering* needs an invite, never whether the user is signing in.
  // Auto-routing a returning user into register silently creates duplicates.
  const tabs = firstRun
    ? null
    : el(
        "div",
        { class: "tabs", role: "tablist" },
        ["login", "register"].map((value) =>
          el(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": mode === value ? "true" : "false",
              on: {
                click: () => {
                  mode = value;
                  render();
                },
              },
            },
            value === "login" ? "Sign in" : "Create account",
          ),
        ),
      );

  return el("div", { class: "card" }, title, subtitle, tabs, noticeBox, form);
}

// ---- app -----------------------------------------------------------------

function renderApp() {
  const refreshBtn = el(
    "button",
    {
      class: "ghost",
      type: "button",
      on: {
        click: async () => {
          try {
            await refresh();
          } catch (err) {
            fail(err);
          }
        },
      },
    },
    "refresh",
  );
  const signOutBtn = el(
    "button",
    {
      class: "ghost",
      type: "button",
      on: {
        click: () => {
          token = "";
          me = null;
          detail = null;
          todos = [];
          notice = "";
          sessionStorage.removeItem(TOKEN_KEY);
          render();
        },
      },
    },
    "sign out",
  );

  const bar = el(
    "header",
    { class: "bar" },
    el("div", { class: "brand" }, (info && info.serverName) || "dox"),
    el("div", { class: "who" }, me.name, refreshBtn, signOutBtn),
  );

  const noticeBox = el(
    "p",
    { class: "err", hidden: notice ? null : true },
    notice,
  );
  noticeEl = noticeBox;

  return el("div", {}, bar, noticeBox, detail ? renderDetail() : renderList());
}

function renderList() {
  const titleInput = el("input", {
    id: "new-title",
    name: "title",
    type: "text",
    placeholder: "add a todo…",
    required: true,
    "aria-label": "new todo title",
  });
  const projectSelect = el(
    "select",
    { id: "new-project", name: "project", "aria-label": "project" },
    el("option", { value: "" }, "Inbox"),
    projects.map((p) => el("option", { value: p.id }, p.name)),
  );
  const dueInput = el("input", {
    id: "new-due",
    name: "due",
    type: "date",
    "aria-label": "due date",
  });

  const form = el(
    "form",
    {
      class: "add",
      on: {
        submit: async (event) => {
          event.preventDefault();
          const value = titleInput.value.trim();
          if (!value) return;
          try {
            await create(value, projectSelect.value, dueInput.value);
            titleInput.value = "";
            dueInput.value = "";
            await refresh();
          } catch (err) {
            fail(err);
          }
        },
      },
    },
    titleInput,
    projectSelect,
    dueInput,
    el("button", { class: "btn", type: "submit" }, "Add"),
  );

  const rows = todos.map((todo) => {
    const check = el("input", {
      type: "checkbox",
      class: "check",
      "aria-label": todo.done ? "mark open" : "mark done",
      on: {
        change: async () => {
          try {
            await toggle(todo);
          } catch (err) {
            fail(err);
          }
        },
      },
    });
    check.checked = todo.done;

    const project = projectById(todo.projectId);
    const overdue = isOverdue(todo);

    return el(
      "li",
      { class: todo.done ? "row done" : "row" },
      check,
      el(
        "button",
        {
          class: "title",
          type: "button",
          on: {
            click: async () => {
              try {
                detail = await api(`/v1/todos/${encodeURIComponent(todo.id)}`);
                render();
              } catch (err) {
                fail(err);
              }
            },
          },
        },
        todo.title,
      ),
      project ? el("span", { class: "chip" }, project.name) : null,
      todo.dueAt
        ? el(
            "span",
            { class: overdue ? "meta overdue" : "meta" },
            dueLabel(todo),
          )
        : null,
    );
  });

  const list =
    rows.length > 0
      ? el("ul", { class: "list" }, rows)
      : el(
          "p",
          { class: "empty" },
          "nothing here yet — add your first todo above",
        );

  return el("div", {}, form, list);
}

function renderDetail() {
  const todo = detail;
  const project = projectById(todo.projectId);

  return el(
    "section",
    { class: "detail" },
    el(
      "button",
      {
        class: "ghost",
        type: "button",
        on: {
          click: () => {
            detail = null;
            render();
          },
        },
      },
      "← back",
    ),
    el("h2", {}, todo.title),
    el(
      "div",
      { class: "chips" },
      el("span", { class: "chip" }, project ? project.name : "Inbox"),
      todo.dueAt ? el("span", { class: "chip" }, dueLabel(todo)) : null,
      el("span", { class: "chip" }, todo.done ? "done" : "open"),
      el(
        "span",
        { class: "chip" },
        `updated ${new Date(num(todo.updatedAt)).toLocaleString()}`,
      ),
    ),
    todo.description
      ? el("pre", { class: "desc" }, todo.description)
      : el("p", { class: "hint" }, "no description"),
    el(
      "div",
      { class: "actions" },
      el(
        "button",
        {
          class: "btn",
          type: "button",
          on: {
            click: async () => {
              try {
                await toggle(todo);
              } catch (err) {
                fail(err);
              }
            },
          },
        },
        todo.done ? "Mark open" : "Mark done",
      ),
    ),
  );
}

// ---- data ----------------------------------------------------------------

async function create(title, projectId, dueDate) {
  const body = { title };
  if (projectId) body.projectId = projectId;
  if (dueDate) {
    // Local midnight, matching parseWhen() in packages/core: an all-day
    // deadline is a calendar day in the caller's zone. The zone is pinned so
    // members elsewhere render the same date.
    body.dueAt = new Date(`${dueDate}T00:00:00`).getTime();
    body.dueAllDay = true;
    body.dueZone = localZone();
    // No remindAt on purpose: this page does not own scheduling policy, and
    // an all-day todo without it simply fires no reminder.
  }
  await api("/v1/todos", { method: "POST", body: JSON.stringify(body) });
}

async function toggle(todo) {
  // Field-level patch: send only `done` so a concurrent edit to the title or
  // description by another client is never clobbered.
  const updated = await api(`/v1/todos/${encodeURIComponent(todo.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ done: !todo.done }),
  });
  if (detail && detail.id === updated.id) detail = updated;
  await refresh();
}

async function refresh() {
  const [list, projectList] = await Promise.all([
    api("/v1/todos"),
    api("/v1/projects"),
  ]);
  todos = (list.todos || []).slice().sort(byUrgency);
  projects = (projectList.projects || []).filter((p) => !p.archived);
  // The list endpoint omits descriptions, so a dropped row means the open
  // detail is gone (deleted elsewhere) and should close.
  if (detail && !todos.some((t) => t.id === detail.id)) detail = null;
  render();
}

async function boot() {
  fatal = "";
  render();

  try {
    info = await api("/v1/auth/server-info");
  } catch (err) {
    fatal = `cannot reach the server — ${err.message}`;
    render();
    return;
  }

  if (!token) {
    render();
    return;
  }

  try {
    me = await api("/v1/me");
  } catch (err) {
    notice = err.message;
    render();
    return;
  }

  try {
    await refresh();
  } catch (err) {
    fail(err);
  }
}

// Coming back to the tab after another client changed something: re-read
// rather than inventing push, which this server does not have.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && token && me) {
    refresh().catch(fail);
  }
});

boot();
