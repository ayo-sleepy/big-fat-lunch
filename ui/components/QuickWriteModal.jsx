import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";

export default function QuickWriteModal({
  isOpen,
  targetName,
  initialContent,
  onSave,
  onCancel,
}) {
  const { stdout } = useStdout();
  const [content, setContent] = useState(initialContent || "");
  const [showConfirmCancel, setShowConfirmCancel] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setContent(initialContent || "");
      setShowConfirmCancel(false);
    }
  }, [isOpen, initialContent]);

  useInput(
    (input, key) => {
      if (!isOpen) return;

      if (showConfirmCancel) {
        if (key.return) {
          setShowConfirmCancel(false);
          onCancel();
        }
        if (key.escape) {
          setShowConfirmCancel(false);
        }
        return;
      }

      if (key.escape) {
        setShowConfirmCancel(true);
        return;
      }

      if (key.return) {
        onSave(content);
        return;
      }
    },
    { isActive: isOpen },
  );

  if (!isOpen) return null;

  return (
    <Box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
    >
      <Box
        flexDirection="column"
        width="90%"
        height="80%"
        backgroundColor="black"
        borderStyle="bold"
        borderColor="cyan"
      >
        <Box justifyContent="center" marginBottom={1}>
          <Text bold color="cyan">
            QuickWrite
          </Text>
        </Box>

        <Box justifyContent="center" marginBottom={1}>
          <Text>File: {targetName}</Text>
        </Box>

        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
          paddingY={1}
        >
          <TextInput
            value={content}
            onChange={setContent}
            placeholder="Type here..."
            mask=""
          />
        </Box>

        {showConfirmCancel ? (
          <Box flexDirection="column" marginTop={1}>
            <Text color="yellow">Cancel without saving?</Text>
            <Box justifyContent="space-between" marginTop={1}>
              <Text dimColor>[Enter] Yes</Text>
              <Text dimColor>[Esc] No</Text>
            </Box>
          </Box>
        ) : (
          <Box justifyContent="space-between" marginTop={1}>
            <Text dimColor>[Enter] Save</Text>
            <Text dimColor>[Esc] Cancel</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
