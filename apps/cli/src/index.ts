#!/usr/bin/env bun
import { Command } from "commander";

import { listCommand } from "./cli/list";
import { loginCommand } from "./cli/login";

const args = process.argv.slice(2);

// TTY without subcommand → TUI mode (M3 placeholder for now).
if (args.length === 0 && process.stdout.isTTY) {
  console.error("dox: TUI mode coming in M3. Run 'dox --help' for available commands.");
  process.exit(0);
}

const program = new Command();
program
  .name("dox")
  .description("Self-hosted personal todo — thin client")
  .version("0.0.0");

program
  .command("login")
  .description("Authenticate to a dox server")
  .requiredOption("--server <url>", "server URL, e.g. http://localhost:8080")
  .action(loginCommand);

program
  .command("list")
  .alias("ls")
  .description("List all todos")
  .action(listCommand);

await program.parseAsync(process.argv);
