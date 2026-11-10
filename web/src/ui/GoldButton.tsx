import { Button, type ButtonProps } from "@mantine/core";
import type { ComponentPropsWithoutRef } from "react";
import { DISPLAY } from "./tokens";

type Props = Omit<ButtonProps, "color" | "styles"> & Omit<ComponentPropsWithoutRef<"button">, keyof ButtonProps>;

/** The main action on the stage and on phones: gold with dark text (a blue button disappears on the stage). */
export function GoldButton(props: Props) {
  return (
    <Button
      color="yellow.4"
      autoContrast
      {...props}
      styles={{
        root: {
          fontFamily: DISPLAY,
          fontWeight: 700,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          flexShrink: 0,
        },
      }}
    />
  );
}
