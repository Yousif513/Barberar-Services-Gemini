// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // TypeScript performs module resolution reliably across CI and the
      // Windows sandbox; eslint-plugin-import can fail while traversing home.
      "import/no-unresolved": "off",
      // Track React compiler migration work without blocking Expo validation.
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "no-unreachable": "warn",
    },
  }
]);
