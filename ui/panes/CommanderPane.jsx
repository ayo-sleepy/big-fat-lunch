import React, { useMemo, useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { theme } from "../theme.js";
import { runCommand, getPath } from "../../workspace/commander.js";
import { commanderBus } from "../../workspace/commanderBus.js";

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
  const [output, setOutput] = useState(['type "help" | focus: alt+1/2/3']);

  const cwdPath = useMemo(() => getPath(cwdId), [cwdId]);

  const push = (line) => {
    setOutput((prev) => {
      const next = [...prev, asLine(line)];
      const cut = Math.max(0, next.length - theme.commander.maxOutputLines);
      return next.slice(cut);
    });
  };

  const clearOutput = () => {
    setOutput([]);
  };

  useEffect(() => {
    const onOutput = (line) => {
      push(line);
    };
    const onClear = () => {
      clearOutput();
    };

    commanderBus.on("output", onOutput);
    commanderBus.on("clear", onClear);

    return () => {
      commanderBus.off("output", onOutput);
      commanderBus.off("clear", onClear);
    };
  }, []);

  const run = (line) => {
    const result = runCommand(cwdId, line);

    if (result?.clear) {
      clearOutput();
      return;
    }

    if (result?.newCwdId) {
      onCwdChange(result.newCwdId);
      onSelectEntry(null);
    }
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
