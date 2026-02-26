import React, { useMemo, useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import chalk from "chalk";
import { getDb } from "../../data/data.js";
import { theme } from "../theme.js";
import { getPath, changeDirectory, mkdir, touchCmd, rm, cat, write } from "../../workspace/commander.js";
import Modal, { ModalStyle, ModalType } from "../components/Modal.jsx";
import QuickWriteModal from "../components/QuickWriteModal.jsx";

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

  const [modalMode, setModalMode] = useState(null);
  const [modalType, setModalType] = useState(ModalType.MESSAGE);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [quickWriteTarget, setQuickWriteTarget] = useState(null);
  const [quickWriteContent, setQuickWriteContent] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const openCreateModal = () => {
    setModalType(ModalType.PROMPT);
    setModalMode("create");
  };

  const openDeleteModal = (target) => {
    if (!target || target._virtual) return;
    setModalType(ModalType.MESSAGE);
    setDeleteTarget(target);
    setModalMode("delete");
  };

  const openQuickWriteModal = () => {
    const it = items[cursor];
    if (!it || it._virtual) return;
    const entry = safeEntry(entries, it.id);
    if (!entry || entry.type !== "file") return;
    
    let content = "";
    try {
      content = cat(cwd.id, entry.name)?.lines?.join("\n") || "";
    } catch (e) {
      content = "";
    }
    
    setQuickWriteTarget(entry);
    setQuickWriteContent(content);
    setModalMode("quickwrite");
  };

  const closeModal = () => {
    setModalMode(null);
    setDeleteTarget(null);
    setQuickWriteTarget(null);
    setQuickWriteContent("");
    setShowCancelConfirm(false);
  };

  const handleCreateSubmit = (name) => {
    if (!name) {
      closeModal();
      return;
    }
    if (name.endsWith("/")) {
      mkdir(cwd.id, name.slice(0, -1));
    } else {
      touchCmd(cwd.id, name);
    }
    closeModal();
  };

  const handleDeleteConfirm = () => {
    if (deleteTarget) {
      rm(cwd.id, deleteTarget.name, new Set(["-r"]));
    }
    setDeleteTarget(null);
    closeModal();
  };

  const handleQuickWriteSave = (content) => {
    if (quickWriteTarget) {
      write(cwd.id, quickWriteTarget.name, content);
    }
    closeModal();
  };

  const handleQuickWriteCancel = () => {
    closeModal();
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

      if (modalMode) return;

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

      if (input === "a" || input === "A") {
        openCreateModal();
      }

      if ((input === "d" || input === "D") && items.length > 0) {
        const it = items[cursor];
        if (!it || it._virtual) return;
        openDeleteModal(it);
      }

      if (input === "w" || input === "W") {
        openQuickWriteModal();
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

      {modalMode === "create" && (
        <Modal
          isOpen={focused}
          title="Create new"
          subtitle="Enter file name (add / for directory)"
          style={ModalStyle.NORMAL}
          type={ModalType.PROMPT}
          placeholder="filename or dirname/"
          onAccept={handleCreateSubmit}
          onCancel={closeModal}
        />
      )}

      {modalMode === "delete" && (
        <Modal
          isOpen={focused}
          title="Delete?"
          subtitle={`Delete "${deleteTarget?.name}"?`}
          style={ModalStyle.ERROR}
          onAccept={handleDeleteConfirm}
          onCancel={closeModal}
        />
      )}

      {modalMode === "quickwrite" && (
        <QuickWriteModal
          isOpen={focused}
          targetName={quickWriteTarget?.name}
          initialContent={quickWriteContent}
          onSave={handleQuickWriteSave}
          onCancel={handleQuickWriteCancel}
        />
      )}
    </Box>
  );
}
