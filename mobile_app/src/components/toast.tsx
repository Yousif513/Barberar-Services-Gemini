import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View, Animated, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface ToastProps {
  message: string;
  type: "success" | "info" | "error";
  visible: boolean;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, visible, onClose, duration = 3500 }: ToastProps) {
  const insets = useSafeAreaInsets();
  const [slideAnim] = useState(() => new Animated.Value(-150));

  const handleDismiss = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 200,
      useNativeDriver: true,
    }).start(onClose);
  }, [onClose, slideAnim]);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: insets.top + 10,
        useNativeDriver: true,
        tension: 40,
        friction: 8,
      }).start();

      const timer = setTimeout(() => {
        handleDismiss();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      Animated.timing(slideAnim, {
        toValue: -150,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [duration, handleDismiss, insets.top, slideAnim, visible]);

  if (!visible) return null;

  const typeStyles = {
    success: { borderLeftColor: "#10b981", iconColor: "#10b981" },
    info: { borderLeftColor: "#d97706", iconColor: "#d97706" },
    error: { borderLeftColor: "#e11d48", iconColor: "#e11d48" },
  };

  const currentStyle = typeStyles[type] || typeStyles.info;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          borderLeftColor: currentStyle.borderLeftColor,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.indicator, { backgroundColor: currentStyle.iconColor }]} />
        <Text style={styles.text}>{message}</Text>
        <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn}>
          <Text style={styles.closeText}>×</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 20,
    right: 20,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderLeftWidth: 5,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 10000,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  text: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#1c1917",
    lineHeight: 16,
    textAlign: "left",
  },
  closeBtn: {
    paddingHorizontal: 8,
    marginLeft: 8,
  },
  closeText: {
    fontSize: 18,
    color: "#a8a29e",
    fontWeight: "bold",
  },
});
