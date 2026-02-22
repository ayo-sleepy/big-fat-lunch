import chalk from "chalk";
import { getDb, logEvent } from "../data/data.js";
import { allocateChain, freeChain, cloneChainData } from "./fatOps.js";

function now() {
  return Date.now();
}

function splitPath(rawPath) {
  const raw = String(rawPath ?? "").trim();
  const isAbs = raw.startsWith("X:/");
  const parts = raw.split("X:/").filter(Boolean);
  return { isAbs, parts };
}

function normalizeParts(parts) {
  const out = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out;
}

function assertNameOk(name) {
  if (!name) throw new Error("Invalid name");
  if (name.includes("/")) throw new Error("Invalid name");
  if (name === "." || name === "..") throw new Error("Invalid name");
}

function nextId(prefix) {
  return `${prefix}_${now()}_${Math.random().toString(16).slice(2)}`;
}

function getEntryOrThrow(entries, id) {
  const e = entries.findOne({ id });
  if (!e || e.deleted) throw new Error("No such file or directory");
  return e;
}

function isDir(entry) {
  return entry.type === "dir";
}

function isFile(entry) {
  return entry.type === "file";
}

function ensureDir(entries, id) {
  const e = getEntryOrThrow(entries, id);
  if (!isDir(e)) throw new Error("Not a directory");
  return e;
}

function findChild(entries, parentId, name) {
  return entries.findOne({ parentId, name, deleted: false });
}

export function resolveToEntryId(cwdId, path) {
  const { entries } = getDb();
  if (path === "X:/" || path === "") return "root";

  const { isAbs, parts } = splitPath(path);
  const normalized = normalizeParts(parts);
  const startId = isAbs ? "root" : cwdId;

  let currentId = startId;
  for (const part of normalized) {
    const cur = getEntryOrThrow(entries, currentId);
    if (!isDir(cur)) throw new Error("Not a directory");

    const child = findChild(entries, currentId, part);
    if (!child) throw new Error("No such file or directory");
    currentId = child.id;
  }

  return currentId;
}

function resolveParentAndName(cwdId, path) {
  const { entries } = getDb();
  const { isAbs, parts } = splitPath(path);
  const normalized = normalizeParts(parts);
  if (normalized.length === 0) throw new Error("Invalid path");

  const name = normalized[normalized.length - 1];
  assertNameOk(name);

  const parentParts = normalized.slice(0, -1);
  const startId = isAbs ? "root" : cwdId;

  let parentId = startId;
  for (const part of parentParts) {
    const cur = getEntryOrThrow(entries, parentId);
    if (!isDir(cur)) throw new Error("Not a directory");

    const child = findChild(entries, parentId, part);
    if (!child) throw new Error("No such file or directory");
    if (!isDir(child)) throw new Error("Not a directory");

    parentId = child.id;
  }

  return { parentId, name };
}

function getPathOfEntry(entries, entryId) {
  const entry = getEntryOrThrow(entries, entryId);
  if (entry.id === "root") return "X:/";

  const names = [];
  let cur = entry;
  while (cur && cur.id !== "root") {
    names.push(cur.name);
    cur = getEntryOrThrow(entries, cur.parentId);
  }
  names.reverse();
  return `X:/${names.join("/")}`;
}

export function getPathOfEntryId(entryId) {
  const { entries } = getDb();
  return getPathOfEntry(entries, entryId);
}

function sortEntries(a, b) {
  if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

export function listDir(dirId) {
  const { entries } = getDb();
  const dir = ensureDir(entries, dirId);

  const children = entries
    .find({ parentId: dir.id, deleted: false })
    .sort(sortEntries);

  return children.map((e) => {
    const tag = e.type === "dir" ? chalk.blue("dir ") : chalk.gray("file");
    const size =
      e.type === "file"
        ? chalk.gray(String(e.size ?? 0).padStart(6, " "))
        : chalk.gray("      ");
    const fc = chalk.gray(String(e.firstCluster ?? 0).padStart(4, " "));
    return `${tag} ${size} fc:${fc} ${e.name}`;
  });
}

function allocOneClusterForEntry(entryId) {
  const { entries } = getDb();
  const entry = getEntryOrThrow(entries, entryId);

  if (entry.firstCluster && entry.firstCluster >= 2) return entry;

  const alloc = allocateChain({ ownerEntryId: entry.id, clustersCount: 1 });
  entry.firstCluster = alloc.firstCluster;
  entry.updatedAt = now();
  entries.update(entry);
  return entry;
}

export function mkdirp(cwdId, path) {
  const { entries } = getDb();
  const { parentId, name } = resolveParentAndName(cwdId, path);
  ensureDir(entries, parentId);

  const exists = findChild(entries, parentId, name);
  if (exists) throw new Error("mkdir: already exists");

  const id = nextId("dir");
  entries.insert({
    id,
    parentId,
    name,
    type: "dir",
    attrs: { readonly: false, hidden: false, system: false, archive: false },
    size: 0,
    firstCluster: 0,
    createdAt: now(),
    updatedAt: now(),
    deleted: false,
  });

  allocOneClusterForEntry(id);

  logEvent({
    action: "MKDIR",
    message: `mkdir ${getPathOfEntry(entries, parentId)}/${name}`.replace(
      "//",
      "/",
    ),
    highlightEntries: [id, parentId],
  });
}

export function touch(cwdId, path) {
  const { entries } = getDb();
  const { parentId, name } = resolveParentAndName(cwdId, path);
  ensureDir(entries, parentId);

  const existing = findChild(entries, parentId, name);
  if (existing) {
    existing.updatedAt = now();
    entries.update(existing);

    if (existing.type === "file") allocOneClusterForEntry(existing.id);

    logEvent({
      action: "TOUCH",
      message: `touch ${getPathOfEntry(entries, existing.id)}`,
      highlightEntries: [existing.id],
    });
    return;
  }

  const id = nextId("file");
  entries.insert({
    id,
    parentId,
    name,
    type: "file",
    attrs: { readonly: false, hidden: false, system: false, archive: true },
    size: 0,
    firstCluster: 0,
    createdAt: now(),
    updatedAt: now(),
    deleted: false,
  });

  allocOneClusterForEntry(id);

  logEvent({
    action: "TOUCH",
    message: `touch ${getPathOfEntry(entries, parentId)}/${name}`.replace(
      "//",
      "/",
    ),
    highlightEntries: [id, parentId],
  });
}

function dirHasChildren(entries, dirId) {
  return entries.findOne({ parentId: dirId, deleted: false }) != null;
}

function freeEntryStorage(entry) {
  const { entries } = getDb();
  if (entry.firstCluster) freeChain({ firstCluster: entry.firstCluster });
  entry.firstCluster = 0;
  entry.size = 0;
  entry.updatedAt = now();
  entries.update(entry);
}

function removeRecursive(entryId) {
  const { entries } = getDb();
  const entry = getEntryOrThrow(entries, entryId);

  if (isDir(entry)) {
    const children = entries.find({ parentId: entry.id, deleted: false });
    for (const c of children) removeRecursive(c.id);
    freeEntryStorage(entry);
    entry.deleted = true;
    entry.updatedAt = now();
    entries.update(entry);
    return;
  }

  freeEntryStorage(entry);
  entry.deleted = true;
  entry.updatedAt = now();
  entries.update(entry);
}

export function rmPath(cwdId, path, { recursive } = {}) {
  const { entries } = getDb();
  const targetId = resolveToEntryId(cwdId, path);
  if (targetId === "root") throw new Error("rm: cannot remove root");

  const target = getEntryOrThrow(entries, targetId);

  if (isDir(target) && dirHasChildren(entries, target.id) && !recursive) {
    throw new Error("rm: directory not empty (use -r)");
  }

  if (recursive) {
    removeRecursive(target.id);
  } else {
    freeEntryStorage(target);
    target.deleted = true;
    target.updatedAt = now();
    entries.update(target);
  }

  logEvent({
    action: "RM",
    message: `rm ${path}`,
    highlightEntries: [target.id],
  });
}

function resolveMoveDestination(cwdId, dstPath) {
  const { entries } = getDb();
  const dstId = resolveToEntryId(cwdId, dstPath);
  const dstEntry = getEntryOrThrow(entries, dstId);

  if (isDir(dstEntry)) return { parentId: dstEntry.id, name: null };

  const { parentId, name } = resolveParentAndName(cwdId, dstPath);
  ensureDir(entries, parentId);
  return { parentId, name };
}

function assertNoMoveIntoSelf(entries, entryId, newParentId) {
  let cur = newParentId;
  while (cur) {
    if (cur === entryId) throw new Error("mv: cannot move into itself");
    const e = entries.findOne({ id: cur });
    if (!e || e.deleted) break;
    cur = e.parentId;
  }
}

function moveEntry(entryId, newParentId, newName) {
  const { entries } = getDb();
  const entry = getEntryOrThrow(entries, entryId);
  ensureDir(entries, newParentId);
  assertNoMoveIntoSelf(entries, entry.id, newParentId);

  const collision = findChild(entries, newParentId, newName);
  if (collision) throw new Error("mv: target exists");

  entry.parentId = newParentId;
  entry.name = newName;
  entry.updatedAt = now();
  entries.update(entry);
}

export function mvPath(cwdId, srcPath, dstPath) {
  const { entries } = getDb();
  const srcId = resolveToEntryId(cwdId, srcPath);
  if (srcId === "root") throw new Error("mv: cannot move root");

  const src = getEntryOrThrow(entries, srcId);
  const dst = resolveMoveDestination(cwdId, dstPath);

  const name = dst.name ?? src.name;
  moveEntry(src.id, dst.parentId, name);

  logEvent({
    action: "MV",
    message: `mv ${srcPath} ${dstPath}`,
    highlightEntries: [src.id, dst.parentId],
  });
}

function createEntryClone(src, dstParentId, dstName) {
  const { entries } = getDb();
  ensureDir(entries, dstParentId);

  const exists = findChild(entries, dstParentId, dstName);
  if (exists) throw new Error("cp: target exists");

  const newId = nextId(src.type);
  entries.insert({
    id: newId,
    parentId: dstParentId,
    name: dstName,
    type: src.type,
    attrs: { ...(src.attrs ?? {}) },
    size: src.type === "file" ? (src.size ?? 0) : 0,
    firstCluster: 0,
    createdAt: now(),
    updatedAt: now(),
    deleted: false,
  });

  if (src.type === "dir") {
    allocOneClusterForEntry(newId);
  } else {
    allocOneClusterForEntry(newId);
    if (src.firstCluster)
      cloneChainData({ srcEntryId: src.id, dstEntryId: newId });
  }

  return newId;
}

function copyTreeRecursive(srcId, dstParentId, dstName) {
  const { entries } = getDb();
  const src = getEntryOrThrow(entries, srcId);

  const newId = createEntryClone(src, dstParentId, dstName);

  if (isDir(src)) {
    const children = entries
      .find({ parentId: src.id, deleted: false })
      .sort(sortEntries);
    for (const c of children) {
      copyTreeRecursive(c.id, newId, c.name);
    }
  }

  return newId;
}

function resolveCopyDestination(cwdId, dstPath) {
  const { entries } = getDb();
  const dstId = resolveToEntryId(cwdId, dstPath);
  const dstEntry = getEntryOrThrow(entries, dstId);

  if (isDir(dstEntry)) return { parentId: dstEntry.id, name: null };

  const { parentId, name } = resolveParentAndName(cwdId, dstPath);
  ensureDir(entries, parentId);
  return { parentId, name };
}

export function cpPath(cwdId, srcPath, dstPath, { recursive } = {}) {
  const { entries } = getDb();
  const srcId = resolveToEntryId(cwdId, srcPath);
  const src = getEntryOrThrow(entries, srcId);

  if (isDir(src) && !recursive)
    throw new Error("cp: omitting directory (use -r)");

  const dst = resolveCopyDestination(cwdId, dstPath);
  const name = dst.name ?? src.name;

  const newId = copyTreeRecursive(src.id, dst.parentId, name);

  logEvent({
    action: "CP",
    message: `cp ${srcPath} ${dstPath}`,
    highlightEntries: [src.id, newId, dst.parentId],
  });
}
