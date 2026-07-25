import { storefrontApiCustomScalars } from "@shopify/hydrogen-react";
import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * Generates exact TypeScript types for every Storefront operation.
 *
 * The schema is the JSON file bundled inside @shopify/hydrogen-react, not a
 * network introspection — so codegen runs offline, needs no store credentials,
 * and CI never depends on Shopify being reachable. hydrogen-react is therefore
 * a devDependency of this package only; nothing it ships reaches runtime here.
 *
 * `documentMode: "string"` emits TypedDocumentString rather than a graphql-js
 * DocumentNode, which keeps the `graphql` package out of both app bundles —
 * important for the Expo bundle in particular.
 *
 * Keep the schema version in step with DEFAULT_API_VERSION in src/config.ts.
 */
const config: CodegenConfig = {
  overwrite: true,
  schema: "./node_modules/@shopify/hydrogen-react/storefront.schema.json",
  documents: ["src/**/*.ts", "!src/generated/**"],
  generates: {
    "./src/generated/": {
      preset: "client",
      presetConfig: {
        fragmentMasking: false,
      },
      config: {
        documentMode: "string",
        scalars: storefrontApiCustomScalars,
        // The workspace compiles with `verbatimModuleSyntax`, which requires
        // type-only imports to be written as `import type`. Without this the
        // generated file fails typecheck under our own tsconfig.
        useTypeImports: true,
      },
    },
  },
};

export default config;
