import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";
import {
  getPathOfEntryId,
  resolveToEntryId,
  listDir,
  mkdirp,
  touch,
  rmPath,
  mvPath,
  cpPath,
} from "../../workspace/fsOps.js";
import { getDb } from "../../data/data.js";
import { writeEntryData, readEntryData } from "../../workspace/fatOps.js";

function tokenize(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

function parse(tokens) {
  const [cmd, ...rest] = tokens;
  const flags = new Set();
  const args = [];
  for (const t of rest) {
    if (t.startsWith("-")) flags.add(t);
    else args.push(t);
  }
  return { cmd, flags, args };
}

function asLine(s) {
  return typeof s === "string" ? s : JSON.stringify(s);
}

export default function CommanderPane({
  focused,
  cwdId,
  onCwdChange,
  onSelectEntry,
}) {
  const [value, setValue] = useState("");
  const [output, setOutput] = useState([
    'type "help" | focus: Space+1/2/3 | arrows in file manager & clusters',
  ]);

  const cwdPath = useMemo(() => getPathOfEntryId(cwdId), [cwdId]);

  const push = (line) => {
    setOutput((prev) => {
      const next = [...prev, asLine(line)];
      const cut = Math.max(0, next.length - theme.commander.maxOutputLines);
      return next.slice(cut);
    });
  };

  const run = (line) => {
    const tokens = tokenize(line);
    if (tokens.length === 0) return;

    const { cmd, flags, args } = parse(tokens);

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
      return;
    }

    if (cmd === "write") {
      if (!args[0]) throw new Error("write: missing operand");
      const path = args[0];
      const text = tokens.slice(2).join(" ");
      if (!text) throw new Error("write: missing text");

      const { entries } = getDb();
      const id = resolveToEntryId(cwdId, path);
      const entry = entries.findOne({ id });
      if (!entry || entry.deleted) throw new Error("write: not found");
      if (entry.type !== "file") throw new Error("write: not a file");

      writeEntryData(entry.id, text);
      return;
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
      return;
    }

    if (cmd === "clear") {
      setOutput([]);
      return;
    }

    if (cmd === "pwd") {
      push(cwdPath);
      return;
    }

    if (cmd === "ls") {
      const target = args[0] ?? ".";
      const id = resolveToEntryId(cwdId, target);
      const rows = listDir(id);
      if (rows.length === 0) return;
      for (const r of rows) push(r);
      return;
    }

    if (cmd === "cd") {
      const target = args[0] ?? "X:/";
      const id = resolveToEntryId(cwdId, target);
      onCwdChange(id);
      onSelectEntry(null);
      return;
    }

    if (cmd === "mkdir") {
      if (!args[0]) throw new Error("mkdir: missing operand");
      mkdirp(cwdId, args[0]);
      return;
    }

    if (cmd === "touch") {
      if (!args[0]) throw new Error("touch: missing operand");
      touch(cwdId, args[0]);
      return;
    }

    if (cmd === "rm") {
      if (!args[0]) throw new Error("rm: missing operand");
      const recursive = flags.has("-r") || flags.has("-rf") || flags.has("-fr");
      rmPath(cwdId, args[0], { recursive });
      return;
    }

    if (cmd === "mv") {
      if (!args[0] || !args[1]) throw new Error("mv: missing operand");
      mvPath(cwdId, args[0], args[1]);
      return;
    }

    if (cmd === "cp") {
      if (!args[0] || !args[1]) throw new Error("cp: missing operand");
      const recursive = flags.has("-r") || flags.has("-R");
      cpPath(cwdId, args[0], args[1], { recursive });
      return;
    }

    throw new Error(`unknown command: ${cmd}`);
  };

  useInput(
    (input, key) => {
      if (!focused) return;
      if (key.escape) setValue("");
    },
    { isActive: focused },
  );

  const linesToShow = output.slice(-Math.max(3, theme.clusters.pageSize));

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="column" flexGrow={1}>
        {linesToShow.map((l, i) => (
          <Text key={i}>{l}</Text>
        ))}
      </Box>

      <Box>
        <Text>{cwdPath} </Text>
        <Text color="gray">{theme.commander.prompt}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(line) => {
            const full = line.trim();
            if (!full) return;
            push(`${cwdPath} ${theme.commander.prompt}${full}`);
            try {
              run(full);
            } catch (e) {
              push(String(e.message || e));
            }
            setValue("");
          }}
          focus={focused}
        />
      </Box>
    </Box>
  );
}
