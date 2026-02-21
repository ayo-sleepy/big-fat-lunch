import loki from "lokijs";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const bus = new EventEmitter();

export function onDbChange(handler) {
  bus.on("change", handler);
  return () => bus.off("change", handler);
}

function emitDbChange() {
  bus.emit("change");
}

const DB_DIR = path.join(os.homedir(), "Documents", ".fat-simulator-data");
const DB_FILE = path.join(DB_DIR, "fat-sim.db.json");

let db;
let collections;

function ensureCollections() {
  const volume =
    db.getCollection("volume") ??
    db.addCollection("volume", { unique: ["id"], indices: ["label"] });

  const entries =
    db.getCollection("entries") ??
    db.addCollection("entries", {
      unique: ["id"],
      indices: ["parentId", "type", "name"],
    });

  const fat =
    db.getCollection("fat") ??
    db.addCollection("fat", {
      unique: ["cluster"],
      indices: ["value", "ownerEntryId"],
    });

  const clustersData =
    db.getCollection("clustersData") ??
    db.addCollection("clustersData", {
      unique: ["cluster"],
      indices: ["ownerEntryId"],
    });

  const events =
    db.getCollection("events") ??
    db.addCollection("events", { indices: ["ts", "opId", "action"] });

  collections = { volume, entries, fat, clustersData, events };
  return collections;
}

function ensureBootstrapped() {
  const { volume, entries } = collections;

  let vol = volume.findOne({ id: "vol0" });
  if (!vol) {
    vol = volume.insert({
      id: "vol0",
      label: "FAT-SIM",
      fatType: "FAT32",
      bytesPerSector: 512,
      sectorsPerCluster: 8,
      clusterSize: 512 * 8,
      totalClusters: 2048,
      nextAllocHint: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      rootDirEntryId: "root",
    });
  }

  let root = entries.findOne({ id: "root" });
  if (!root) {
    root = entries.insert({
      id: "root",
      parentId: null,
      name: "/",
      type: "dir",
      attrs: { readonly: false, hidden: false, system: false, archive: false },
      size: 0,
      firstCluster: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deleted: false,
    });
  }
}

function loadDbOnce() {
  return new Promise((resolve) => {
    db.loadDatabase({}, (err) => resolve(err));
  });
}

function saveDbOnce() {
  return new Promise((resolve, reject) => {
    db.saveDatabase((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function initDb() {
  if (db && collections) return { db, ...collections };

  fs.mkdirSync(DB_DIR, { recursive: true });

  db = new loki(DB_FILE, {
    autoload: false,
    autosave: true,
    autosaveInterval: 700,
  });

  const err = await loadDbOnce();

  ensureCollections();
  ensureBootstrapped();

  if (err) {
    const fileExists = fs.existsSync(DB_FILE);
    if (!fileExists) {
      await saveDbOnce();
    } else {
      throw err;
    }
  }

  emitDbChange();
  return { db, ...collections };
}

export function getDb() {
  if (!db || !collections)
    throw new Error("db is not initialized; call initDb() first");
  return { db, ...collections };
}

export async function saveDb() {
  if (!db) return;
  await saveDbOnce();
}

export function formatVolume({
  totalClusters = 2048,
  clusterSize = 4096,
  fatType = "FAT32",
} = {}) {
  const { volume, entries, fat, clustersData, events } = getDb();

  const vol = volume.findOne({ id: "vol0" });
  vol.totalClusters = totalClusters;
  vol.clusterSize = clusterSize;
  vol.sectorsPerCluster = Math.max(1, Math.floor(clusterSize / 512));
  vol.bytesPerSector = 512;
  vol.fatType = fatType;
  vol.nextAllocHint = 2;
  vol.updatedAt = Date.now();
  volume.update(vol);

  fat.clear();
  clustersData.clear();
  events.clear();

  const all = entries.find();
  for (const e of all) {
    if (e.id === "root") {
      e.parentId = null;
      e.name = "/";
      e.type = "dir";
      e.size = 0;
      e.firstCluster = 2;
      e.deleted = false;
      e.updatedAt = Date.now();
      entries.update(e);
    } else {
      entries.remove(e);
    }
  }

  for (let c = 0; c < totalClusters; c++) {
    let value = 0;
    if (c === 0 || c === 1) value = "RES";
    fat.insert({
      cluster: c,
      value,
      ownerEntryId: null,
      touchedAt: Date.now(),
    });
  }

  const rootFat = fat.findOne({ cluster: 2 });
  rootFat.value = "EOC";
  rootFat.ownerEntryId = "root";
  rootFat.touchedAt = Date.now();
  fat.update(rootFat);

  clustersData.insert({
    cluster: 2,
    ownerEntryId: "root",
    data: "",
    touchedAt: Date.now(),
  });

  emitDbChange();
  return vol;
}

export function logEvent({
  opId,
  action,
  message = "",
  details = null,
  highlightClusters = [],
  highlightEntries = [],
} = {}) {
  const { events } = getDb();

  const ev = events.insert({
    ts: Date.now(),
    opId: opId ?? `op_${Date.now()}`,
    action,
    message,
    details,
    highlightClusters,
    highlightEntries,
  });

  emitDbChange();
  return ev;
}
