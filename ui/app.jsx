import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, useInput, useStdout } from "ink";
import { theme } from "./theme.js";
import Frame from "./components/Frame.jsx";
import FileManagerPane from "./panes/FileManagerPane.jsx";
import CommanderPane from "./panes/CommanderPane.jsx";
import ClustersPane from "./panes/ClustersPane.jsx";
import LogsPane from "./panes/LogsPane.jsx";
import { onDbChange } from "../data/data.js";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function pct(total, percent) {
  return Math.floor((total * percent) / 100);
}

export default function App() {
  const [activePane, setActivePane] = useState(1);
  const [cwdId, setCwdId] = useState("root");
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [dbVersion, setDbVersion] = useState(0);

  const { stdout } = useStdout();
  const [dims, setDims] = useState(() => ({
    cols: stdout?.columns ?? process.stdout.columns ?? 80,
    rows: stdout?.rows ?? process.stdout.rows ?? 24,
  }));

  useEffect(() => {
    if (!stdout?.on) return;
    const onResize = () =>
      setDims({
        cols: stdout.columns ?? process.stdout.columns ?? 80,
        rows: stdout.rows ?? process.stdout.rows ?? 24,
      });
    stdout.on("resize", onResize);
    return () => stdout.off("resize", onResize);
  }, [stdout]);

  useEffect(() => {
    return onDbChange(() => setDbVersion((v) => v + 1));
  }, []);

  const cols = dims.cols;
  const rows = dims.rows;

  const gapX = theme.layout.gapX;

  const leftW = pct(cols - gapX, theme.layout.leftWidthPercent);
  const rightW = cols - gapX - leftW;

  const leftTopH = pct(rows, theme.layout.leftTopHeightPercent);
  const leftBottomH = rows - leftTopH;

  const rightTopH = pct(rows, theme.layout.rightTopHeightPercent);
  const rightBottomH = rows - rightTopH;

  const [spaceChord, setSpaceChord] = useState(false);

  const setPane = useCallback((n) => setActivePane(clamp(n, 1, 3)), []);

  useEffect(() => {
    if (!spaceChord) return;
    const t = setTimeout(() => setSpaceChord(false), 700);
    return () => clearTimeout(t);
  }, [spaceChord]);

  useInput((input, key) => {
    if (key.escape) setSpaceChord(false);

    if (!spaceChord) {
      if (input === " ") {
        setSpaceChord(true);
        return;
      }
      return;
    }

    if (input === "1") setPane(1);
    if (input === "2") setPane(2);
    if (input === "3") setPane(3);
    setSpaceChord(false);
  });

  const focus = useMemo(
    () => ({
      fileManager: activePane === 1,
      commander: activePane === 2,
      clusters: activePane === 3,
    }),
    [activePane],
  );

  return (
    <Box flexDirection="row" width={cols} height={rows} columnGap={gapX}>
      <Box width={leftW} flexDirection="column" height={rows}>
        <Frame
          title="File Manager"
          active={focus.fileManager}
          height={leftTopH}
        >
          <FileManagerPane
            dbVersion={dbVersion}
            focused={focus.fileManager}
            cwdId={cwdId}
            onCwdChange={setCwdId}
            selectedEntryId={selectedEntryId}
            onSelectEntry={setSelectedEntryId}
          />
        </Frame>

        <Frame title="Commander" active={focus.commander} height={leftBottomH}>
          <CommanderPane
            focused={focus.commander}
            cwdId={cwdId}
            onCwdChange={setCwdId}
            onSelectEntry={setSelectedEntryId}
          />
        </Frame>
      </Box>

      <Box width={rightW} flexDirection="column" height={rows}>
        <Frame title="Clusters" active={focus.clusters} height={rightTopH}>
          <ClustersPane
            dbVersion={dbVersion}
            focused={focus.clusters}
            selectedEntryId={selectedEntryId}
          />
        </Frame>

        <Frame title="Logs" active={false} height={rightBottomH}>
          <LogsPane />
        </Frame>
      </Box>
    </Box>
  );
}
