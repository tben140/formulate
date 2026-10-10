import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, parse } from "node:path";

import type { Plugin } from "vite";

const VIRTUAL = "\0nativewind-react-native";

/**
 * NativeWind's component swap, ported from Metro to Vite.
 *
 * NativeWind v5 styles a component through react-native-css's wrapper
 * (`View`, `Text`, `Pressable` and so on), which turns `className` into
 * styles. Under Metro, react-native-css's resolver points `react-native` at
 * those wrappers. Vite never runs that resolver, so without this plugin every
 * `className` in the app would be silently ignored.
 *
 * Every `react-native` import outside react-native-css resolves to a virtual
 * module: all of React Native Web, with the wrapped components replacing
 * their originals. The wrappers' own `react-native` imports are left alone,
 * so they still reach the real components and nothing imports itself.
 */
export const nativewindWeb = (): Plugin => {
  const require = createRequire(import.meta.url);
  const cssRoot = dirname(require.resolve("react-native-css/package.json"));
  const wrappers = join(cssRoot, "dist", "module", "components");
  const names = readdirSync(join(cssRoot, "src", "components"))
    .filter((file) => /^[A-Z]\w*\.tsx$/.test(file))
    .map((file) => parse(file).name)
    .filter(
      (name) => name !== "SafeAreaProvider" && existsSync(join(wrappers, `${name}.js`)),
    );

  return {
    name: "nativewind-web",
    enforce: "pre",
    resolveId(source, importer) {
      // Storybook's framework aliases react-native to react-native-web before
      // plugins see it, so both names arrive here.
      if ((source !== "react-native" && source !== "react-native-web") || !importer)
        return null;
      if (
        importer === VIRTUAL ||
        importer.startsWith(cssRoot) ||
        importer.includes("/react-native-web/")
      ) {
        return null;
      }
      return VIRTUAL;
    },
    load(id) {
      if (id !== VIRTUAL) return null;
      return [
        `export * from "react-native-web";`,
        ...names.map(
          (name) =>
            `export { ${name} } from ${JSON.stringify(join(wrappers, `${name}.js`))};`,
        ),
      ].join("\n");
    },
  };
};
