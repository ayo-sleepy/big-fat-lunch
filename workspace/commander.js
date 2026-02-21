import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import chalk from "chalk";
import {
  mkdirp,
  touch,
  rmPath,
  mvPath,
  cpPath,
  listDir,
  resolveToEntryId,
  getPathOfEntryId,
  readEntryData,
} from "../workspace/fsOps.js";

const COMMANDS = new Set([
  "write",
  "mkdir",
  "touch",
  "rm",
  "mv",
  "cp",
  "ls",
  "cd",
  "pwd",
  "help",
  "exit",
  "quit",
  "clear",
]);

function tokenize(line) {
  const parts = line.trim().split(/\s+/).filter(Boolean);
  return parts;
}

function parseArgs(tokens) {
  const [cmd, ...rest] = tokens;
  const flags = new Set();
  const args = [];
  for (const t of rest) {
    if (t.startsWith("-")) flags.add(t);
    else args.push(t);
  }
  return { cmd, flags, args };
}

function formatPrompt(cwdPath) {
  return chalk.gray(`${cwdPath} `) + chalk.cyan("$ ");
}

function helpText() {
  return [
    "Commands:",
    "  mkdir <path>",
    "  touch <path>",
    "  rm [-r] <path>",
    "  mv <src> <dst>",
    "  cp [-r] <src> <dst>",
    "  ls [path]",
    "  cd [path]",
    "  pwd",
    "  clear",
    "  exit",
  ].join("\n");
}

export async function startCommander() {
  const rl = readline.createInterface({ input, output });
  let cwdId = "root";

  while (true) {
    const cwdPath = getPathOfEntryId(cwdId);
    const line = await rl.question(formatPrompt(cwdPath));
    const trimmed = line.trim();
    if (!trimmed) continue;

    const tokens = tokenize(trimmed);
    const { cmd, flags, args } = parseArgs(tokens);

    if (!COMMANDS.has(cmd)) {
      console.log(chalk.red(`Unknown command: ${cmd}`));
      console.log(chalk.gray('Type "help"'));
      continue;
    }

    try {
      if (cmd === "help") {
        console.log(helpText());
        continue;
      }

      if (cmd === "clear") {
        console.clear();
        continue;
      }

      if (cmd === "exit" || cmd === "quit") break;

      if (cmd === "pwd") {
        console.log(getPathOfEntryId(cwdId));
        continue;
      }

      if (cmd === "ls") {
        const target = args[0] ?? ".";
        const targetId = resolveToEntryId(cwdId, target);
        const rows = listDir(targetId);
        if (rows.length === 0) continue;
        for (const row of rows) console.log(row);
        continue;
      }

      if (cmd === "cd") {
        const target = args[0] ?? "/";
        const targetId = resolveToEntryId(cwdId, target);
        cwdId = targetId;
        continue;
      }

      if (cmd === "mkdir") {
        if (!args[0]) throw new Error("mkdir: missing operand");
        mkdirp(cwdId, args[0]);
        continue;
      }

      if (cmd === "touch") {
        if (!args[0]) throw new Error("touch: missing operand");
        touch(cwdId, args[0]);
        continue;
      }

      if (cmd === "rm") {
        if (!args[0]) throw new Error("rm: missing operand");
        const recursive =
          flags.has("-r") || flags.has("-rf") || flags.has("-fr");
        rmPath(cwdId, args[0], { recursive });
        continue;
      }

      if (cmd === "mv") {
        if (!args[0] || !args[1]) throw new Error("mv: missing operand");
        mvPath(cwdId, args[0], args[1]);
        continue;
      }

      if (cmd === "cp") {
        if (!args[0] || !args[1]) throw new Error("cp: missing operand");
        const recursive = flags.has("-r") || flags.has("-R");
        cpPath(cwdId, args[0], args[1], { recursive });
        continue;
      }
    } catch (e) {
      console.log(chalk.red(e.message || String(e)));
    }
  }

  rl.close();
}
