#!/usr/bin/env bun
import { Command } from "commander";

import { addCommand } from "./cli/add";
import { doneCommand, undoneCommand } from "./cli/done";
import { editCommand } from "./cli/edit";
import { getCommand } from "./cli/get";
import { listCommand } from "./cli/list";
import { loginCommand } from "./cli/login";
import { rmCommand } from "./cli/rm";

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
  .version("0.0.0")
  .option("--json", "output JSON for machine consumption");

program
  .command("login")
  .description("Authenticate to a dox server")
  .requiredOption("--server <url>", "server URL, e.g. http://localhost:8080")
  .action(loginCommand);

program
  .command("list")
  .alias("ls")
  .description("List all todos, newest first")
  .action(async function (this: Command) {
    await listCommand(this.optsWithGlobals());
  });

program
  .command("add <title>")
  .description("Create a new todo")
  .action(async function (this: Command, title: string) {
    await addCommand(title, this.optsWithGlobals());
  });

program
  .command("get <id>")
  .description("Show a single todo by id")
  .action(async function (this: Command, id: string) {
    await getCommand(id, this.optsWithGlobals());
  });

program
  .command("done <id>")
  .description("Mark a todo as done")
  .action(async function (this: Command, id: string) {
    await doneCommand(id, this.optsWithGlobals());
  });

program
  .command("undone <id>")
  .description("Mark a todo as not done")
  .action(async function (this: Command, id: string) {
    await undoneCommand(id, this.optsWithGlobals());
  });

program
  .command("edit <id>")
  .description("Edit a todo's title")
  .requiredOption("--title <text>", "new title")
  .action(async function (this: Command, id: string, opts: { title: string }) {
    await editCommand(id, opts.title, this.optsWithGlobals());
  });

program
  .command("rm <id>")
  .alias("del")
  .description("Delete a todo permanently")
  .action(async function (this: Command, id: string) {
    await rmCommand(id, this.optsWithGlobals());
  });

await program.parseAsync(process.argv);
