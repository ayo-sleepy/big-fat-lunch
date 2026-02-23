import {
  resolveToEntryId,
  getPathOfEntryId,
  listDir,
  mkdirp,
  touch,
  rmPath,
  mvPath,
  cpPath,
} from "./fsOps.js";
import { readEntryData, writeEntryData } from "./fatOps.js";
import { getDb } from "../data/data.js";
import { commanderBus } from "./commanderBus.js";

function push(line) {
  commanderBus.push(line);
}

export function pushLine(line) {
  commanderBus.push(line);
}

export function runCommand(cwdId, line) {
  const tokens = tokenize(line);
  if (tokens.length === 0) return;

  const [cmd, ...rest] = tokens;
  const flags = new Set();
  const args = [];
  for (const t of rest) {
    if (t.startsWith("-")) flags.add(t);
    else args.push(t);
  }

  return execute(cwdId, cmd, args, flags);
}

function tokenize(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

function execute(cwdId, cmd, args, flags) {
  if (cmd === "help") {
    push("write <path> <text...>");
    push("cat <path>");
    push("mkdir <path>");
    push("touch <path>");
    push("rm [-r] <path>");
    push("mv <src> <dst>");
    push("cp [-r] <src> <dst>");
    push("ls [path]");
    push("cd [path]");
    push("pwd");
    push("clear");
    return { success: true };
  }

  if (cmd === "clear") {
    return { success: true, clear: true };
  }

  if (cmd === "pwd") {
    const path = getPathOfEntryId(cwdId);
    push(path);
    return { success: true };
  }

  if (cmd === "ls") {
    const target = args[0] ?? ".";
    const id = resolveToEntryId(cwdId, target);
    const rows = listDir(id);
    for (const r of rows) push(r);
    return { success: true };
  }

  if (cmd === "cd") {
    const target = args[0] ?? "X:/";
    const id = resolveToEntryId(cwdId, target);
    const path = getPathOfEntryId(id);
    return { success: true, newCwdId: id, newPath: path };
  }

  if (cmd === "cat") {
    if (!args[0]) throw new Error("cat: missing operand");
    const { entries } = getDb();
    const id = resolveToEntryId(cwdId, args[0]);
    const entry = entries.findOne({ id });
    if (!entry || entry.deleted) throw new Error("cat: not found");
    if (entry.type !== "file") throw new Error("cat: not a file");
    const text = readEntryData(entry.id);
    const lines = String(text).split("\n");
    for (const l of lines) push(l);
    return { success: true };
  }

  if (cmd === "mkdir") {
    if (!args[0]) throw new Error("mkdir: missing operand");
    mkdirp(cwdId, args[0]);
    return { success: true };
  }

  if (cmd === "touch") {
    if (!args[0]) throw new Error("touch: missing operand");
    touch(cwdId, args[0]);
    return { success: true };
  }

  if (cmd === "write") {
    if (!args[0]) throw new Error("write: missing operand");
    const text = args.slice(1).join(" ");
    const id = resolveToEntryId(cwdId, args[0]);
    writeEntryData(id, text);
    return { success: true };
  }

  if (cmd === "rm") {
    if (!args[0]) throw new Error("rm: missing operand");
    const recursive = flags.has("-r") || flags.has("-rf") || flags.has("-fr");
    rmPath(cwdId, args[0], { recursive });
    return { success: true };
  }

  if (cmd === "mv") {
    if (!args[0] || !args[1]) throw new Error("mv: missing operand");
    mvPath(cwdId, args[0], args[1]);
    return { success: true };
  }

  if (cmd === "cp") {
    if (!args[0] || !args[1]) throw new Error("cp: missing operand");
    const recursive = flags.has("-r") || flags.has("-R");
    cpPath(cwdId, args[0], args[1], { recursive });
    return { success: true };
  }

  throw new Error(`unknown command: ${cmd}`);
}

export function getPath(cwdId) {
  return getPathOfEntryId(cwdId);
}
