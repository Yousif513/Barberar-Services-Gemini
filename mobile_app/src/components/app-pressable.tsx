import React from "react";
import {
  Pressable,
  type AccessibilityRole,
  type AccessibilityState,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { textFromNode } from "@/lib/a11y-label";

type Props = Omit<PressableProps, "style" | "accessibilityRole" | "accessibilityLabel" | "accessibilityState"> & {
  style?: StyleProp<ViewStyle>;
  /** What a screen reader announces. Required for icon-only controls; otherwise the visible text is used. */
  label?: string;
  /** Defaults to "button". Use "tab", "radio", "checkbox", "switch" or "link" where that is what the control is. */
  role?: AccessibilityRole;
  /** Marks the current choice of a group (a filter chip, a tab, a radio). */
  selected?: boolean;
  /** Marks a control that is working (a submit in flight). It is also disabled. */
  busy?: boolean;
  checked?: boolean;
  /** Opacity while pressed, like the TouchableOpacity this replaces. */
  activeOpacity?: number;
};

/**
 * The one pressable for the app: carries accessibilityRole, accessibilityLabel and accessibilityState so every control is
 * announced with what it is, what it does and whether it is selected, disabled or busy.
 */
export function AppPressable({
  label,
  role = "button",
  selected,
  busy,
  checked,
  disabled,
  activeOpacity = 0.2,
  style,
  children,
  ...rest
}: Props) {
  const isDisabled = Boolean(disabled || busy);
  const accessibilityState: AccessibilityState = { disabled: isDisabled };
  if (selected !== undefined) accessibilityState.selected = selected;
  if (busy !== undefined) accessibilityState.busy = busy;
  if (checked !== undefined) accessibilityState.checked = checked;
  const derived = typeof children === "function" ? "" : textFromNode(children);
  return (
    <Pressable
      accessible
      accessibilityRole={role}
      accessibilityLabel={label ?? (derived || undefined)}
      accessibilityState={accessibilityState}
      disabled={isDisabled}
      style={({ pressed }) => [style, pressed ? { opacity: activeOpacity } : null]}
      {...rest}>
      {children}
    </Pressable>
  );
}
