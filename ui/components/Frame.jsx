import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

const borderStyleFrom = (ch, corner) => ({
  top: ch,
  bottom: ch,
  left: ch,
  right: ch,
  topLeft: corner,
  topRight: corner,
  bottomLeft: corner,
  bottomRight: corner,
});

export default function Frame({
  title,
  active,
  children,
  flexGrow = 0,
  width,
  height,
}) {
  const color = active ? theme.frame.activeColor : theme.frame.inactiveColor;
  const style = borderStyleFrom(
    theme.frame.borderChar,
    theme.frame.borderCharCorner,
  );

  return (
    <Box
      flexGrow={flexGrow}
      width={width}
      height={height}
      borderStyle={style}
      borderColor={color}
      flexDirection="column"
    >
      <Box
        paddingLeft={theme.layout.paddingInside}
        paddingRight={theme.layout.paddingInside}
      >
        <Text color={theme.frame.titleColor}>
          {active ? "▶ " : "  "}
          {title}
        </Text>
      </Box>
      <Box
        flexGrow={1}
        paddingLeft={theme.layout.paddingInside}
        paddingRight={theme.layout.paddingInside}
        paddingBottom={theme.layout.paddingInside}
      >
        {children}
      </Box>
    </Box>
  );
}
