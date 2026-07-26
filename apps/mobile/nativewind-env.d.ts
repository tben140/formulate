/// <reference types="react-native-css/types" />

/**
 * Expo generates `expo-env.d.ts` containing this same reference, but its own
 * generated .gitignore excludes that file — so it only exists on a machine
 * where an Expo command has been run. A fresh clone (CI, or a new contributor)
 * has no such file, and typecheck fails on the side-effect CSS import in
 * app/_layout.tsx:
 *
 *   error TS2882: Cannot find module or type declarations for side-effect
 *   import of '../global.css'
 *
 * Declaring it here, in a committed file, makes typecheck reproducible.
 * Reference directives are deduplicated, so this is harmless when Expo's own
 * generated file is also present.
 */
/// <reference types="expo/types" />
