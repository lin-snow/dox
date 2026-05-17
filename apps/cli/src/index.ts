#!/usr/bin/env bun
import { Command } from "commander";

import * as auth from "./cli/auth";
import * as todo from "./cli/todo";

const args = process.argv.slice(2);

// TTY without subcommand → launch TUI mode.
if (args.length === 0 && process.stdout.isTTY) {
  const { runTui } = await import("./tui");
  await runTui();
  process.exit(0);
}

type CommandSpec = {
  name: string;
  description: string;
  alias?: string;
  requiredOption?: [flag: string, description: string];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: (this: Command, ...args: any[]) => Promise<void>;
};

// Each entry maps 1:1 to a `program.command(...)`. Handlers receive
// Commander's parsed positionals followed by `this` bound to the Command
// instance, so `this.optsWithGlobals()` picks up the top-level --json flag.
const commands: CommandSpec[] = [
  {
    name: "login",
    description: "Authenticate to a dox server",
    requiredOption: ["--server <url>", "server URL, e.g. http://localhost:8080"],
    action: auth.login,
  },
  {
    name: "list",
    description: "List all todos, newest first",
    alias: "ls",
    action: async function (this: Command) {
      await todo.list(this.optsWithGlobals());
    },
  },
  {
    name: "add <title>",
    description: "Create a new todo",
    action: async function (this: Command, title: string) {
      await todo.add(title, this.optsWithGlobals());
    },
  },
  {
    name: "get <id>",
    description: "Show a single todo by id",
    action: async function (this: Command, id: string) {
      await todo.get(id, this.optsWithGlobals());
    },
  },
  {
    name: "done <id>",
    description: "Mark a todo as done",
    action: async function (this: Command, id: string) {
      await todo.done(id, this.optsWithGlobals());
    },
  },
  {
    name: "undone <id>",
    description: "Mark a todo as not done",
    action: async function (this: Command, id: string) {
      await todo.undone(id, this.optsWithGlobals());
    },
  },
  {
    name: "edit <id>",
    description: "Edit a todo's title",
    requiredOption: ["--title <text>", "new title"],
    action: async function (this: Command, id: string, opts: { title: string }) {
      await todo.edit(id, opts.title, this.optsWithGlobals());
    },
  },
  {
    name: "rm <id>",
    description: "Delete a todo permanently",
    alias: "del",
    action: async function (this: Command, id: string) {
      await todo.rm(id, this.optsWithGlobals());
    },
  },
];

const program = new Command();
program
  .name("dox")
  .description("Self-hosted personal todo — thin client")
  .version("0.0.0")
  .option("--json", "output JSON for machine consumption");

for (const spec of commands) {
  const cmd = program.command(spec.name).description(spec.description);
  if (spec.alias) cmd.alias(spec.alias);
  if (spec.requiredOption) cmd.requiredOption(...spec.requiredOption);
  cmd.action(spec.action);
}

await program.parseAsync(process.argv);
