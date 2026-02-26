import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";

export const ModalStyle = {
  ERROR: "error",
  IMPORTANT: "important",
  NORMAL: "normal",
};

export const ModalType = {
  MESSAGE: "message",
  PROMPT: "prompt",
};

const styleColors = {
  [ModalStyle.ERROR]: "red",
  [ModalStyle.IMPORTANT]: "green",
  [ModalStyle.NORMAL]: "yellow",
};

export default function Modal({
  isOpen,
  title,
  subtitle,
  style = ModalStyle.NORMAL,
  type = ModalType.MESSAGE,
  icon,
  onAccept,
  onCancel,
  placeholder,
}) {
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setInputValue("");
    }
  }, [isOpen]);

  useInput(
    (input, key) => {
      if (!isOpen) return;

      if (key.return) {
        if (onAccept) {
          onAccept(type === ModalType.PROMPT ? inputValue : undefined);
        }
      }

      if (key.delete || key.backspace) {
        if (type === ModalType.PROMPT) {
          return;
        }
        if (onCancel) {
          onCancel();
        }
      }
    },
    { isActive: isOpen },
  );

  if (!isOpen) return null;

  const color = styleColors[style];

  const contentWidth = 40;
  const contentHeight = type === ModalType.PROMPT ? 10 : 8;

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
        width={contentWidth}
        height={contentHeight}
        borderStyle="bold"
        borderColor={color}
        paddingX={2}
        paddingY={1}
      >
        <Box justifyContent="center" marginBottom={1}>
          {icon && (
            <Text color={color} bold>
              {icon}{" "}
            </Text>
          )}
          <Text bold color={color}>
            {title}
          </Text>
        </Box>

        {subtitle && (
          <Box justifyContent="center" marginBottom={1}>
            <Text>{subtitle}</Text>
          </Box>
        )}

        {type === ModalType.PROMPT && (
          <Box marginBottom={1}>
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              placeholder={placeholder}
            />
          </Box>
        )}

        <Box justifyContent="space-between" marginTop="auto">
          <Text dimColor>[Enter] Accept</Text>
          <Text dimColor>[Delete] Cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
