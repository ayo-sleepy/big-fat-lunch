import React, { useEffect, useState } from "react";
import { Box, Text } from "ink";
import { getDb } from "../../data/data.js";
import { theme } from "../theme.js";

function tail(arr, n) {
  if (arr.length <= n) return arr;
  return arr.slice(arr.length - n);
}

export default function LogsPane() {
  const [lines, setLines] = useState([]);

  useEffect(() => {
    const tick = () => {
      const { events } = getDb();
      const all = events.chain().simplesort("ts").data();
      const last = tail(all, theme.logs.maxLines);

      const mapped = last.map((e) => {
        const t = new Date(e.ts).toLocaleTimeString();
        const a = e.action ?? "EVENT";
        const m = e.message ?? "";
        return `${t} ${a} ${m}`;
      });

      setLines(mapped);
    };

    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, []);

  const shown = tail(lines, 8);

  return (
    <Box flexDirection="column" width="100%">
      {shown.length === 0 ? (
        <Text dimColor>no events yet</Text>
      ) : (
        shown.map((l, i) => <Text key={i}>{l}</Text>)
      )}
    </Box>
  );
}
