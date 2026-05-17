#!/usr/bin/env bun
import { Command } from "commander";

import * as auth from "./cli/auth";
import * as project from "./cli/project";
import * as server from "./cli/server";
import * as todo from "./cli/todo";
import { VERSION } from "./version";

const args = process.argv.slice(2);

// TTY without subcommand → launch TUI mode.
if (args.length === 0 && process.stdout.isTTY) {
  const { runTui } = await import("./tui");
  await runTui();
  process.exit(0);
}

const program = new Command();
program
  .name("dox")
  .description("Self-hosted personal todo — thin client")
  .version(VERSION)
  .option("--json", "output JSON for machine consumption");

// ── auth ───────────────────────────────────────────────────────────────────
program
  .command("register")
  .description(
    "Create an account on a dox server (first user becomes the owner)",
  )
  .requiredOption("--server <url>", "server URL, e.g. http://localhost:8080")
  .option("--name <username>", "username")
  .option("--password <password>", "password (min 8 chars)")
  .option("--invite <code>", "invite code (required if registration is closed)")
  .action(auth.registerCmd);

program
  .command("login")
  .description("Log in to an existing account on a dox server")
  .requiredOption("--server <url>", "server URL, e.g. http://localhost:8080")
  .option("--name <username>", "username")
  .option("--password <password>", "password")
  .action(auth.loginCmd);

program
  .command("logout")
  .description(
    "Remove local credentials. Server-side token expires on its own.",
  )
  .action(auth.logoutCmd);

program
  .command("passwd")
  .description("Change your password")
  .option("--old <password>", "current password")
  .option("--new <password>", "new password (min 8 chars)")
  .action(function (this: Command) {
    return auth.passwdCmd(this.optsWithGlobals());
  });

program
  .command("accept <code>")
  .description(
    "Accept an invite (joins a project, or registers + joins if not logged in)",
  )
  .option("--server <url>", "server URL (only needed if not logged in)")
  .action(auth.acceptInviteCmd);

// ── todos ──────────────────────────────────────────────────────────────────
program
  .command("list")
  .alias("ls")
  .description("List visible todos (Inbox + all projects you can see)")
  .option("--project <id>", "filter to a project, 'inbox', or 'all'")
  .action(function (this: Command) {
    return todo.list(this.optsWithGlobals());
  });

program
  .command("add <title>")
  .description("Create a new todo")
  .option("--project <id>", "place in a specific project (default: Inbox)")
  .action(function (this: Command, title: string) {
    return todo.add(title, this.optsWithGlobals());
  });

program
  .command("get <id>")
  .description("Show a single todo by id (or unique prefix)")
  .action(function (this: Command, id: string) {
    return todo.get(id, this.optsWithGlobals());
  });

program
  .command("done <id>")
  .description("Mark a todo as done")
  .action(function (this: Command, id: string) {
    return todo.done(id, this.optsWithGlobals());
  });

program
  .command("undone <id>")
  .description("Mark a todo as not done")
  .action(function (this: Command, id: string) {
    return todo.undone(id, this.optsWithGlobals());
  });

program
  .command("edit <id>")
  .description("Edit a todo's title")
  .requiredOption("--title <text>", "new title")
  .action(function (this: Command, id: string, opts: { title: string }) {
    return todo.edit(id, opts.title, this.optsWithGlobals());
  });

program
  .command("rm <id>")
  .alias("del")
  .description("Delete a todo permanently")
  .action(function (this: Command, id: string) {
    return todo.rm(id, this.optsWithGlobals());
  });

// ── projects ───────────────────────────────────────────────────────────────
const proj = program
  .command("project")
  .alias("p")
  .description("Manage projects");
proj
  .command("list")
  .alias("ls")
  .description("List projects you can see")
  .action(function (this: Command) {
    return project.list(this.optsWithGlobals());
  });
proj
  .command("create <name>")
  .description("Create a project (you become its owner)")
  .option("--description <text>")
  .option("--color <code>")
  .action(function (this: Command, name: string) {
    return project.create(name, this.optsWithGlobals());
  });
proj
  .command("rename <id> <name>")
  .description("Rename a project (owner only)")
  .action(function (this: Command, id: string, name: string) {
    return project.rename(id, name, this.optsWithGlobals());
  });
proj
  .command("archive <id>")
  .description("Archive a project (owner only)")
  .action(function (this: Command, id: string) {
    return project.archive(id, this.optsWithGlobals());
  });
proj
  .command("unarchive <id>")
  .description("Unarchive a project (owner only)")
  .action(function (this: Command, id: string) {
    return project.unarchive(id, this.optsWithGlobals());
  });
proj
  .command("rm <id>")
  .description("Delete a project and all its todos (owner only)")
  .action(function (this: Command, id: string) {
    return project.remove(id, this.optsWithGlobals());
  });
proj
  .command("invite <id>")
  .description("Issue an invite code to add someone to the project")
  .option("--role <role>", "editor or viewer", "editor")
  .action(function (this: Command, id: string) {
    return project.invite(id, this.optsWithGlobals());
  });
proj
  .command("members <id>")
  .description("List project members (excludes owner)")
  .action(function (this: Command, id: string) {
    return project.members(id, this.optsWithGlobals());
  });
proj
  .command("member-rm <projectId> <userId>")
  .description("Remove a member from a project (owner only)")
  .action(function (this: Command, projectId: string, userId: string) {
    return project.removeMember(projectId, userId, this.optsWithGlobals());
  });

// ── server (owner-only) ────────────────────────────────────────────────────
const srv = program
  .command("server")
  .description("Server-wide operations (owner-only)");
srv
  .command("me")
  .description("Show the currently logged-in user")
  .action(function (this: Command) {
    return server.me(this.optsWithGlobals());
  });
srv
  .command("users")
  .description("List all users")
  .action(function (this: Command) {
    return server.listUsers(this.optsWithGlobals());
  });
srv
  .command("invite")
  .description(
    "Issue a server-level invite code (brings a new user onto the server)",
  )
  .option("--ttl-ms <ms>", "code lifetime in milliseconds", (v) => Number(v))
  .action(function (this: Command) {
    return server.inviteServer(this.optsWithGlobals());
  });
srv
  .command("set-registration <bool>")
  .description(
    "Toggle open registration: 'true' to allow anyone, 'false' for invite-only",
  )
  .action(function (this: Command, value: string) {
    return server.setRegistrationOpen(value, this.optsWithGlobals());
  });
srv
  .command("set-name <name>")
  .description("Set the server's display name (shown on Onboarding)")
  .action(function (this: Command, name: string) {
    return server.setServerName(name, this.optsWithGlobals());
  });
srv
  .command("set-description <desc>")
  .description("Set the server's one-line description")
  .action(function (this: Command, desc: string) {
    return server.setServerDescription(desc, this.optsWithGlobals());
  });
srv
  .command("reset-password <user-name>")
  .description("Reset a user's password and print a one-time temp password")
  .action(function (this: Command, name: string) {
    return server.resetUserPassword(name, this.optsWithGlobals());
  });

await program.parseAsync(process.argv);
