import { reactNative } from "@formulate/eslint-config/react-native";

export default [
  ...reactNative,
  { ignores: [".expo/**", "dist/**", "expo-env.d.ts"] },
];
