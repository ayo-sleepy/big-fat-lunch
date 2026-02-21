import { getDb, logEvent } from "./data.js";

function isFree(v) {
  return v === 0;
}

function isReserved(v) {
  return v === "RES" || v === "BAD";
}

function isEoc(v) {
  return v === "EOC";
}

function isNext(v) {
  return typeof v === "number";
}

function getVolume() {
  const { volume } = getDb();
  const vol = volume.findOne({ id: "vol0" });
  if (!vol) throw new Error("volume not initialized");
  return vol;
}

function getFatDoc(cluster) {
  const { fat } = getDb();
  const doc = fat.findOne({ cluster });
  if (!doc) throw new Error(`fat missing cluster ${cluster}`);
  return doc;
}

function setFat(cluster, value, ownerEntryId) {
  const { fat } = getDb();
  const doc = getFatDoc(cluster);
  doc.value = value;
  doc.ownerEntryId = ownerEntryId ?? null;
  doc.touchedAt = Date.now();
  fat.update(doc);
}

function ensureClusterData(cluster, ownerEntryId) {
  const { clustersData } = getDb();
  const existing = clustersData.findOne({ cluster });
  if (existing) {
    existing.ownerEntryId = ownerEntryId ?? null;
    existing.touchedAt = Date.now();
    clustersData.update(existing);
    return;
  }
  clustersData.insert({
    cluster,
    ownerEntryId: ownerEntryId ?? null,
    data: "",
    touchedAt: Date.now(),
  });
}

export function getChain(firstCluster) {
  if (!firstCluster || firstCluster < 2) return [];
  const { fat } = getDb();

  const chain = [];
  const seen = new Set();

  let cur = firstCluster;
  while (true) {
    if (seen.has(cur)) break;
    seen.add(cur);

    const doc = fat.findOne({ cluster: cur });
    if (!doc) break;

    chain.push(cur);

    if (isEoc(doc.value)) break;
    if (isNext(doc.value)) {
      cur = doc.value;
      continue;
    }
    break;
  }

  return chain;
}

function scanForFreeClusters({ count, startHint, totalClusters }) {
  const { fat } = getDb();

  const picked = [];
  const start = Math.max(2, startHint ?? 2);

  let cur = start;
  let loops = 0;

  while (picked.length < count && loops < totalClusters + 2) {
    const doc = fat.findOne({ cluster: cur });
    const v = doc?.value;

    if (doc && isFree(v)) picked.push(cur);

    cur += 1;
    if (cur >= totalClusters) cur = 2;
    loops += 1;
  }

  return picked;
}

export function allocateChain({ ownerEntryId, clustersCount }) {
  const { volume } = getDb();
  const vol = getVolume();

  if (clustersCount <= 0) return { firstCluster: 0, chain: [] };

  logEvent({
    action: "ALLOC_BEGIN",
    message: `alloc ${clustersCount} clusters`,
    highlightEntries: ownerEntryId ? [ownerEntryId] : [],
  });

  const picked = scanForFreeClusters({
    count: clustersCount,
    startHint: vol.nextAllocHint,
    totalClusters: vol.totalClusters,
  });

  if (picked.length < clustersCount) {
    logEvent({ action: "ALLOC_FAIL", message: "no space" });
    throw new Error("disk is full");
  }

  for (const c of picked) {
    logEvent({
      action: "ALLOC_PICK",
      message: `pick cluster ${c}`,
      highlightClusters: [c],
      highlightEntries: ownerEntryId ? [ownerEntryId] : [],
    });
  }

  for (let i = 0; i < picked.length; i++) {
    const c = picked[i];
    const next = picked[i + 1];
    setFat(c, next ?? "EOC", ownerEntryId);
    ensureClusterData(c, ownerEntryId);

    logEvent({
      action: "FAT_LINK",
      message: next ? `${c} -> ${next}` : `${c} -> EOC`,
      highlightClusters: [c, ...(next ? [next] : [])],
      highlightEntries: ownerEntryId ? [ownerEntryId] : [],
    });
  }

  vol.nextAllocHint = picked[picked.length - 1] + 1;
  if (vol.nextAllocHint >= vol.totalClusters) vol.nextAllocHint = 2;
  vol.updatedAt = Date.now();
  volume.update(vol);

  return { firstCluster: picked[0], chain: picked };
}

export function freeChain({ firstCluster }) {
  const chain = getChain(firstCluster);
  if (chain.length === 0) return;

  logEvent({
    action: "FREE_BEGIN",
    message: `free chain from ${firstCluster}`,
    highlightClusters: chain.slice(0, 8),
  });

  for (const c of chain) {
    setFat(c, 0, null);

    const { clustersData } = getDb();
    const d = clustersData.findOne({ cluster: c });
    if (d) clustersData.remove(d);

    logEvent({
      action: "FREE_CLUSTER",
      message: `free ${c}`,
      highlightClusters: [c],
    });
  }
}

export function ensureEntryHasChain(entryId, minClusters) {
  const { entries } = getDb();
  const entry = entries.findOne({ id: entryId });
  if (!entry || entry.deleted) throw new Error("entry not found");

  const vol = getVolume();
  const need = Math.max(0, minClusters);

  const current = getChain(entry.firstCluster);
  if (current.length >= need) return { entry, chain: current };

  const addCount = need - current.length;
  const add = allocateChain({
    ownerEntryId: entry.id,
    clustersCount: addCount,
  });

  if (current.length === 0) {
    entry.firstCluster = add.firstCluster;
    entry.updatedAt = Date.now();
    entries.update(entry);
    return { entry, chain: add.chain };
  }

  const last = current[current.length - 1];
  setFat(last, add.firstCluster, entry.id);

  logEvent({
    action: "FAT_LINK",
    message: `${last} -> ${add.firstCluster}`,
    highlightClusters: [last, add.firstCluster],
    highlightEntries: [entry.id],
  });

  return { entry, chain: [...current, ...add.chain] };
}

export function writeEntryData(entryId, text) {
  const { entries, clustersData } = getDb();
  const entry = entries.findOne({ id: entryId });
  if (!entry || entry.deleted) throw new Error("entry not found");
  if (entry.type !== "file") throw new Error("not a file");

  const vol = getVolume();
  const bytes = Buffer.from(text, "utf8");
  const neededClusters = Math.max(1, Math.ceil(bytes.length / vol.clusterSize));

  const { chain } = ensureEntryHasChain(entry.id, neededClusters);

  for (let i = 0; i < chain.length; i++) {
    const c = chain[i];
    const start = i * vol.clusterSize;
    const end = Math.min(bytes.length, start + vol.clusterSize);
    const chunk = bytes.slice(start, end).toString("utf8");

    const d =
      clustersData.findOne({ cluster: c }) ??
      clustersData.insert({
        cluster: c,
        ownerEntryId: entry.id,
        data: "",
        touchedAt: Date.now(),
      });
    d.ownerEntryId = entry.id;
    d.data = chunk;
    d.touchedAt = Date.now();
    clustersData.update(d);

    logEvent({
      action: "WRITE_CLUSTER",
      message: `write ${c} (${end - start} bytes)`,
      highlightClusters: [c],
      highlightEntries: [entry.id],
    });
  }

  entry.size = bytes.length;
  entry.updatedAt = Date.now();
  entries.update(entry);

  logEvent({
    action: "WRITE_END",
    message: `size=${entry.size} bytes clusters=${chain.length}`,
    highlightEntries: [entry.id],
    highlightClusters: chain.slice(0, 8),
  });
}

export function readEntryData(entryId) {
  const { entries, clustersData } = getDb();
  const entry = entries.findOne({ id: entryId });
  if (!entry || entry.deleted) throw new Error("entry not found");
  if (entry.type !== "file") throw new Error("not a file");

  const vol = getVolume();
  const chain = getChain(entry.firstCluster);
  if (chain.length === 0) return "";

  const parts = [];
  for (const c of chain) {
    const d = clustersData.findOne({ cluster: c });
    if (d?.data) parts.push(d.data);
  }

  const joined = parts.join("");
  const bytes = Buffer.from(joined, "utf8");
  return bytes.slice(0, Math.max(0, entry.size ?? 0)).toString("utf8");
}

export function cloneChainData({ srcEntryId, dstEntryId }) {
  const { entries, clustersData } = getDb();
  const src = entries.findOne({ id: srcEntryId });
  const dst = entries.findOne({ id: dstEntryId });
  if (!src || !dst) throw new Error("entry not found");

  const srcChain = getChain(src.firstCluster);
  if (srcChain.length === 0) return;

  const { chain: dstChain } = ensureEntryHasChain(dst.id, srcChain.length);

  for (let i = 0; i < srcChain.length; i++) {
    const s = srcChain[i];
    const d = dstChain[i];

    const srcData = clustersData.findOne({ cluster: s })?.data ?? "";
    const dstDoc =
      clustersData.findOne({ cluster: d }) ??
      clustersData.insert({
        cluster: d,
        ownerEntryId: dst.id,
        data: "",
        touchedAt: Date.now(),
      });

    dstDoc.ownerEntryId = dst.id;
    dstDoc.data = srcData;
    dstDoc.touchedAt = Date.now();
    clustersData.update(dstDoc);

    logEvent({
      action: "CP_CLUSTER",
      message: `copy ${s} -> ${d}`,
      highlightClusters: [s, d],
      highlightEntries: [src.id, dst.id],
    });
  }

  dst.size = src.size ?? 0;
  dst.updatedAt = Date.now();
  entries.update(dst);

  logEvent({
    action: "CP_END",
    message: `copied clusters=${srcChain.length}`,
    highlightEntries: [src.id, dst.id],
  });
}
