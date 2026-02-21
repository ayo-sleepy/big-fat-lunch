import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { getDb } from "../../data/data.js";
import { theme } from "../theme.js";

function getClusterState(value) {
  if (value === 0) return "FREE";
  if (value === "RES") return "RES";
  if (value === "BAD") return "BAD";
  if (value === "EOC") return "EOC";
  if (typeof value === "number") return "NEXT";
  return "UNK";
}

function pad(n, w) {
  const s = String(n);
  return s.length >= w ? s : "0".repeat(w - s.length) + s;
}

export default function ClustersPane({ dbVersion, focused, selectedEntryId }) {
  const { fat } = getDb();
  const total = fat.count();

  const [offset, setOffset] = useState(0);
  const [cursor, setCursor] = useState(0);

  const pageSize = theme.clusters.pageSize;
  const maxOffset = Math.max(0, total - pageSize);
  const maxCursor = Math.max(0, Math.min(pageSize - 1, total - 1));

  useInput(
    (input, key) => {
      if (!focused) return;

      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      if (key.downArrow) setCursor((c) => Math.min(maxCursor, c + 1));

      if (key.pageUp) setOffset((o) => Math.max(0, o - pageSize));
      if (key.pageDown) setOffset((o) => Math.min(maxOffset, o + pageSize));

      if (key.leftArrow) setOffset((o) => Math.max(0, o - 1));
      if (key.rightArrow) setOffset((o) => Math.min(maxOffset, o + 1));

      if (input === "g") {
        setOffset(0);
        setCursor(0);
      }

      if (input === "G") {
        setOffset(maxOffset);
        setCursor(0);
      }
    },
    { isActive: focused },
  );

  const slice = useMemo(() => {
    const start = offset;
    const end = Math.min(total, offset + pageSize);
    const rows = [];
    for (let c = start; c < end; c++) {
      const doc = fat.findOne({ cluster: c });
      if (!doc) continue;
      rows.push(doc);
    }
    return rows;
  }, [dbVersion, offset, pageSize, total]);

  const curDoc = slice[cursor] ?? null;

  return (
    <Box flexDirection="column" width="100%">
      <Text>
        clusters: {total} offset: {offset} selectedEntry:{" "}
        {selectedEntryId ?? "-"}
      </Text>

      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        <Text color="gray"> idx state value owner</Text>
        {slice.map((d, i) => {
          const state = getClusterState(d.value);
          const val =
            typeof d.value === "number" ? pad(d.value, 4) : String(d.value);
          const owner = d.ownerEntryId ?? "-";
          const line = ` ${pad(d.cluster, 4)}  ${state.padEnd(5, " ")}  ${val.padEnd(8, " ")}  ${owner}`;
          return (
            <Text key={d.cluster} inverse={i === cursor}>
              {line}
            </Text>
          );
        })}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text>Details</Text>
        {curDoc ? (
          <>
            <Text>cluster: {curDoc.cluster}</Text>
            <Text>state: {getClusterState(curDoc.value)}</Text>
            <Text>value: {String(curDoc.value)}</Text>
            <Text>owner: {curDoc.ownerEntryId ?? "-"}</Text>
            <Text>touchedAt: {curDoc.touchedAt ?? "-"}</Text>
          </>
        ) : (
          <Text dimColor>no data</Text>
        )}
      </Box>
    </Box>
  );
}
