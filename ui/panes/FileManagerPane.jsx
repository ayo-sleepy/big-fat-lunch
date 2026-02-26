import React, { useMemo, useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import chalk from "chalk";
import { getDb } from "../../data/data.js";
import { theme } from "../theme.js";
import { getPath, changeDirectory } from "../../workspace/commander.js";
import Modal, { ModalStyle, ModalType } from "../components/Modal.jsx";

function sortEntries(a, b) {
  if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function getChildrenEntries(entries, parentId) {
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
  const cwdPath = getPath(cwd.id);

  const items = useMemo(() => {
    const kids = getChildrenEntries(entries, cwd.id);
    const up =
      cwd.id === "root"
        ? []
        : [{ id: cwd.parentId, name: "..", type: "dir", _virtual: true }];
    return [...up, ...kids];
  }, [dbVersion, cwd.id]);

  const [cursor, setCursor] = useState(0);
  const max = Math.max(0, items.length - 1);

  const [modalOpen, setModalOpen] = useState(true);

  useEffect(() => {
    if (focused) {
      setModalOpen(true);
    }
  }, [focused]);

  const handleModalAccept = () => {
    setModalOpen(false);
  };

  const handleModalCancel = () => {
    setModalOpen(false);
  };

  const navigateTo = (target) => {
    if (target._virtual && target.name === "..") {
      navigateBack();
      return;
    }
    const result = changeDirectory(cwd.id, target.name);
    if (result?.newCwdId) onCwdChange(result.newCwdId);
    setCursor(0);
  };

  const navigateBack = () => {
    if (cwd.id === "root") return;
    const result = changeDirectory(cwd.id, "..");
    if (result?.newCwdId) onCwdChange(result.newCwdId);
    setCursor(0);
  };

  const navigateToRoot = () => {
    const result = changeDirectory(cwd.id, "X:/");
    if (result?.newCwdId) onCwdChange(result.newCwdId);
    setCursor(0);
  };

  useInput(
    (input, key) => {
      if (!focused) return;

      if (modalOpen) return;

      if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
      if (key.downArrow) setCursor((c) => Math.min(max, c + 1));

      if (key.return) {
        const it = items[cursor];
        if (!it) return;

        if (it._virtual && it.name === "..") {
          navigateBack();
          return;
        }

        const target = safeEntry(entries, it.id);
        if (target?.type === "dir") {
          navigateTo(target);
          return;
        }
        onSelectEntry(target?.id ?? null);
      }

      if (key.backspace || key.delete) {
        navigateBack();
      }

      if (input === "X:/") {
        navigateToRoot();
      }
    },
    { isActive: focused },
  );

  const view = items.slice(0, theme.fileManager.listMaxLines);

  const selected = selectedEntryId ? safeEntry(entries, selectedEntryId) : null;

  return (
    <Box flexDirection="column" style="background: #000000" width="100%">
      <Text>{cwdPath}</Text>

      <Box flexDirection="row" width="100%" marginTop={1}>
        <Box flexDirection="column" width="60%">
          {view.map((it, i) => {
            const isCursor = i === cursor;
            const label = it.type === "dir" ? chalk.blue("dir") : chalk.white("file");
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
              <Text>path: {getPath(selected.id)}</Text>
            </>
          ) : (
            <Text dimColor>select a file to inspect</Text>
          )}
        </Box>
      </Box>

      <Modal
        isOpen={modalOpen && focused}
        title="Welcome!"
        subtitle="Have a good time now!"
        style={ModalStyle.IMPORTANT}
        onAccept={handleModalAccept}
        onCancel={handleModalCancel}
      />
    </Box>
  );
}
