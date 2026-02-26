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
    return help();
  }

  if (cmd === "clear") {
    return clear();
  }

  if (cmd === "pwd") {
    return pwd(cwdId);
  }

  if (cmd === "ls") {
    return ls(cwdId, args[0]);
  }

  if (cmd === "cd") {
    return changeDirectory(cwdId, args[0] ?? "X:/");
  }

  if (cmd === "cat") {
    return cat(cwdId, args[0]);
  }

  if (cmd === "mkdir") {
    return mkdir(cwdId, args[0]);
  }

  if (cmd === "touch") {
    return touchCmd(cwdId, args[0]);
  }

  if (cmd === "write") {
    return write(cwdId, args[0], args.slice(1).join(" "));
  }

  if (cmd === "rm") {
    return rm(cwdId, args[0], flags);
  }

  if (cmd === "mv") {
    return mv(cwdId, args[0], args[1]);
  }

  if (cmd === "cp") {
    return cp(cwdId, args[0], args[1], flags);
  }

  throw new Error(`unknown command: ${cmd}`);
}

export function help() {
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

export function clear() {
  return { success: true, clear: true };
}

export function pwd(cwdId) {
  const path = getPathOfEntryId(cwdId);
  push(path);
  return { success: true };
}

export function ls(cwdId, target = ".") {
  const id = resolveToEntryId(cwdId, target);
  const rows = listDir(id);
  for (const r of rows) push(r);
  return { success: true };
}

export function changeDirectory(cwdId, target = "X:/") {
  const id = resolveToEntryId(cwdId, target);
  const path = getPathOfEntryId(id);
  return { success: true, newCwdId: id, newPath: path };
}

export function cat(cwdId, path) {
  if (!path) throw new Error("cat: missing operand");
  const { entries } = getDb();
  const id = resolveToEntryId(cwdId, path);
  const entry = entries.findOne({ id });
  if (!entry || entry.deleted) throw new Error("cat: not found");
  if (entry.type !== "file") throw new Error("cat: not a file");
  const text = readEntryData(entry.id);
  const lines = String(text).split("\n");
  for (const l of lines) push(l);
  return { success: true };
}

export function mkdir(cwdId, path) {
  if (!path) throw new Error("mkdir: missing operand");
  mkdirp(cwdId, path);
  return { success: true };
}

export function touchCmd(cwdId, path) {
  if (!path) throw new Error("touch: missing operand");
  touch(cwdId, path);
  return { success: true };
}

export function write(cwdId, path, text) {
  if (!path) throw new Error("write: missing operand");
  const id = resolveToEntryId(cwdId, path);
  writeEntryData(id, text);
  return { success: true };
}

export function rm(cwdId, path, flags) {
  if (!path) throw new Error("rm: missing operand");
  const recursive = flags.has("-r") || flags.has("-rf") || flags.has("-fr");
  rmPath(cwdId, path, { recursive });
  return { success: true };
}

export function mv(cwdId, src, dst) {
  if (!src || !dst) throw new Error("mv: missing operand");
  mvPath(cwdId, src, dst);
  return { success: true };
}

export function cp(cwdId, src, dst, flags) {
  if (!src || !dst) throw new Error("cp: missing operand");
  const recursive = flags.has("-r") || flags.has("-R");
  cpPath(cwdId, src, dst, { recursive });
  return { success: true };
}

export function getPath(cwdId) {
  return getPathOfEntryId(cwdId);
}
