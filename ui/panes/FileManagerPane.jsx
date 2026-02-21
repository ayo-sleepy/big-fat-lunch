import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { getDb } from "../../data/data.js";
import { theme } from "../theme.js";
import { resolveToEntryId, getPathOfEntryId } from "../../workspace/fsOps.js";

function sortEntries(a, b) {
  if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function getChildren(entries, parentId) {
  return entries.find({ parentId, deleted: false }).sort(sortEntries);
}

function safeEntry(entries, id) {
  const e = entries.findOne({ id });
  if (!e || e.deleted) return null;
  return e;
}

export default function FileManagerPane({
  dbVersion,
  focused,
  cwdId,
  onCwdChange,
  selectedEntryId,
  onSelectEntry,
}) {
  const { entries } = getDb();
  const cwd = safeEntry(entries, cwdId) ?? safeEntry(entries, "root");
  const cwdPath = getPathOfEntryId(cwd.id);

  const items = useMemo(() => {
    const kids = getChildren(entries, cwd.id);
    const up =
      cwd.id === "root"
        ? []
        : [{ id: cwd.parentId, name: "..", type: "dir", _virtual: true }];
    return [...up, ...kids];
  }, [dbVersion, cwd.id]);

  const [cursor, setCursor] = useState(0);
  const max = Math.max(0, items.length - 1);

  useInput(
    (input, key) => {
      if (!focused) return;

      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      if (key.downArrow) setCursor((c) => Math.min(max, c + 1));

      if (key.return) {
        const it = items[cursor];
        if (!it) return;
        const targetId = it.id;
        const target = safeEntry(entries, targetId);
        if (target?.type === "dir") {
          onCwdChange(target.id);
          setCursor(0);
          return;
        }
        onSelectEntry(target?.id ?? null);
      }

      if (key.backspace || key.delete) {
        if (cwd.id === "root") return;
        onCwdChange(cwd.parentId);
        setCursor(0);
      }

      if (input === "/") {
        onCwdChange("root");
        setCursor(0);
      }
    },
    { isActive: focused },
  );

  const view = items.slice(0, theme.fileManager.listMaxLines);

  const selected = selectedEntryId ? safeEntry(entries, selectedEntryId) : null;

  return (
    <Box flexDirection="column" width="100%">
      <Text>{cwdPath}</Text>

      <Box flexDirection="row" width="100%" marginTop={1}>
        <Box flexDirection="column" width="60%">
          {view.map((it, i) => {
            const isCursor = i === cursor;
            const label = it.type === "dir" ? "dir " : "file";
            const marker = isCursor ? ">" : " ";
            return (
              <Text key={it.id} inverse={isCursor}>
                {marker} {label} {it.name}
              </Text>
            );
          })}
        </Box>

        <Box flexDirection="column" width="40%" paddingLeft={1}>
          <Text>Info</Text>
          {selected ? (
            <>
              <Text>name: {selected.name}</Text>
              <Text>type: {selected.type}</Text>
              <Text>size: {selected.size ?? 0}</Text>
              <Text>firstCluster: {selected.firstCluster ?? 0}</Text>
              <Text>path: {getPathOfEntryId(selected.id)}</Text>
            </>
          ) : (
            <Text dimColor>select a file to inspect</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
